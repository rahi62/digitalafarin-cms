from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ComponentBindingDraft, ComponentBindingRevision
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class ComponentBindingDraftTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Component Agency", slug="component-agency")
        self.site = Site.objects.create(organization=self.org, name="Example", domain="component.test")
        User = get_user_model()
        self.owner = User.objects.create_user(username="component-owner")
        self.editor = User.objects.create_user(username="component-editor")
        self.writer = User.objects.create_user(username="component-writer")
        Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        Membership.objects.create(organization=self.org, user=self.editor, role=Membership.Role.EDITOR)
        Membership.objects.create(organization=self.org, user=self.writer, role=Membership.Role.WRITER)
        self.client = self.auth(self.owner)
        self.draft_path = "/api/cms/v1/content/component-bindings/"
        self.slot = [{
            "id": "HomeHero", "component": "HeroSection", "route": "/",
            "props": {"title": "content.custom_fields.hero.title", "seoTitle": "seo.title"},
            "required": ["title"],
        }]

    def auth(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def create(self, client=None, host_key="main"):
        return (client or self.client).post(self.draft_path, {
            "site": str(self.site.pk), "host_key": host_key, "slots": self.slot,
        }, format="json")

    def test_create_edit_revisions_and_stale_version_conflict(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["version"], 1)
        pk = response.data["id"]
        self.assertEqual(ComponentBindingRevision.objects.filter(draft_id=pk).count(), 1)
        updated = self.client.patch(self.draft_path + pk + "/", {
            "expected_version": 1,
            "slots": [{**self.slot[0], "props": {"title": "content.title"}}],
        }, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["version"], 2)
        self.assertEqual(ComponentBindingRevision.objects.filter(draft_id=pk).count(), 2)
        stale = self.client.patch(self.draft_path + pk + "/", {
            "expected_version": 1, "slots": self.slot,
        }, format="json")
        self.assertEqual(stale.status_code, 409, stale.data)
        history = self.client.get(self.draft_path + pk + "/history/")
        self.assertEqual(history.status_code, 200, history.data)
        self.assertEqual([item["version"] for item in history.data["results"]], [2, 1])
        first = ComponentBindingRevision.objects.get(draft_id=pk, version=1)
        self.assertEqual(first.slots, self.slot)
        self.assertEqual(ComponentBindingDraft.objects.get(pk=pk).version, 2)

    def test_invalid_sources_and_forbidden_route_ownership_are_rejected(self):
        invalid_cases = [
            {**self.slot[0], "route": "/api/private/"},
            {**self.slot[0], "route": "/blog/[slug]/"},
            {**self.slot[0], "props": {"danger": "site.__proto__"}},
            {**self.slot[0], "props": {"danger": "secret.value"}},
            {**self.slot[0], "props": {"title": "content.custom_fields.constructor"}},
            {**self.slot[0], "required": ["missing"]},
        ]
        for index, slot in enumerate(invalid_cases):
            with self.subTest(index=index):
                response = self.client.post(self.draft_path, {
                    "site": str(self.site.pk), "host_key": f"bad-{index}", "slots": [slot],
                }, format="json")
                self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(ComponentBindingDraft.objects.exists())

    def test_duplicate_host_key_readonly_history_and_delete_disabled(self):
        first = self.create()
        self.assertEqual(first.status_code, 201)
        duplicate = self.create()
        self.assertEqual(duplicate.status_code, 400, duplicate.data)
        self.assertEqual(self.client.delete(self.draft_path + first.data["id"] + "/").status_code, 405)
        wrong_version = self.client.patch(self.draft_path + first.data["id"] + "/", {
            "slots": self.slot,
        }, format="json")
        self.assertEqual(wrong_version.status_code, 400)

    def test_site_isolation_and_role_permissions(self):
        first = self.create()
        self.assertEqual(first.status_code, 201, first.data)
        pk = first.data["id"]
        writer = self.auth(self.writer)
        self.assertEqual(writer.get(self.draft_path + pk + "/").status_code, 200)
        self.assertEqual(writer.patch(self.draft_path + pk + "/", {
            "expected_version": 1, "slots": self.slot,
        }, format="json").status_code, 403)
        self.assertEqual(self.auth(self.editor).patch(self.draft_path + pk + "/", {
            "expected_version": 1, "slots": self.slot,
        }, format="json").status_code, 200)

        foreign_org = Organization.objects.create(name="Foreign", slug="foreign-component")
        other = get_user_model().objects.create_user(username="foreign-component-owner")
        Membership.objects.create(organization=foreign_org, user=other, role=Membership.Role.OWNER)
        foreign = self.auth(other)
        self.assertEqual(foreign.get(self.draft_path + pk + "/").status_code, 404)
        self.assertEqual(foreign.get(self.draft_path).data["count"], 0)
        self.assertEqual(foreign.get(self.draft_path + pk + "/history/").status_code, 404)

    def test_bindings_are_not_public_and_host_site_cannot_change(self):
        created = self.create()
        self.assertEqual(created.status_code, 201, created.data)
        anon = APIClient()
        self.assertEqual(anon.get(self.draft_path).status_code, 401)
        pk = created.data["id"]
        new_site = Site.objects.create(organization=self.org, name="Other host", domain="other-component.test")
        moved = self.client.patch(self.draft_path + pk + "/", {
            "expected_version": 1, "site": str(new_site.pk),
        }, format="json")
        self.assertEqual(moved.status_code, 400)
        self.assertEqual(ComponentBindingDraft.objects.get(pk=pk).site_id, self.site.pk)
