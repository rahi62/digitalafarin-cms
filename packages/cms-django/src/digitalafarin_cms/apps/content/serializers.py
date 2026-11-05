import re
from datetime import date, datetime

from django.core.validators import URLValidator, validate_email

from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework import serializers
from .models import ContentTypeDefinition, ContentEntry, ContentRevision, Category, Tag, ReusableBlock, Menu, MenuItem
from .field_schema import validate_schema_fields, validate_field_values, find_breaking_schema_changes, relation_targets


def would_create_parent_cycle(instance, parent):
    if instance is None or parent is None:
        return False
    current = parent
    seen = set()
    while current is not None:
        if current.pk == instance.pk:
            return True
        if current.pk in seen:
            return True
        seen.add(current.pk)
        current = getattr(current, "parent", None)
    return False


class ContentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContentTypeDefinition
        fields = "__all__"

    def validate(self, attrs):
        from .routing import validate_type_routing, validate_collection_claim
        try:
            collection, pattern = validate_type_routing(
                attrs.get("collection_path", getattr(self.instance, "collection_path", "")),
                attrs.get("entry_path_pattern", getattr(self.instance, "entry_path_pattern", "")),
            )
            site = attrs.get("site", getattr(self.instance, "site", None))
            if site:
                validate_collection_claim(site.pk, collection, self.instance)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"entry_path_pattern": exc.messages})
        next_schema = attrs.get("schema")
        if next_schema is not None and site is not None:
            current_slug = attrs.get("slug", getattr(self.instance, "slug", None))
            for target_slug in relation_targets(next_schema.get("fields", [])):
                if target_slug == current_slug:
                    continue  # Self-reference is allowed.
                if not ContentTypeDefinition.objects.filter(site_id=site.pk, slug=target_slug).exists():
                    raise serializers.ValidationError({"schema": f"Related content type '{target_slug}' does not exist on this site."})
        if self.instance is not None and next_schema is not None:
            # Replacing a live schema silently would strand historical custom_fields.
            if self.instance.entries.exists():
                issues = find_breaking_schema_changes(
                    (self.instance.schema or {}).get("fields", []),
                    (next_schema or {}).get("fields", []),
                )
                if issues:
                    raise serializers.ValidationError({"schema": issues})
        kind = attrs.get("kind", getattr(self.instance, "kind", "collection"))
        if kind == ContentTypeDefinition.Kind.SINGLETON and (collection or pattern):
            raise serializers.ValidationError({
                "kind": "Singleton content types use one manually routed entry, not a collection URL or entry pattern."
            })
        if self.instance is not None:
            if self.instance.entries.exists() and kind != self.instance.kind:
                raise serializers.ValidationError({
                    "kind": "Changing collection/singleton semantics with existing entries requires a data migration."
                })
            if self.instance.entries.exists() and site.pk != self.instance.site_id:
                raise serializers.ValidationError({"site": "Move existing entries via an explicit tenant migration."})
            old_slug = self.instance.slug
            if attrs.get("slug", old_slug) != old_slug:
                other_schemas = ContentTypeDefinition.objects.filter(site_id=self.instance.site_id).exclude(pk=self.instance.pk)
                if any(old_slug in relation_targets((ct.schema or {}).get("fields", [])) for ct in other_schemas):
                    raise serializers.ValidationError({
                        "slug": "Other content schemas refer to this type. Update their relationships in a controlled migration first."
                    })
        attrs.update(collection_path=collection, entry_path_pattern=pattern)
        return attrs

    def save(self, **kwargs):
        try:
            return super().save(**kwargs)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(getattr(exc, "message_dict", {"collection_path": exc.messages}))

    def validate_schema(self, value):
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Schema must be an object")
        validate_schema_fields(value.get("fields", []))
        return value


class CategorySerializer(serializers.ModelSerializer):
    class Meta: model=Category; fields="__all__"
    def validate(self, attrs):
        site = attrs.get("site") or getattr(self.instance, "site", None)
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        if site and parent and parent.site_id != site.id:
            raise serializers.ValidationError({"parent": "Parent category must belong to the same site."})
        if would_create_parent_cycle(self.instance, parent):
            raise serializers.ValidationError({"parent": "Category hierarchy cannot contain a cycle."})
        return attrs


class TagSerializer(serializers.ModelSerializer):
    class Meta: model=Tag; fields="__all__"


class ContentEntrySerializer(serializers.ModelSerializer):
    url=serializers.SerializerMethodField()
    content_type_slug=serializers.CharField(source="content_type.slug",read_only=True)
    author=serializers.PrimaryKeyRelatedField(read_only=True)
    author_name=serializers.CharField(source="author.username",read_only=True)
    def get_url(self, obj):
        from .views import frontend_base_for
        return frontend_base_for(obj.site) + obj.path
    class Meta:
        model=ContentEntry
        fields="__all__"
        read_only_fields=["published_at", "singleton_slot", "deleted_at", "deleted_by"]
        extra_kwargs={"path": {"required": False, "allow_blank": True}}
        validators=[]  # The final computed route is validated below and under a site lock on save.

    def validate_path(self,value):
        return value

    def save(self, **kwargs):
        try:
            return super().save(**kwargs)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(getattr(exc, "message_dict", {"path": exc.messages}))
        except IntegrityError:
            raise serializers.ValidationError({"non_field_errors": "A conflicting route or singleton record already exists."})

    def validate_blocks(self,value):
        if not isinstance(value,list): raise serializers.ValidationError("blocks must be a list")
        for i,block in enumerate(value):
            if not isinstance(block,dict) or not block.get("type") or not isinstance(block.get("data",{}),dict):
                raise serializers.ValidationError(f"Invalid block at index {i}; each block requires type and data object")
        return value

    def validate(self,attrs):
        site=attrs.get("site") or getattr(self.instance,"site",None)
        ctype=attrs.get("content_type") or getattr(self.instance,"content_type",None)
        parent=attrs.get("parent", getattr(self.instance,"parent",None))
        categories=attrs.get("categories")
        tags=attrs.get("tags")
        custom=attrs.get("custom_fields", getattr(self.instance,"custom_fields",{})) or {}
        status=attrs.get("status", getattr(self.instance,"status",ContentEntry.Status.DRAFT))
        scheduled_at=attrs.get("scheduled_at", getattr(self.instance,"scheduled_at",None))

        if self.instance is not None and hasattr(self.instance, "published_copy"):
            if site is not None and site.pk != self.instance.site_id:
                raise serializers.ValidationError({"site": "Unpublish this entry before moving it to another site."})
            if ctype is not None and ctype.pk != self.instance.content_type_id:
                raise serializers.ValidationError({"content_type": "Unpublish this entry before changing its content type."})

        if site and ctype and ctype.site_id != site.id:
            raise serializers.ValidationError({"content_type":"Content type must belong to the same site."})
        if ctype and ctype.kind == ContentTypeDefinition.Kind.SINGLETON:
            requested_mode = attrs.get("path_mode", getattr(self.instance, "path_mode", "manual"))
            if requested_mode != "manual":
                raise serializers.ValidationError({"path_mode": "Singleton pages require a manual route."})
        if site and parent and parent.site_id != site.id:
            raise serializers.ValidationError({"parent":"Parent entry must belong to the same site."})
        if would_create_parent_cycle(self.instance, parent):
            raise serializers.ValidationError({"parent": "Content hierarchy cannot contain a cycle."})
        if site and categories is not None and any(item.site_id != site.id for item in categories):
            raise serializers.ValidationError({"categories":"All categories must belong to the same site."})
        if site and tags is not None and any(item.site_id != site.id for item in tags):
            raise serializers.ValidationError({"tags":"All tags must belong to the same site."})

        if ctype:
            try:
                validate_field_values((ctype.schema or {}).get("fields", []), custom, site)
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({"custom_fields": exc.detail})

        if status == ContentEntry.Status.SCHEDULED:
            if not scheduled_at:
                raise serializers.ValidationError({"scheduled_at": "Scheduled content requires scheduled_at."})
            if scheduled_at <= timezone.now():
                raise serializers.ValidationError({"scheduled_at": "scheduled_at must be in the future."})
        if site and ctype:
            from .routing import validate_entry_route
            mode = attrs.get("path_mode", getattr(self.instance, "path_mode", "auto" if ctype.entry_path_pattern else "manual"))
            candidate = ContentEntry(
                pk=getattr(self.instance, "pk", None), site=site, content_type=ctype,
                slug=attrs.get("slug", getattr(self.instance, "slug", "")),
                path=attrs.get("path", getattr(self.instance, "path", "")), path_mode=mode,
            )
            try:
                attrs["path"] = validate_entry_route(candidate, self.instance)
                attrs["slug"] = candidate.slug
                attrs["path_mode"] = mode
            except DjangoValidationError as exc:
                raise serializers.ValidationError(getattr(exc, "message_dict", {"path": exc.messages}))
        return attrs

    def to_representation(self, instance):
        from digitalafarin_cms.media import normalize_media_data
        return normalize_media_data(super().to_representation(instance))


class ContentRevisionSerializer(serializers.ModelSerializer):
    created_by_name=serializers.CharField(source="created_by.username",read_only=True)
    class Meta: model=ContentRevision; fields="__all__"


class ReusableBlockSerializer(serializers.ModelSerializer):
    class Meta: model=ReusableBlock; fields="__all__"


class MenuItemSerializer(serializers.ModelSerializer):
    children=serializers.SerializerMethodField()
    class Meta: model=MenuItem; fields="__all__"
    def get_children(self,obj): return MenuItemSerializer(obj.children.all(),many=True).data
    def validate(self, attrs):
        menu = attrs.get("menu") or getattr(self.instance, "menu", None)
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        if menu and parent and parent.menu_id != menu.id:
            raise serializers.ValidationError({"parent": "Parent menu item must belong to the same menu."})
        if would_create_parent_cycle(self.instance, parent):
            raise serializers.ValidationError({"parent": "Menu hierarchy cannot contain a cycle."})
        return attrs


class MenuSerializer(serializers.ModelSerializer):
    items=serializers.SerializerMethodField()
    class Meta: model=Menu; fields="__all__"
    def get_items(self,obj): return MenuItemSerializer(obj.items.filter(parent__isnull=True),many=True).data
