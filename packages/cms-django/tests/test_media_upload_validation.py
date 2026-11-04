import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from digitalafarin_cms.apps.sites.models import Membership, Organization, Site

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
GIF = b"GIF89a" + b"\x00" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 16
PDF = b"%PDF-1.7\n" + b"0" * 32
MP4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 16
AVIF = b"\x00\x00\x00\x18ftypavif" + b"\x00" * 16
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
EVIL_SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
HTML = b"<html><body><script>alert(1)</script></body></html>"


class MediaUploadValidationTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix="cms-media-test-")
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)
        user = get_user_model().objects.create_user(username="media-uploader", password="x")
        org = Organization.objects.create(name="Media", slug="media-org")
        Membership.objects.create(organization=org, user=user, role=Membership.Role.EDITOR)
        self.site = Site.objects.create(organization=org, name="Media", domain="media.example")
        self.client = APIClient()
        self.client.force_authenticate(user)

    def upload(self, name, data, content_type="application/octet-stream"):
        return self.client.post(
            "/api/cms/v1/media/assets/",
            {"site": str(self.site.id), "file": SimpleUploadedFile(name, data, content_type=content_type)},
            format="multipart",
        )

    def test_allowed_types_are_accepted_with_server_detected_mime(self):
        cases = {
            "a.png": (PNG, "image/png"), "a.jpg": (JPEG, "image/jpeg"), "a.JPEG": (JPEG, "image/jpeg"),
            "a.gif": (GIF, "image/gif"), "a.webp": (WEBP, "image/webp"), "a.avif": (AVIF, "image/avif"),
            "a.pdf": (PDF, "application/pdf"), "a.mp4": (MP4, "video/mp4"),
        }
        for name, (data, mime) in cases.items():
            with self.subTest(name=name):
                response = self.upload(name, data, content_type="text/html")  # lying client
                self.assertEqual(response.status_code, 201, getattr(response, "data", None))
                self.assertEqual(response.data["mime_type"], mime)
                self.assertEqual(response.data["size_bytes"], len(data))

    def test_html_and_script_extensions_are_rejected(self):
        for name in ("page.html", "page.htm", "x.js", "x.mjs", "x.php", "x.exe", "noext", "x.xhtml"):
            with self.subTest(name=name):
                self.assertEqual(self.upload(name, HTML, "image/png").status_code, 400)

    def test_extension_must_match_file_signature(self):
        self.assertEqual(self.upload("pic.png", HTML, "image/png").status_code, 400)
        self.assertEqual(self.upload("pic.jpg", PNG, "image/jpeg").status_code, 400)
        self.assertEqual(self.upload("doc.pdf", HTML, "application/pdf").status_code, 400)
        self.assertEqual(self.upload("clip.mp4", PNG, "video/mp4").status_code, 400)

    def test_svg_is_rejected_by_default(self):
        self.assertEqual(self.upload("logo.svg", SVG, "image/svg+xml").status_code, 400)

    @override_settings(DIGITALAFARIN_CMS_MEDIA_ALLOW_SVG=True)
    def test_svg_allowed_only_when_enabled_and_without_active_content(self):
        ok = self.upload("logo.svg", SVG, "text/plain")
        self.assertEqual(ok.status_code, 201, getattr(ok, "data", None))
        self.assertEqual(ok.data["mime_type"], "image/svg+xml")
        self.assertEqual(self.upload("evil.svg", EVIL_SVG, "image/svg+xml").status_code, 400)
        self.assertEqual(self.upload("fake.svg", HTML, "image/svg+xml").status_code, 400)

    @override_settings(DIGITALAFARIN_CMS_MEDIA_MAX_BYTES=64)
    def test_size_limit_is_configurable(self):
        self.assertEqual(self.upload("small.png", PNG).status_code, 201)
        self.assertEqual(self.upload("big.png", PNG + b"\x00" * 64).status_code, 400)

    def test_default_limit_is_ten_megabytes(self):
        from digitalafarin_cms.apps.media_library.validation import max_upload_bytes
        self.assertEqual(max_upload_bytes(), 10 * 1024 * 1024)

    def test_empty_file_is_rejected(self):
        self.assertEqual(self.upload("empty.png", b"").status_code, 400)
