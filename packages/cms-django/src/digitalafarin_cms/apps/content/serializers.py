from rest_framework import serializers
from .models import ContentTypeDefinition, ContentEntry, ContentRevision, Category, Tag, ReusableBlock, Menu, MenuItem

class ContentTypeSerializer(serializers.ModelSerializer):
    class Meta: model=ContentTypeDefinition; fields="__all__"
class CategorySerializer(serializers.ModelSerializer):
    class Meta: model=Category; fields="__all__"
    def validate(self, attrs):
        site = attrs.get("site") or getattr(self.instance, "site", None)
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        if site and parent and parent.site_id != site.id:
            raise serializers.ValidationError({"parent": "Parent category must belong to the same site."})
        return attrs
class TagSerializer(serializers.ModelSerializer):
    class Meta: model=Tag; fields="__all__"
class ContentEntrySerializer(serializers.ModelSerializer):
    content_type_slug=serializers.CharField(source="content_type.slug",read_only=True)
    author=serializers.PrimaryKeyRelatedField(read_only=True)
    author_name=serializers.CharField(source="author.username",read_only=True)
    class Meta: model=ContentEntry; fields="__all__"
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

        if site and ctype and ctype.site_id != site.id:
            raise serializers.ValidationError({"content_type":"Content type must belong to the same site."})
        if site and parent and parent.site_id != site.id:
            raise serializers.ValidationError({"parent":"Parent entry must belong to the same site."})
        if site and categories is not None and any(item.site_id != site.id for item in categories):
            raise serializers.ValidationError({"categories":"All categories must belong to the same site."})
        if site and tags is not None and any(item.site_id != site.id for item in tags):
            raise serializers.ValidationError({"tags":"All tags must belong to the same site."})

        if ctype:
            required=[x.get("key") for x in ctype.schema.get("fields",[]) if x.get("required")]
            missing=[key for key in required if key and custom.get(key) in (None,"")]
            if missing: raise serializers.ValidationError({"custom_fields":f"Missing required fields: {', '.join(missing)}"})
        return attrs
class ContentRevisionSerializer(serializers.ModelSerializer):
    class Meta: model=ContentRevision; fields="__all__"
class ReusableBlockSerializer(serializers.ModelSerializer):
    class Meta: model=ReusableBlock; fields="__all__"
class MenuItemSerializer(serializers.ModelSerializer):
    children=serializers.SerializerMethodField()
    class Meta: model=MenuItem; fields="__all__"
    def get_children(self,obj): return MenuItemSerializer(obj.children.all(),many=True).data
class MenuSerializer(serializers.ModelSerializer):
    items=serializers.SerializerMethodField()
    class Meta: model=Menu; fields="__all__"
    def get_items(self,obj): return MenuItemSerializer(obj.items.filter(parent__isnull=True),many=True).data
