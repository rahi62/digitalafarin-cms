from rest_framework import serializers

from digitalafarin_cms.apps.sites.models import Site
from .models import SearchImportRun, SearchPerformanceDaily, WebhookEndpoint


class WebhookEndpointSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookEndpoint
        fields = "__all__"
        extra_kwargs = {"secret": {"write_only": True}}


class SearchPerformanceDailySerializer(serializers.ModelSerializer):
    site_name = serializers.CharField(source="site.name", read_only=True)
    entry_title = serializers.CharField(source="entry.title", read_only=True)

    class Meta:
        model = SearchPerformanceDaily
        fields = "__all__"
        read_only_fields = ["entry"]


class SearchImportRunSerializer(serializers.ModelSerializer):
    site_name = serializers.CharField(source="site.name", read_only=True)

    class Meta:
        model = SearchImportRun
        fields = "__all__"


class SearchPerformanceImportRowSerializer(serializers.Serializer):
    date = serializers.DateField()
    page = serializers.CharField(max_length=2000)
    clicks = serializers.IntegerField(min_value=0)
    impressions = serializers.IntegerField(min_value=0)
    ctr = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=100)
    position = serializers.FloatField(min_value=0)
    top_queries = serializers.JSONField(required=False, default=list)

    def validate(self, attrs):
        impressions = attrs.get("impressions", 0)
        clicks = attrs.get("clicks", 0)
        if clicks > impressions:
            raise serializers.ValidationError("clicks cannot exceed impressions")
        return attrs


class SearchPerformanceImportSerializer(serializers.Serializer):
    site = serializers.PrimaryKeyRelatedField(queryset=Site.objects.select_related("organization").all())
    provider = serializers.ChoiceField(choices=SearchImportRun.Provider.choices, default=SearchImportRun.Provider.MANUAL)
    source_label = serializers.CharField(max_length=160, required=False, allow_blank=True, default="")
    rows = SearchPerformanceImportRowSerializer(many=True)

    def validate_rows(self, rows):
        if not rows:
            raise serializers.ValidationError("At least one row is required")
        if len(rows) > 5000:
            raise serializers.ValidationError("A single import is limited to 5000 rows")
        return rows
