from rest_framework import serializers
from .models import MediaAsset
class MediaAssetSerializer(serializers.ModelSerializer):
    url=serializers.SerializerMethodField()
    class Meta: model=MediaAsset; fields="__all__"; read_only_fields=["filename","mime_type","size_bytes","uploaded_by"]
    def get_url(self,obj):
        from digitalafarin_cms.media import public_media_url
        return public_media_url(obj.file.url) if obj.file else None

    def to_representation(self, instance):
        result = super().to_representation(instance)
        result["file"] = result["url"]
        return result
