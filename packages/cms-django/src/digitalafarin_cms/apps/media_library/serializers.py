from rest_framework import serializers
from .models import MediaAsset
class MediaAssetSerializer(serializers.ModelSerializer):
    url=serializers.SerializerMethodField()
    class Meta: model=MediaAsset; fields="__all__"; read_only_fields=["filename","mime_type","size_bytes","uploaded_by"]
    def get_url(self,obj):
        request=self.context.get("request")
        return request.build_absolute_uri(obj.file.url) if request and obj.file else (obj.file.url if obj.file else None)
