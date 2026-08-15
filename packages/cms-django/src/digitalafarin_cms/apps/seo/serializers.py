from rest_framework import serializers
from .models import SeoMeta, SchemaMarkup, KeywordCluster, Keyword, KeywordMapping, Redirect, InternalLinkSuggestion


class SeoMetaSerializer(serializers.ModelSerializer):
    entry_title = serializers.CharField(source="entry.title", read_only=True)
    class Meta:
        model = SeoMeta
        fields = "__all__"


class SchemaMarkupSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchemaMarkup
        fields = "__all__"


class KeywordClusterSerializer(serializers.ModelSerializer):
    class Meta:
        model = KeywordCluster
        fields = "__all__"

    def validate(self, attrs):
        site = attrs.get("site") or getattr(self.instance, "site", None)
        pillar = attrs.get("pillar_entry", getattr(self.instance, "pillar_entry", None))
        if site and pillar and pillar.site_id != site.id:
            raise serializers.ValidationError({"pillar_entry": "Pillar entry must belong to the same site."})
        return attrs


class KeywordSerializer(serializers.ModelSerializer):
    class Meta:
        model = Keyword
        fields = "__all__"

    def validate(self, attrs):
        site = attrs.get("site") or getattr(self.instance, "site", None)
        cluster = attrs.get("cluster", getattr(self.instance, "cluster", None))
        if site and cluster and cluster.site_id != site.id:
            raise serializers.ValidationError({"cluster": "Keyword cluster must belong to the same site."})
        return attrs


class KeywordMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = KeywordMapping
        fields = "__all__"

    def validate(self, attrs):
        keyword = attrs.get("keyword") or getattr(self.instance, "keyword", None)
        entry = attrs.get("entry") or getattr(self.instance, "entry", None)
        if keyword and entry and keyword.site_id != entry.site_id:
            raise serializers.ValidationError("Keyword and entry must belong to the same site.")
        return attrs


class RedirectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Redirect
        fields = "__all__"


class InternalLinkSuggestionSerializer(serializers.ModelSerializer):
    source_title = serializers.CharField(source="source_entry.title", read_only=True)
    target_title = serializers.CharField(source="target_entry.title", read_only=True)
    class Meta:
        model = InternalLinkSuggestion
        fields = "__all__"

    def validate(self, attrs):
        source = attrs.get("source_entry") or getattr(self.instance, "source_entry", None)
        target = attrs.get("target_entry") or getattr(self.instance, "target_entry", None)
        if source and target and source.site_id != target.site_id:
            raise serializers.ValidationError("Internal-link endpoints must belong to the same site.")
        if source and target and source.pk == target.pk:
            raise serializers.ValidationError("An entry cannot suggest an internal link to itself.")
        return attrs
