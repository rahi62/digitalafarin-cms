from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.media_library.models import MediaAsset
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class MediaLibraryApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="media-owner", password="x")
        self.org = Organization.objects.create(name="Media Org", slug="media-org")
        self.site = Site.objects.create(organization=self.org, name="Media Site", domain="media.example")
        Membership.objects.create(organization=self.org, user=self.user, role=Membership.Role.OWNER)

        other_org = Organization.objects.create(name="Other Org", slug="other-media-org")
        other_site = Site.objects.create(organization=other_org, name="Other Site", domain="other-media.example")

        self.image = MediaAsset.objects.create(
            site=self.site,
            file="cms/2026/09/hero.jpg",
            filename="hero.jpg",
            mime_type="image/jpeg",
            alt_text="Homepage hero",
            folder="home",
            size_bytes=200,
        )
        self.document = MediaAsset.objects.create(
            site=self.site,
            file="cms/2026/09/guide.pdf",
            filename="seo-guide.pdf",
            mime_type="application/pdf",
            caption="SEO document",
            folder="docs",
            size_bytes=500,
        )
        MediaAsset.objects.create(
            site=other_site,
            file="cms/2026/09/private.jpg",
            filename="private.jpg",
            mime_type="image/jpeg",
            folder="private",
        )

        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_media_type_search_and_ordering_filters(self):
        images = self.client.get("/api/cms/v1/media/assets/", {"site": self.site.id, "type": "images"})
        self.assertEqual(images.status_code, 200, images.data)
        self.assertEqual(images.data["count"], 1)
        self.assertEqual(images.data["results"][0]["filename"], "hero.jpg")

        documents = self.client.get("/api/cms/v1/media/assets/", {"site": self.site.id, "type": "documents"})
        self.assertEqual(documents.status_code, 200, documents.data)
        self.assertEqual(documents.data["count"], 1)
        self.assertEqual(documents.data["results"][0]["filename"], "seo-guide.pdf")

        search = self.client.get("/api/cms/v1/media/assets/", {"site": self.site.id, "search": "Homepage"})
        self.assertEqual(search.status_code, 200, search.data)
        self.assertEqual(search.data["count"], 1)
        self.assertEqual(search.data["results"][0]["id"], str(self.image.id))

        ordered = self.client.get("/api/cms/v1/media/assets/", {"site": self.site.id, "ordering": "filename"})
        self.assertEqual(ordered.status_code, 200, ordered.data)
        self.assertEqual([item["filename"] for item in ordered.data["results"]], ["hero.jpg", "seo-guide.pdf"])

    def test_media_page_size_is_bounded_and_folders_are_tenant_scoped(self):
        page = self.client.get("/api/cms/v1/media/assets/", {"site": self.site.id, "page_size": 1})
        self.assertEqual(page.status_code, 200, page.data)
        self.assertEqual(page.data["count"], 2)
        self.assertEqual(len(page.data["results"]), 1)
        self.assertIsNotNone(page.data["next"])

        folders = self.client.get("/api/cms/v1/media/assets/folders/", {"site": self.site.id})
        self.assertEqual(folders.status_code, 200, folders.data)
        self.assertEqual(folders.data["results"], ["docs", "home"])
        self.assertNotIn("private", folders.data["results"])
