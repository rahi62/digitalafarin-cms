from rest_framework import serializers
from .models import Organization, Site, Membership
class OrganizationSerializer(serializers.ModelSerializer):
    class Meta: model=Organization; fields="__all__"
class SiteSerializer(serializers.ModelSerializer):
    organization_name=serializers.CharField(source="organization.name", read_only=True)
    class Meta: model=Site; fields="__all__"
class MembershipSerializer(serializers.ModelSerializer):
    username=serializers.CharField(source="user.username", read_only=True)
    class Meta: model=Membership; fields="__all__"
