from rest_framework import serializers

from .models import Membership, Organization, Site
from .site_settings import validate_site_settings


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = "__all__"


class SiteSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = Site
        fields = "__all__"

    def validate_settings(self, value):
        return validate_site_settings(value)


class MembershipSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Membership
        fields = "__all__"
