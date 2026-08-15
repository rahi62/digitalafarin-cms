from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition, Category, Tag
from digitalafarin_cms.apps.content.tasks import publish_due_entries
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class EditorialWorkflowTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="workflow-owner", password="x")
        self.writer = User.objects.create_user(username="workflow-writer", password="x")
        self.org = Organization.objects.create(name="Workflow Org", slug="workflow-org")
        self.site = Site.objects.create(organization=self.org, name="Workflow Site", domain="workflow.test")
        Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        Membership.objects.create(organization=self.org, user=self.writer, role=Membership.Role.WRITER)
        self.public_type = ContentTypeDefinition.objects.create(site=self.site, name="Page", slug="page", is_public=True)
        self.private_type = ContentTypeDefinition.objects.create(site=self.site, name="Internal", slug="internal", is_public=False)

    def auth_client(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def create_entry(self, user=None, content_type=None, **overrides):
        payload = {
            "site": str(self.site.id),
            "content_type": str((content_type or self.public_type).id),
            "title": "Workflow Entry",
            "slug": "workflow-entry",
            "path": "/workflow-entry/",
            "status": "draft",
            "blocks": [],
            "custom_fields": {},
        }
        payload.update(overrides)
        response = self.auth_client(user or self.writer).post("/api/cms/v1/content/entries/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_writer_can_submit_review_but_cannot_publish(self):
        entry = self.create_entry()
        writer = self.auth_client(self.writer)
        review = writer.post(f"/api/cms/v1/content/entries/{entry['id']}/submit-review/", {}, format="json")
        self.assertEqual(review.status_code, 200, review.data)
        self.assertEqual(review.data["status"], "review")
        publish = writer.post(f"/api/cms/v1/content/entries/{entry['id']}/publish/", {}, format="json")
        self.assertEqual(publish.status_code, 403)

    def test_writer_cannot_bypass_publish_with_patch(self):
        entry = self.create_entry()
        response = self.auth_client(self.writer).patch(
            f"/api/cms/v1/content/entries/{entry['id']}/",
            {"status": "published"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(ContentEntry.objects.get(pk=entry["id"]).status, ContentEntry.Status.DRAFT)

    def test_owner_can_publish_and_workflow_reports_capabilities(self):
        entry = self.create_entry(user=self.owner)
        client = self.auth_client(self.owner)
        workflow = client.get(f"/api/cms/v1/content/entries/{entry['id']}/workflow/")
        self.assertEqual(workflow.status_code, 200)
        self.assertEqual(workflow.data["role"], Membership.Role.OWNER)
        self.assertTrue(workflow.data["can_publish"])
        publish = client.post(f"/api/cms/v1/content/entries/{entry['id']}/publish/", {}, format="json")
        self.assertEqual(publish.status_code, 200, publish.data)
        self.assertEqual(publish.data["status"], "published")
        self.assertIsNotNone(publish.data["published_at"])
        self.assertIsNone(publish.data["scheduled_at"])

    def test_scheduled_content_is_published_by_task(self):
        entry = self.create_entry(user=self.owner)
        client = self.auth_client(self.owner)
        future = timezone.now() + timedelta(hours=1)
        response = client.post(
            f"/api/cms/v1/content/entries/{entry['id']}/schedule/",
            {"scheduled_at": future.isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "scheduled")
        ContentEntry.objects.filter(pk=entry["id"]).update(scheduled_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(publish_due_entries(), 1)
        refreshed = ContentEntry.objects.get(pk=entry["id"])
        self.assertEqual(refreshed.status, ContentEntry.Status.PUBLISHED)
        self.assertIsNone(refreshed.scheduled_at)

    def test_writer_cannot_edit_scheduled_content(self):
        entry = self.create_entry(user=self.owner)
        owner = self.auth_client(self.owner)
        future = timezone.now() + timedelta(hours=2)
        scheduled = owner.post(
            f"/api/cms/v1/content/entries/{entry['id']}/schedule/",
            {"scheduled_at": future.isoformat()},
            format="json",
        )
        self.assertEqual(scheduled.status_code, 200)
        response = self.auth_client(self.writer).patch(
            f"/api/cms/v1/content/entries/{entry['id']}/",
            {"title": "Writer changed public future content"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_private_content_type_is_hidden_from_public_resolver_and_sitemap(self):
        entry = self.create_entry(user=self.owner, content_type=self.private_type, slug="private", path="/private/")
        owner = self.auth_client(self.owner)
        publish = owner.post(f"/api/cms/v1/content/entries/{entry['id']}/publish/", {}, format="json")
        self.assertEqual(publish.status_code, 200)
        public = APIClient().get("/api/cms/v1/content/resolve/", {"site": "workflow.test", "path": "/private/"})
        self.assertEqual(public.status_code, 404)
        preview = owner.post(f"/api/cms/v1/content/entries/{entry['id']}/preview/", {}, format="json")
        self.assertEqual(preview.status_code, 200)
        preview_resolve = APIClient().get(
            "/api/cms/v1/content/resolve/",
            {"site": "workflow.test", "path": "/private/", "preview": preview.data["token"]},
        )
        self.assertEqual(preview_resolve.status_code, 200)
        self.assertTrue(preview_resolve.data["preview"])
        sitemap = APIClient().get("/api/cms/v1/content/sitemap/", {"site": "workflow.test"})
        self.assertEqual(sitemap.status_code, 200)
        self.assertNotIn("/private/", sitemap.content.decode())

    def test_revision_restore_restores_parent_categories_tags_and_featured(self):
        parent = ContentEntry.objects.create(
            site=self.site,
            content_type=self.public_type,
            title="Parent",
            slug="parent",
            path="/parent/",
        )
        category = Category.objects.create(site=self.site, name="News", slug="news")
        tag = Tag.objects.create(site=self.site, name="SEO", slug="seo")
        entry = self.create_entry(
            user=self.owner,
            parent=str(parent.id),
            categories=[str(category.id)],
            tags=[str(tag.id)],
            is_featured=True,
        )
        client = self.auth_client(self.owner)
        revisions = client.get(f"/api/cms/v1/content/revisions/?entry={entry['id']}")
        initial = next(row for row in revisions.data["results"] if row["number"] == 1)
        changed = client.patch(
            f"/api/cms/v1/content/entries/{entry['id']}/",
            {"parent": None, "categories": [], "tags": [], "is_featured": False},
            format="json",
        )
        self.assertEqual(changed.status_code, 200, changed.data)
        restored = client.post(
            f"/api/cms/v1/content/entries/{entry['id']}/restore_revision/",
            {"revision_id": initial["id"]},
            format="json",
        )
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertEqual(str(restored.data["parent"]), str(parent.id))
        self.assertEqual([str(value) for value in restored.data["categories"]], [str(category.id)])
        self.assertEqual([str(value) for value in restored.data["tags"]], [str(tag.id)])
        self.assertTrue(restored.data["is_featured"])
