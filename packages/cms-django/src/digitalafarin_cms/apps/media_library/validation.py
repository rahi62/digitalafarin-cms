"""Server-side upload validation for the media library.

The client-supplied ``Content-Type`` is never trusted. A file is accepted only when
its extension is on the allowlist *and* its leading bytes match the signature of
that type. HTML, JavaScript and (by default) SVG are rejected.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

from django.conf import settings
from rest_framework import serializers

DEFAULT_MAX_BYTES = 10 * 1024 * 1024
_HEAD_BYTES = 64 * 1024  # enough for the SVG scan; signatures need <= 16 bytes


@dataclass(frozen=True)
class UploadInfo:
    extension: str
    mime_type: str
    size_bytes: int


def _riff_webp(head: bytes) -> bool:
    return head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def _iso_bmff(*brands: bytes):
    def check(head: bytes) -> bool:
        return head[4:8] == b"ftyp" and any(head[8:12] == brand for brand in brands)
    return check


def _mp4(head: bytes) -> bool:
    # Any ISO BMFF "ftyp" box that is not an AVIF/HEIF image brand.
    return head[4:8] == b"ftyp" and head[8:12] not in {b"avif", b"avis", b"heic", b"heix", b"mif1"}


# extension -> (canonical mime type, signature predicate)
SIGNATURES = {
    ".jpg": ("image/jpeg", lambda h: h[:3] == b"\xff\xd8\xff"),
    ".jpeg": ("image/jpeg", lambda h: h[:3] == b"\xff\xd8\xff"),
    ".png": ("image/png", lambda h: h[:8] == b"\x89PNG\r\n\x1a\n"),
    ".gif": ("image/gif", lambda h: h[:6] in (b"GIF87a", b"GIF89a")),
    ".webp": ("image/webp", _riff_webp),
    ".avif": ("image/avif", _iso_bmff(b"avif", b"avis")),
    ".pdf": ("application/pdf", lambda h: h.lstrip(b"\x00\t\r\n ")[:5] == b"%PDF-" or h[:5] == b"%PDF-"),
    ".mp4": ("video/mp4", _mp4),
    ".webm": ("video/webm", lambda h: h[:4] == b"\x1a\x45\xdf\xa3"),
}

_SVG_FORBIDDEN = re.compile(
    rb"<\s*script|<\s*foreignObject|\bon[a-z]+\s*=|javascript\s*:|<\s*iframe|<\s*embed|<\s*object|<!ENTITY",
    re.IGNORECASE,
)


def max_upload_bytes() -> int:
    return int(getattr(settings, "DIGITALAFARIN_CMS_MEDIA_MAX_BYTES", DEFAULT_MAX_BYTES))


def _svg_ok(head: bytes) -> bool:
    text = head.lstrip(b"\xef\xbb\xbf \t\r\n")
    if not (text[:4] == b"<svg" or (text[:5] == b"<?xml" and b"<svg" in text)):
        return False
    return not _SVG_FORBIDDEN.search(head)


def validate_upload(uploaded) -> UploadInfo:
    """Validate an uploaded file object; raise ``ValidationError`` when unsafe."""
    name = os.path.basename(str(getattr(uploaded, "name", "") or "").replace("\\", "/"))
    extension = os.path.splitext(name)[1].lower()
    size = int(getattr(uploaded, "size", 0) or 0)
    limit = max_upload_bytes()
    if size <= 0:
        raise serializers.ValidationError("The uploaded file is empty.")
    if size > limit:
        raise serializers.ValidationError(f"The file is larger than the {limit} byte limit.")

    allow_svg = bool(getattr(settings, "DIGITALAFARIN_CMS_MEDIA_ALLOW_SVG", False))
    if extension == ".svg":
        if not allow_svg:
            raise serializers.ValidationError("SVG uploads are disabled.")
    elif extension not in SIGNATURES:
        raise serializers.ValidationError("This file type is not allowed.")

    position = uploaded.tell() if hasattr(uploaded, "tell") else 0
    try:
        uploaded.seek(0)
        head = uploaded.read(_HEAD_BYTES)
    finally:
        uploaded.seek(position if position else 0)

    if extension == ".svg":
        if not _svg_ok(head):
            raise serializers.ValidationError("The file is not a safe SVG document.")
        return UploadInfo(extension, "image/svg+xml", size)

    mime_type, matches = SIGNATURES[extension]
    if not matches(head):
        raise serializers.ValidationError("The file content does not match its extension.")
    return UploadInfo(extension, mime_type, size)
