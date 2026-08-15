from rest_framework import serializers
from .models import AuditRun, AuditIssue
class AuditRunSerializer(serializers.ModelSerializer):
    issue_count=serializers.IntegerField(source="issues.count",read_only=True)
    class Meta: model=AuditRun; fields="__all__"
class AuditIssueSerializer(serializers.ModelSerializer):
    class Meta: model=AuditIssue; fields="__all__"
