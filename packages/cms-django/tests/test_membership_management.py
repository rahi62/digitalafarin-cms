from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.sites.models import Membership, Organization


class MembershipUiApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="member-owner", password="x")
        self.admin = User.objects.create_user(username="member-admin", password="x")
        self.writer = User.objects.create_user(username="member-writer", password="x")
        self.new_user = User.objects.create_user(username="member-new", password="x")
        self.outsider = User.objects.create_user(username="member-outsider", password="x")
        self.org = Organization.objects.create(name="Member Org", slug="member-org")
        self.other_org = Organization.objects.create(name="Other Member Org", slug="other-member-org")
        self.owner_member = Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        self.admin_member = Membership.objects.create(organization=self.org, user=self.admin, role=Membership.Role.ADMIN)
        Membership.objects.create(organization=self.org, user=self.writer, role=Membership.Role.WRITER)
        Membership.objects.create(organization=self.other_org, user=self.outsider, role=Membership.Role.OWNER)

    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_owner_adds_existing_username_and_can_update_role(self):
        res = self.api(self.owner).post("/api/cms/v1/memberships/", {
            "organization": str(self.org.pk), "user_identifier": "member-new", "role": "editor",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["username"], "member-new")
        self.assertEqual(res.data["role"], "editor")
        updated = self.api(self.owner).patch(
            f"/api/cms/v1/memberships/{res.data['id']}/", {"role": "seo"}, format="json",
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["role"], "seo")

    def test_writer_cannot_probe_accounts_or_invite(self):
        for username in ("member-new", "definitely-unknown-account"):
            res = self.api(self.writer).post("/api/cms/v1/memberships/", {
                "organization": str(self.org.pk), "user_identifier": username, "role": "viewer",
            }, format="json")
            self.assertEqual(res.status_code, 403)

    def test_cross_organization_invitation_is_denied(self):
        res = self.api(self.admin).post("/api/cms/v1/memberships/", {
            "organization": str(self.other_org.pk), "user_identifier": "member-new",
        }, format="json")
        self.assertEqual(res.status_code, 403)

    def test_admin_cannot_grant_or_remove_owner_role(self):
        grant = self.api(self.admin).post("/api/cms/v1/memberships/", {
            "organization": str(self.org.pk), "user_identifier": "member-new", "role": "owner",
        }, format="json")
        self.assertEqual(grant.status_code, 403)
        promote = self.api(self.admin).patch(
            f"/api/cms/v1/memberships/{self.admin_member.pk}/", {"role": "owner"}, format="json",
        )
        self.assertEqual(promote.status_code, 403)
        demote = self.api(self.admin).patch(
            f"/api/cms/v1/memberships/{self.owner_member.pk}/", {"role": "viewer"}, format="json",
        )
        self.assertEqual(demote.status_code, 403)

    def test_last_owner_cannot_be_demoted_or_removed(self):
        client = self.api(self.owner)
        demote = client.patch(f"/api/cms/v1/memberships/{self.owner_member.pk}/", {"role": "admin"}, format="json")
        self.assertEqual(demote.status_code, 400)
        delete = client.delete(f"/api/cms/v1/memberships/{self.owner_member.pk}/")
        self.assertEqual(delete.status_code, 400)
        self.assertTrue(Membership.objects.filter(pk=self.owner_member.pk, role="owner").exists())

    def test_owner_can_create_second_owner_then_revoke_first(self):
        client = self.api(self.owner)
        created = client.post("/api/cms/v1/memberships/", {
            "organization": str(self.org.pk), "user_identifier": "member-new", "role": "owner",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        removed = client.delete(f"/api/cms/v1/memberships/{self.owner_member.pk}/")
        self.assertEqual(removed.status_code, 204)

    def test_update_cannot_move_user_or_organization(self):
        res = self.api(self.owner).patch(
            f"/api/cms/v1/memberships/{self.admin_member.pk}/",
            {"user": str(self.new_user.pk), "organization": str(self.other_org.pk)},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.admin_member.refresh_from_db()
        self.assertEqual(self.admin_member.organization_id, self.org.pk)
        self.assertEqual(self.admin_member.user_id, self.admin.pk)
