import re

from django.utils import timezone
from rest_framework import serializers
from .models import ContentTypeDefinition, ContentEntry, ContentRevision, Category, Tag, ReusableBlock, Menu, MenuItem


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
    ALLOWED_FIELD_TYPES = {
        "text", "textarea", "number", "boolean", "date", "datetime",
        "url", "email", "select", "media", "json",
    }

    class Meta:
        model = ContentTypeDefinition
        fields = "__all__"

    def validate_schema(self, value):
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("schema must be an object")
        fields = value.get("fields", [])
        if not isinstance(fields, list):
            raise serializers.ValidationError("schema.fields must be a list")
        seen = set()
        for index, field in enumerate(fields):
            if not isinstance(field, dict):
                raise serializers.ValidationError(f"Field {index + 1} must be an object")
            key = str(field.get("key", "")).strip()
            field_type = str(field.get("type", "text")).strip() or "text"
            if not key:
                raise serializers.ValidationError(f"Field {index + 1} requires a key")
            if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", key):
                raise serializers.ValidationError(
                    f"Field key '{key}' must start with a letter and contain only letters, numbers and underscores"
                )
            if key in seen:
                raise serializers.ValidationError(f"Duplicate field key: {key}")
            seen.add(key)
            if field_type not in self.ALLOWED_FIELD_TYPES:
                raise serializers.ValidationError(f"Unsupported field type: {field_type}")
            if field_type == "select" and not isinstance(field.get("options", []), list):
                raise serializers.ValidationError(f"Select field '{key}' options must be a list")
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
    content_type_slug=serializers.CharField(source="content_type.slug",read_only=True)
    author=serializers.PrimaryKeyRelatedField(read_only=True)
    author_name=serializers.CharField(source="author.username",read_only=True)
    class Meta:
        model=ContentEntry
        fields="__all__"
        read_only_fields=["published_at"]

    def validate_path(self,value):
        if not value.startswith("/"): value="/"+value
        if "?" in value or "#" in value: raise serializers.ValidationError("Path must not contain query strings or fragments.")
        if value != "/" and not value.endswith("/"): value += "/"
        return value

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

        if site and ctype and ctype.site_id != site.id:
            raise serializers.ValidationError({"content_type":"Content type must belong to the same site."})
        if site and parent and parent.site_id != site.id:
            raise serializers.ValidationError({"parent":"Parent entry must belong to the same site."})
        if would_create_parent_cycle(self.instance, parent):
            raise serializers.ValidationError({"parent": "Content hierarchy cannot contain a cycle."})
        if site and categories is not None and any(item.site_id != site.id for item in categories):
            raise serializers.ValidationError({"categories":"All categories must belong to the same site."})
        if site and tags is not None and any(item.site_id != site.id for item in tags):
            raise serializers.ValidationError({"tags":"All tags must belong to the same site."})

        if ctype:
            required=[x.get("key") for x in ctype.schema.get("fields",[]) if x.get("required")]
            missing=[key for key in required if key and custom.get(key) in (None,"")]
            if missing: raise serializers.ValidationError({"custom_fields":f"Missing required fields: {', '.join(missing)}"})

        if status == ContentEntry.Status.SCHEDULED:
            if not scheduled_at:
                raise serializers.ValidationError({"scheduled_at": "Scheduled content requires scheduled_at."})
            if scheduled_at <= timezone.now():
                raise serializers.ValidationError({"scheduled_at": "scheduled_at must be in the future."})
        return attrs


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
