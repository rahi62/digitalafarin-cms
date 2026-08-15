from __future__ import annotations

import re
from urllib.parse import urlsplit

from rest_framework import serializers


SEO_DEFAULT_KEYS = {
    "site_name",
    "title_template",
    "default_description",
    "default_og_image",
    "twitter_card",
    "robots_index",
    "robots_follow",
}
ORGANIZATION_SCHEMA_KEYS = {
    "enabled",
    "type",
    "name",
    "legal_name",
    "url",
    "logo",
    "same_as",
    "email",
    "telephone",
}
TWITTER_CARDS = {"summary", "summary_large_image"}


def _valid_http_url(value: str) -> bool:
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
    return parts.scheme in {"http", "https"} and bool(parts.hostname) and not parts.username and not parts.password


def _validate_url(value, field_name, *, allow_blank=True):
    if value in (None, "") and allow_blank:
        return
    if not isinstance(value, str) or not _valid_http_url(value.strip()):
        raise serializers.ValidationError({field_name: "Must be a valid http(s) URL without embedded credentials."})


def validate_site_settings(value):
    """Validate known CMS settings while preserving unknown plugin/integration keys.

    Unknown keys intentionally remain valid so extensions can namespace their own settings.
    Public API exposure is handled separately by public_site_context().
    """
    if value in (None, ""):
        return {}
    if not isinstance(value, dict):
        raise serializers.ValidationError("settings must be an object")

    _validate_url(value.get("frontend_url"), "frontend_url")
    _validate_url(value.get("audit_base_url"), "audit_base_url")

    seo = value.get("seo_defaults", {}) or {}
    if not isinstance(seo, dict):
        raise serializers.ValidationError({"seo_defaults": "Must be an object."})
    if "title_template" in seo:
        template = seo.get("title_template")
        if not isinstance(template, str):
            raise serializers.ValidationError({"seo_defaults": {"title_template": "Must be a string."}})
        if template and "{{title}}" not in template:
            raise serializers.ValidationError({"seo_defaults": {"title_template": "Template must contain {{title}}."}})
        if len(template) > 255:
            raise serializers.ValidationError({"seo_defaults": {"title_template": "Must be 255 characters or fewer."}})
    for field, limit in (("site_name", 160), ("default_description", 320)):
        if field in seo and not isinstance(seo.get(field), str):
            raise serializers.ValidationError({"seo_defaults": {field: "Must be a string."}})
        if len(str(seo.get(field) or "")) > limit:
            raise serializers.ValidationError({"seo_defaults": {field: f"Must be {limit} characters or fewer."}})
    _validate_url(seo.get("default_og_image"), "seo_defaults.default_og_image")
    if seo.get("twitter_card") not in (None, "", *TWITTER_CARDS):
        raise serializers.ValidationError({"seo_defaults": {"twitter_card": "Unsupported Twitter card type."}})
    for field in ("robots_index", "robots_follow"):
        if field in seo and not isinstance(seo[field], bool):
            raise serializers.ValidationError({"seo_defaults": {field: "Must be a boolean."}})

    organization = value.get("organization_schema", {}) or {}
    if not isinstance(organization, dict):
        raise serializers.ValidationError({"organization_schema": "Must be an object."})
    if "enabled" in organization and not isinstance(organization["enabled"], bool):
        raise serializers.ValidationError({"organization_schema": {"enabled": "Must be a boolean."}})
    schema_type = str(organization.get("type") or "Organization")
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9]*", schema_type):
        raise serializers.ValidationError({"organization_schema": {"type": "Must be a valid Schema.org type name."}})
    for field, limit in (("name", 200), ("legal_name", 200), ("email", 254), ("telephone", 80)):
        if field in organization and not isinstance(organization.get(field), str):
            raise serializers.ValidationError({"organization_schema": {field: "Must be a string."}})
        if len(str(organization.get(field) or "")) > limit:
            raise serializers.ValidationError({"organization_schema": {field: f"Must be {limit} characters or fewer."}})
    for field in ("url", "logo"):
        _validate_url(organization.get(field), f"organization_schema.{field}")
    same_as = organization.get("same_as", []) or []
    if not isinstance(same_as, list):
        raise serializers.ValidationError({"organization_schema": {"same_as": "Must be a list of URLs."}})
    if len(same_as) > 30:
        raise serializers.ValidationError({"organization_schema": {"same_as": "At most 30 URLs are allowed."}})
    for item in same_as:
        if not isinstance(item, str) or not _valid_http_url(item.strip()):
            raise serializers.ValidationError({"organization_schema": {"same_as": "Every item must be a valid http(s) URL."}})
    return value


def _clean_strings(data: dict, allowed_keys: set[str]) -> dict:
    result = {}
    for key in allowed_keys:
        if key not in data:
            continue
        value = data[key]
        if isinstance(value, str):
            value = value.strip()
            if value:
                result[key] = value
        elif isinstance(value, (bool, list)):
            result[key] = value
    return result


def organization_json_ld(site) -> dict | None:
    settings = site.settings or {}
    config = settings.get("organization_schema", {}) or {}
    if not isinstance(config, dict) or not config.get("enabled"):
        return None

    schema_type = str(config.get("type") or "Organization").strip() or "Organization"
    name = str(config.get("name") or (settings.get("seo_defaults", {}) or {}).get("site_name") or site.name).strip()
    if not name:
        return None

    data = {
        "@context": "https://schema.org",
        "@type": schema_type,
        "name": name,
    }
    mapping = {
        "legal_name": "legalName",
        "url": "url",
        "logo": "logo",
        "email": "email",
        "telephone": "telephone",
    }
    for source, target in mapping.items():
        value = str(config.get(source) or "").strip()
        if value:
            data[target] = value
    same_as = [str(item).strip() for item in (config.get("same_as", []) or []) if str(item).strip()]
    if same_as:
        data["sameAs"] = same_as
    return data


def public_site_context(site) -> dict:
    """Return the only Site.settings subset allowed in unauthenticated resolver output."""
    settings = site.settings or {}
    raw_seo = settings.get("seo_defaults", {}) or {}
    seo = _clean_strings(raw_seo, SEO_DEFAULT_KEYS)
    seo.setdefault("site_name", site.name)
    seo.setdefault("title_template", "{{title}}")
    seo.setdefault("twitter_card", "summary_large_image")
    seo.setdefault("robots_index", True)
    seo.setdefault("robots_follow", True)

    return {
        "name": site.name,
        "domain": site.domain,
        "language": site.default_language,
        "timezone": site.timezone,
        "seo_defaults": seo,
        "organization_schema": organization_json_ld(site),
    }
