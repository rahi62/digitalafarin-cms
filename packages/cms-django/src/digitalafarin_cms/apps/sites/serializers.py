from rest_framework import serializers
from django.contrib.auth import get_user_model
from digitalafarin_cms.apps.common.tenancy import ensure_organization_roles

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
    username = serializers.CharField(source="user.get_username", read_only=True)
    user_identifier = serializers.CharField(write_only=True, required=False, trim_whitespace=True)

    class Meta:
        model = Membership
        fields = "__all__"
        extra_kwargs = {"user": {"required": False}}
        # Username resolves to user after field validation; the DB unique constraint remains authoritative.
        validators = []

    def validate(self, attrs):
        request = self.context.get("request")
        if self.instance is not None:
            if any(name in attrs for name in ("user", "organization", "user_identifier")):
                raise serializers.ValidationError("Membership user and organization cannot be changed.")
            return attrs

        organization = attrs.get("organization")
        if organization is None:
            raise serializers.ValidationError({"organization": "Organization is required."})
        if request is None:
            raise serializers.ValidationError("Authenticated request is required.")

        # Check authorization *before* username lookup to avoid account enumeration.
        ensure_organization_roles(
            request.user, organization.id, (Membership.Role.OWNER, Membership.Role.ADMIN),
            "Owner or Admin role is required to manage memberships.",
        )
        identifier = attrs.pop("user_identifier", "")
        if identifier:
            if "user" in attrs:
                raise serializers.ValidationError({"user_identifier": "Supply either user or username, not both."})
            User = get_user_model()
            try:
                attrs["user"] = User._default_manager.get(**{User.USERNAME_FIELD: identifier})
            except User.DoesNotExist:
                raise serializers.ValidationError({"user_identifier": "This account does not exist in Django."})
        if "user" not in attrs:
            raise serializers.ValidationError({"user_identifier": "Enter an existing Django account username."})
        if attrs.get("role", Membership.Role.VIEWER) == Membership.Role.OWNER:
            ensure_organization_roles(
                request.user, organization.id, (Membership.Role.OWNER,),
                "Only owners can assign another owner.",
            )
        if Membership.objects.filter(organization=organization, user=attrs["user"]).exists():
            raise serializers.ValidationError({"user_identifier": "This account already belongs to the organization."})
        return attrs
