from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class NestedSchemaTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Builder Nested", slug="nested-org")
        self.site = Site.objects.create(organization=self.org, name="Builder", domain="builder-nested.test")
        self.author = get_user_model().objects.create_user(username="nested-author")
        Membership.objects.create(organization=self.org, user=self.author, role=Membership.Role.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(self.author)
        self.other_org = Organization.objects.create(name="Elsewhere", slug="nested-other")
        self.other_site = Site.objects.create(organization=self.other_org, name="Elsewhere", domain="nested-other.test")
        self.place = ContentTypeDefinition.objects.create(site=self.site, name="Place", slug="place")
        self.other_place = ContentTypeDefinition.objects.create(site=self.other_site, name="Place", slug="place")
        self.target = ContentEntry.objects.create(
            site=self.site, content_type=self.place, title="Tehran", slug="tehran",
            path="/places/tehran/",
        )
        self.remote = ContentEntry.objects.create(
            site=self.other_site, content_type=self.other_place, title="Private",
            slug="private", path="/places/private/",
        )
        self.schema = {"fields": [
            {"key": "location", "type": "relation", "target_content_type": "place", "required": True},
            {"key": "summary", "type": "group", "fields": [
                {"key": "heading", "type": "text", "required": True},
                {"key": "enabled", "type": "boolean"},
            ]},
            {"key": "days", "type": "repeater", "min_items": 1, "max_items": 4, "fields": [
                {"key": "title", "type": "text", "required": True},
                {"key": "nights", "type": "number"},
                {"key": "links", "type": "repeater", "max_items": 2, "fields": [
                    {"key": "url", "type": "url", "required": True},
                ]},
            ]},
            {"key": "photos", "type": "gallery", "max_items": 3},
        ]}
        response = self.client.post("/api/cms/v1/content/types/", {
            "site": str(self.site.pk), "name": "Tour", "slug": "nested-tour", "schema": self.schema,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.kind_id = response.data["id"]

    def entry_payload(self, fields):
        return {
            "site": str(self.site.pk), "content_type": self.kind_id,
            "title": "Tour", "slug": "tour", "path": "/tours/tour/",
            "status": "draft", "custom_fields": fields,
        }

    def valid_fields(self):
        return {
            "location": str(self.target.pk),
            "summary": {"heading": "Highlights", "enabled": True},
            "days": [{"title": "Day One", "nights": 2, "links": [{"url": "https://example.test"}]}],
            "photos": ["https://example.test/gallery/tour.jpg"],
        }

    def test_nested_content_round_trip(self):
        fields = self.valid_fields()
        response = self.client.post("/api/cms/v1/content/entries/", self.entry_payload(fields), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["custom_fields"], fields)

    def test_other_tenant_and_wrong_content_type_references_are_rejected(self):
        for identifier in (str(self.remote.pk), str(self.site.pk), "not-a-uuid"):
            fields = self.valid_fields()
            fields["location"] = identifier
            response = self.client.post("/api/cms/v1/content/entries/", self.entry_payload(fields), format="json")
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn("location", response.data["custom_fields"])

    def test_nested_required_and_repeater_limits(self):
        cases = [
            ("summary", {"enabled": True}, "summary"),
            ("days", [], "days"),
            ("days", [{"title": "OK"}] * 5, "days"),
            ("days", [{"title": "OK", "links": [{"url": "not-a-url"}]}], "days"),
            ("photos", ["one", "two", "three", "four"], "photos"),
        ]
        for key, bad, key_expected in cases:
            with self.subTest(key=key, value=bad):
                fields = self.valid_fields()
                fields[key] = bad
                response = self.client.post("/api/cms/v1/content/entries/", self.entry_payload(fields), format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn(key_expected, response.data["custom_fields"])

    def test_schema_rejects_recursive_or_malformed_configuration(self):
        invalid = [
            [{"key": "n", "type": "relation"}],
            [{"key": "n", "type": "gallery", "max_items": 100000}],
            [{"key": "n", "type": "repeater", "max_items": 2, "min_items": 3}],
            [{"key": "n", "type": "group", "fields": [{"key": "dup"}, {"key": "dup"}]}],
            [{"key": "n", "type": "unknown"}],
        ]
        for index, fields in enumerate(invalid):
            with self.subTest(index=index):
                response = self.client.post("/api/cms/v1/content/types/", {
                    "site": str(self.site.pk), "name": "Invalid", "slug": f"invalid-{index}",
                    "schema": {"fields": fields},
                }, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn("schema", response.data)

    def test_schema_cannot_break_existing_data_without_migration(self):
        created = self.client.post("/api/cms/v1/content/entries/",
                                   self.entry_payload(self.valid_fields()), format="json")
        self.assertEqual(created.status_code, 201, created.data)
        endpoint = f"/api/cms/v1/content/types/{self.kind_id}/"
        bad_cases = [
            {"fields": [field for field in self.schema["fields"] if field["key"] != "location"]},
            {"fields": [{**field, "type": "text"} if field["key"] == "days" else field
                        for field in self.schema["fields"]]},
            {"fields": [*self.schema["fields"], {"key": "mandatory", "type": "text", "required": True}]},
        ]
        for schema in bad_cases:
            response = self.client.patch(endpoint, {"schema": schema}, format="json")
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn("schema", response.data)
        safe = self.client.patch(endpoint, {
            "schema": {"fields": [*self.schema["fields"],
                                    {"key": "optional_note", "type": "text"}]},
        }, format="json")
        self.assertEqual(safe.status_code, 200, safe.data)


    def test_schema_impact_dry_run_reports_risks_without_writing(self):
        created = self.client.post("/api/cms/v1/content/entries/",
                                   self.entry_payload(self.valid_fields()), format="json")
        self.assertEqual(created.status_code, 201, created.data)
        endpoint = f"/api/cms/v1/content/types/{self.kind_id}/schema-impact/"
        proposed = {"fields": [field for field in self.schema["fields"] if field["key"] != "location"]}
        before = ContentTypeDefinition.objects.get(pk=self.kind_id).schema
        result = self.client.post(endpoint, {"schema": proposed}, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertFalse(result.data["safe"])
        self.assertEqual(result.data["affected_entries"], 1)
        self.assertTrue(result.data["warnings"])
        self.assertEqual(ContentTypeDefinition.objects.get(pk=self.kind_id).schema, before)
        compatible = self.client.post(endpoint, {
            "schema": {"fields": [*self.schema["fields"], {"key": "notes", "type": "textarea"}]},
        }, format="json")
        self.assertEqual(compatible.status_code, 200, compatible.data)
        self.assertTrue(compatible.data["safe"])

    def test_schema_impact_requires_write_role_and_tenant_scope(self):
        viewer = get_user_model().objects.create_user(username="nested-viewer")
        Membership.objects.create(organization=self.org, user=viewer, role=Membership.Role.VIEWER)
        client = APIClient()
        client.force_authenticate(viewer)
        endpoint = f"/api/cms/v1/content/types/{self.kind_id}/schema-impact/"
        denied = client.post(endpoint, {"schema": self.schema}, format="json")
        self.assertEqual(denied.status_code, 403)
        foreign = ContentTypeDefinition.objects.create(site=self.other_site, name="Foreign", slug="foreign")
        hidden = self.client.post(
            f"/api/cms/v1/content/types/{foreign.pk}/schema-impact/",
            {"schema": {"fields": []}}, format="json",
        )
        self.assertEqual(hidden.status_code, 404)


    def test_relation_schema_requires_same_site_content_type_target(self):
        invalid = self.client.post("/api/cms/v1/content/types/", {
            "site": str(self.site.pk), "name": "Invalid relation", "slug": "bad-relation",
            "schema": {"fields": [{"key": "link", "type": "relation", "target_content_type": "foreign"}]},
        }, format="json")
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("schema", invalid.data)
        # A self-relation is valid: the target type is currently being created.
        self_link = self.client.post("/api/cms/v1/content/types/", {
            "site": str(self.site.pk), "name": "People", "slug": "person",
            "schema": {"fields": [{"key": "friend", "type": "relation", "target_content_type": "person"}]},
        }, format="json")
        self.assertEqual(self_link.status_code, 201, self_link.data)
