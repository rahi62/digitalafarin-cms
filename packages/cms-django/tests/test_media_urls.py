from django.test import SimpleTestCase, override_settings
from digitalafarin_cms.media import normalize_media_data, public_media_url


class MediaUrlTests(SimpleTestCase):
    @override_settings(MEDIA_URL="/media/", DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL="/media/")
    def test_same_origin_and_external_storage(self):
        self.assertEqual(public_media_url("/media/cms/a.png"), "/media/cms/a.png")
        self.assertEqual(public_media_url("https://storage.test/private/a.png?signature=test"), "https://storage.test/private/a.png?signature=test")

    @override_settings(DEBUG=False, MEDIA_URL="/media/", DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL="https://cdn.test/assets/", DIGITALAFARIN_CMS_MEDIA_LEGACY_ORIGINS=["http://localhost:8000"])
    def test_legacy_rich_text_html_and_featured_image_are_mapped(self):
        data = {"html": '<img src="http://localhost:8000/media/cms/a.png">', "featured_image": "http://localhost:8000/media/cms/a.png"}
        result = normalize_media_data(data)
        self.assertEqual(result["featured_image"], "https://cdn.test/assets/cms/a.png")
        self.assertIn('src="https://cdn.test/assets/cms/a.png"', result["html"])
        self.assertIn("localhost", data["featured_image"])

    @override_settings(DEBUG=False, MEDIA_URL="/media/", DIGITALAFARIN_CMS_MEDIA_LEGACY_ORIGINS=[])
    def test_unmapped_development_media_is_never_emitted_in_production(self):
        self.assertEqual(public_media_url("http://localhost:8000/media/cms/a.png"), "")
