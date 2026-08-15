from rest_framework import serializers

from .models import AuditIssue, AuditPage, AuditRun


class AuditRunSerializer(serializers.ModelSerializer):
    issue_count = serializers.IntegerField(source="issues.count", read_only=True)
    page_count = serializers.IntegerField(source="pages.count", read_only=True)
    site_name = serializers.CharField(source="site.name", read_only=True)
    site_domain = serializers.CharField(source="site.domain", read_only=True)

    class Meta:
        model = AuditRun
        fields = "__all__"
        read_only_fields = [
            "status",
            "started_at",
            "finished_at",
            "pages_crawled",
            "health_score",
            "summary",
        ]

    def validate_max_pages(self, value):
        if value < 1 or value > 500:
            raise serializers.ValidationError("max_pages must be between 1 and 500.")
        return value


class AuditPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditPage
        fields = "__all__"
        read_only_fields = fields


class AuditIssueSerializer(serializers.ModelSerializer):
    page_path = serializers.CharField(source="page.path", read_only=True)

    class Meta:
        model = AuditIssue
        fields = "__all__"
        read_only_fields = [
            "run",
            "page",
            "url",
            "code",
            "severity",
            "title",
            "details",
        ]
