from copy import deepcopy

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import (
    ComponentBindingApprovalEvent, ComponentBindingDraft, ComponentBindingRevision,
)
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class ComponentApprovalTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Approval Org", slug="approval-org")
        self.site = Site.objects.create(organization=self.org, name="Approval", domain="approve.test")
        User = get_user_model()
        self.owner = User.objects.create_user(username="approval-owner")
        self.admin = User.objects.create_user(username="approval-admin")
        self.editor = User.objects.create_user(username="approval-editor")
        self.viewer = User.objects.create_user(username="approval-viewer")
        for user, role in (
            (self.owner, Membership.Role.OWNER),
            (self.admin, Membership.Role.ADMIN),
            (self.editor, Membership.Role.EDITOR),
            (self.viewer, Membership.Role.VIEWER),
        ):
            Membership.objects.create(organization=self.org, user=user, role=role)
        self.client = self.auth(self.owner)
        self.slots = [{
            "id": "Hero", "route": "/", "component": "HeroSection",
            "props": {"title": "content.title"}, "required": ["title"],
        }]
        created = self.client.post("/api/cms/v1/content/component-bindings/", {
            "site": str(self.site.pk), "host_key": "primary", "slots": self.slots,
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.id = created.data["id"]
        self.url = f"/api/cms/v1/content/component-bindings/{self.id}/"

    def auth(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def approve(self, target, *, expected=None, draft_version=1, client=None, action="approve", reason=""):
        return (client or self.client).post(self.url + action + "/", {
            "confirm": True,
            "target_version": target,
            "expected_approved_version": expected,
            "expected_draft_version": draft_version,
            "reason": reason,
        }, format="json")

    def modify(self):
        next_slots = deepcopy(self.slots)
        next_slots[0]["props"]["title"] = "content.excerpt"
        result = self.auth(self.editor).patch(self.url, {
            "expected_version": 1, "slots": next_slots,
        }, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        return next_slots

    def test_approve_then_edit_keeps_approved_snapshot_immutable(self):
        first = self.approve(1)
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(first.data["approved_version"], 1)
        self.assertEqual(first.data["runtime_status"], "unverified")
        manifest = self.client.get(self.url + "approved-manifest/")
        self.assertEqual(manifest.status_code, 200, manifest.data)
        self.assertEqual(manifest.data["slots"], self.slots)
        self.assertEqual(len(manifest.data["sha256"]), 64)
        changed = self.modify()
        state = self.client.get(self.url + "approval/")
        self.assertEqual(state.status_code, 200, state.data)
        self.assertEqual(state.data["draft_version"], 2)
        self.assertEqual(state.data["approved_version"], 1)
        self.assertTrue(state.data["has_unapproved_changes"])
        still_approved = self.client.get(self.url + "approved-manifest/")
        self.assertEqual(still_approved.data["slots"], self.slots)
        self.assertNotEqual(still_approved.data["slots"], changed)
        self.assertEqual(ComponentBindingApprovalEvent.objects.filter(draft_id=self.id).count(), 1)

    def test_approval_then_rollback_to_previously_approved_version(self):
        self.assertEqual(self.approve(1).status_code, 200)
        self.modify()
        promoted = self.approve(2, expected=1, draft_version=2)
        self.assertEqual(promoted.status_code, 200, promoted.data)
        self.assertEqual(promoted.data["approved_version"], 2)
        rollback = self.approve(1, expected=2, draft_version=2, action="rollback-approval",
                                reason="Host validation failed")
        self.assertEqual(rollback.status_code, 200, rollback.data)
        self.assertEqual(rollback.data["approved_version"], 1)
        self.assertEqual(ComponentBindingDraft.objects.get(pk=self.id).version, 2)
        manifest = self.client.get(self.url + "approved-manifest/")
        self.assertEqual(manifest.data["slots"], self.slots)
        events = list(ComponentBindingApprovalEvent.objects.filter(draft_id=self.id))
        self.assertEqual(len(events), 3)
        self.assertEqual(events[0].action, "rollback")
        self.assertEqual(events[0].from_version, 2)
        self.assertEqual(events[0].to_version, 1)
        self.assertEqual(events[0].reason, "Host validation failed")

    def test_unapproved_version_and_stale_expectations_are_rejected(self):
        self.modify()
        self.assertEqual(self.approve(1, draft_version=2).status_code, 400)
        self.assertEqual(self.approve(2, draft_version=1).status_code, 409)
        first = self.approve(2, draft_version=2)
        self.assertEqual(first.status_code, 200, first.data)
        duplicate = self.approve(2, expected=None, draft_version=2)
        self.assertEqual(duplicate.status_code, 409)
        never_approved = self.approve(1, expected=2, draft_version=2, action="rollback-approval", reason="Oops")
        self.assertEqual(never_approved.status_code, 400)
        self.assertEqual(ComponentBindingApprovalEvent.objects.count(), 1)

    def test_approvals_require_explicit_acknowledgement_and_rollback_reason(self):
        missing = self.client.post(self.url + "approve/", {
            "confirm": True, "target_version": 1, "expected_draft_version": 1,
        }, format="json")
        self.assertEqual(missing.status_code, 400)
        no_confirmation = self.client.post(self.url + "approve/", {
            "confirm": False, "target_version": 1,
            "expected_approved_version": None, "expected_draft_version": 1,
        }, format="json")
        self.assertEqual(no_confirmation.status_code, 400)
        self.assertEqual(self.approve(1).status_code, 200)
        self.modify()
        self.assertEqual(self.approve(2, expected=1, draft_version=2).status_code, 200)
        no_reason = self.approve(1, expected=2, draft_version=2, action="rollback-approval")
        self.assertEqual(no_reason.status_code, 400)

    def test_only_owner_admin_can_approve_not_editor(self):
        denied = self.approve(1, client=self.auth(self.editor))
        self.assertEqual(denied.status_code, 403)
        denied_viewer = self.approve(1, client=self.auth(self.viewer))
        self.assertEqual(denied_viewer.status_code, 403)
        allowed = self.approve(1, client=self.auth(self.admin))
        self.assertEqual(allowed.status_code, 200, allowed.data)

    def test_other_tenants_cannot_read_or_approve(self):
        foreign_org = Organization.objects.create(name="Other", slug="approval-foreign")
        foreign = get_user_model().objects.create_user(username="approval-outsider")
        Membership.objects.create(organization=foreign_org, user=foreign, role=Membership.Role.OWNER)
        client = self.auth(foreign)
        self.assertEqual(client.get(self.url + "approval/").status_code, 404)
        self.assertEqual(client.get(self.url + "approved-manifest/").status_code, 404)
        self.assertEqual(self.approve(1, client=client).status_code, 404)
        self.assertEqual(APIClient().get(self.url + "approved-manifest/").status_code, 401)

    def test_manually_modified_revision_fails_export_checksum(self):
        self.assertEqual(self.approve(1).status_code, 200)
        rev = ComponentBindingRevision.objects.get(draft_id=self.id, version=1)
        rev.slots = []
        rev.save(update_fields=["slots", "updated_at"])
        response = self.client.get(self.url + "approved-manifest/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.data)
