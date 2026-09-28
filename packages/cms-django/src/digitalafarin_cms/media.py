"""Public media addresses are configuration, never inferred from proxy headers."""
import html
import re
from urllib.parse import urlsplit

from django.conf import settings


def public_media_url(value):
    if not isinstance(value, str) or not value:
        return value
    try:
        source = urlsplit(value)
    except ValueError:
        return value
    media = urlsplit(getattr(settings, "MEDIA_URL", "/media/"))
    prefixes = {"/media/", media.path.rstrip("/") + "/"}
    prefix = next((p for p in prefixes if p != "/" and source.path.startswith(p)), None)
    legacy_origins = set(getattr(settings, "DIGITALAFARIN_CMS_MEDIA_LEGACY_ORIGINS", []))
    origin = f"{source.scheme}://{source.netloc}"
    local = source.hostname in {"localhost", "127.0.0.1", "::1"}
    # Only explicitly configured old origins may be remapped; external storage stays intact.
    if source.netloc and origin not in legacy_origins:
        if local and not settings.DEBUG:
            return ""  # Never emit development addresses to production visitors.
        return value
    if not prefix:
        return value
    base = getattr(settings, "DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL", "") or getattr(settings, "MEDIA_URL", "/media/")
    return base.rstrip("/") + "/" + source.path[len(prefix):] + ("?" + source.query if source.query else "")


def normalize_media_data(value):
    if isinstance(value, dict):
        return {key: normalize_media_data(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalize_media_data(item) for item in value]
    if not isinstance(value, str):
        return value
    if "<img" in value.lower():
        def image_tag(match):
            return re.sub(r'(\bsrc\s*=\s*)([\'"])(.*?)\2',
                lambda attr: attr[1] + attr[2] + html.escape(public_media_url(html.unescape(attr[3])), quote=True) + attr[2],
                match[0], flags=re.I)
        return re.sub(r"<img\b[^>]*>", image_tag, value, flags=re.I)
    if value.startswith(("/media/", "http://", "https://", str(getattr(settings, "MEDIA_URL", "/media/")))):
        return public_media_url(value)
    return value
