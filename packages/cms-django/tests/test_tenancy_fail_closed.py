from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import TestCase, override_settings

from digitalafarin_cms.apps.common.tenancy import (
    TenantScopedViewSetMixin,
    ensure_organization_access,
    ensure_organization_write_access,
    require_organization_id_for_instance,
)
from digitalafarin_cms.apps.content.models import ContentEntry
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class TenancyFailClosedTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="fc-user", password="x")
        self.root = User.objects.create_superuser(username="fc-root", password="x")
        self.org = Organization.objects.create(name="FC", slug="fc")
        Membership.objects.create(organization=self.org, user=self.user, role=Membership.Role.OWNER)
        self.site = Site.objects.create(organization=self.org, name="FC", domain="fc.example")

    def test_none_organization_is_denied_even_for_members_and_superusers(self):
        for user in (self.user, self.root):
            with self.assertRaises(PermissionDenied):
                ensure_organization_access(user, None)
            with self.assertRaises(PermissionDenied):
                ensure_organization_write_access(user, None)

    def test_unresolvable_cms_instance_is_denied(self):
        orphan = ContentEntry()  # no site -> cannot resolve an organization
        with self.assertRaises(PermissionDenied):
            require_organization_id_for_instance(orphan)

    def test_user_model_is_allowlisted_as_non_tenant(self):
        self.assertIsNone(require_organization_id_for_instance(self.user))

    @override_settings(DIGITALAFARIN_CMS_NON_TENANT_MODELS=["digitalafarin_cms_content.contententry"])
    def test_allowlist_is_explicit_and_configurable(self):
        self.assertIsNone(require_organization_id_for_instance(ContentEntry()))

    def test_resolvable_instances_return_their_organization(self):
        self.assertEqual(require_organization_id_for_instance(self.site), self.org.pk)

    def test_serializer_validation_rejects_unresolvable_related_instance(self):
        mixin = TenantScopedViewSetMixin()
        mixin.request = SimpleNamespace(user=self.user)
        serializer = SimpleNamespace(validated_data={"parent": ContentEntry()})
        with self.assertRaises(PermissionDenied):
            mixin.validate_tenant_serializer(serializer, require_write=True)
