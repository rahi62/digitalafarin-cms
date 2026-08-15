from __future__ import annotations

import ipaddress
import re
import socket
import time
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings


USER_AGENT = "DigitalAfarinSEOAudit/0.3 (+https://github.com/rahi62/digitalafarin-cms)"
SKIP_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".pdf",
    ".zip", ".rar", ".7z", ".mp3", ".mp4", ".webm", ".avi", ".mov",
    ".css", ".js", ".xml", ".json", ".woff", ".woff2", ".ttf", ".eot",
}


class UnsafeAuditTarget(ValueError):
    pass


@dataclass
class FetchResult:
    url: str
    final_url: str
    status_code: int
    content_type: str
    body: str
    response_ms: int
    headers: dict[str, str] = field(default_factory=dict)


@dataclass
class PageAnalysis:
    url: str
    final_url: str
    path: str
    status_code: int
    content_type: str
    response_ms: int
    title: str = ""
    meta_description: str = ""
    canonical_url: str = ""
    robots: str = ""
    is_indexable: bool = True
    h1_count: int = 0
    h2_count: int = 0
    word_count: int = 0
    image_count: int = 0
    missing_alt_count: int = 0
    internal_urls: list[str] = field(default_factory=list)
    external_urls: list[str] = field(default_factory=list)


class _AuditHtmlParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.description = ""
        self.robots = ""
        self.canonical = ""
        self.h1_count = 0
        self.h2_count = 0
        self.image_count = 0
        self.missing_alt_count = 0
        self.links: list[str] = []
        self.text_parts: list[str] = []
        self._title_depth = 0
        self._ignored_depth = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attrs_dict = {str(key).lower(): value for key, value in attrs if key}
        if tag in {"script", "style", "noscript", "template"}:
            self._ignored_depth += 1
        if tag == "title":
            self._title_depth += 1
        elif tag == "meta":
            name = (attrs_dict.get("name") or "").lower()
            content = (attrs_dict.get("content") or "").strip()
            if name == "description" and not self.description:
                self.description = content
            elif name in {"robots", "googlebot"} and content:
                self.robots = ", ".join(filter(None, [self.robots, content]))
        elif tag == "link":
            rel = (attrs_dict.get("rel") or "").lower().split()
            if "canonical" in rel and not self.canonical:
                self.canonical = (attrs_dict.get("href") or "").strip()
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "h2":
            self.h2_count += 1
        elif tag == "img":
            self.image_count += 1
            alt = attrs_dict.get("alt")
            if alt is None or not str(alt).strip():
                self.missing_alt_count += 1
        elif tag == "a":
            href = (attrs_dict.get("href") or "").strip()
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "title" and self._title_depth:
            self._title_depth -= 1
        if tag in {"script", "style", "noscript", "template"} and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data):
        value = re.sub(r"\s+", " ", data).strip()
        if not value:
            return
        if self._title_depth:
            self.title_parts.append(value)
        if not self._ignored_depth:
            self.text_parts.append(value)


def _allow_private_networks() -> bool:
    return bool(getattr(settings, "DIGITALAFARIN_CMS_AUDIT_ALLOW_PRIVATE_NETWORKS", False))


def _max_response_bytes() -> int:
    return int(getattr(settings, "DIGITALAFARIN_CMS_AUDIT_MAX_RESPONSE_BYTES", 2_000_000))


def _request_timeout() -> float:
    return float(getattr(settings, "DIGITALAFARIN_CMS_AUDIT_TIMEOUT", 10.0))


def validate_network_target(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise UnsafeAuditTarget("Audit target must be an http(s) URL with a hostname.")
    if _allow_private_networks():
        return
    try:
        addresses = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeAuditTarget(f"Could not resolve audit host: {parts.hostname}") from exc
    if not addresses:
        raise UnsafeAuditTarget("Audit host did not resolve to an address.")
    for result in addresses:
        ip = ipaddress.ip_address(result[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise UnsafeAuditTarget(f"Private or reserved audit target blocked: {ip}")


def normalize_url(base_url: str, href: str, allowed_host: str | None = None) -> str | None:
    href = (href or "").strip()
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return None
    joined = urljoin(base_url, href)
    parts = urlsplit(joined)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        return None
    if allowed_host and parts.hostname.lower() != allowed_host.lower():
        return None
    path = parts.path or "/"
    lower_path = path.lower()
    if any(lower_path.endswith(extension) for extension in SKIP_EXTENSIONS):
        return None
    # Query parameters are intentionally removed to avoid crawl traps/faceted navigation explosions.
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, "", ""))


class _SafeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_network_target(newurl)
        original = urlsplit(req.full_url)
        target = urlsplit(newurl)
        if original.hostname and target.hostname and original.hostname.lower() != target.hostname.lower():
            raise UnsafeAuditTarget("Cross-host redirect blocked during SEO audit.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def safe_fetch(url: str) -> FetchResult:
    validate_network_target(url)
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2"})
    opener = build_opener(_SafeRedirectHandler())
    started = time.monotonic()
    response = None
    try:
        response = opener.open(request, timeout=_request_timeout())
        status_code = int(getattr(response, "status", response.getcode()) or 0)
    except HTTPError as exc:
        response = exc
        status_code = int(exc.code)
    except (URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"HTTP fetch failed for {url}: {exc}") from exc

    response_ms = max(0, round((time.monotonic() - started) * 1000))
    headers = {str(key).lower(): str(value) for key, value in response.headers.items()}
    content_type = headers.get("content-type", "").split(";", 1)[0].strip().lower()
    max_bytes = _max_response_bytes()
    raw = response.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raw = raw[:max_bytes]
    charset = response.headers.get_content_charset() or "utf-8"
    try:
        body = raw.decode(charset, errors="replace")
    except LookupError:
        body = raw.decode("utf-8", errors="replace")
    final_url = response.geturl() or url
    validate_network_target(final_url)
    return FetchResult(
        url=url,
        final_url=final_url,
        status_code=status_code,
        content_type=content_type,
        body=body,
        response_ms=response_ms,
        headers=headers,
    )


def analyze_fetch(result: FetchResult, allowed_host: str) -> PageAnalysis:
    final_parts = urlsplit(result.final_url)
    analysis = PageAnalysis(
        url=result.url,
        final_url=result.final_url,
        path=final_parts.path or "/",
        status_code=result.status_code,
        content_type=result.content_type,
        response_ms=result.response_ms,
    )
    if "html" not in result.content_type and not result.body.lstrip().lower().startswith(("<!doctype html", "<html")):
        return analysis

    parser = _AuditHtmlParser()
    try:
        parser.feed(result.body)
    except Exception:
        # HTMLParser is intentionally forgiving, but malformed markup should never crash a run.
        pass

    analysis.title = re.sub(r"\s+", " ", " ".join(parser.title_parts)).strip()
    analysis.meta_description = parser.description.strip()
    analysis.robots = parser.robots.strip()
    analysis.is_indexable = "noindex" not in analysis.robots.lower()
    analysis.h1_count = parser.h1_count
    analysis.h2_count = parser.h2_count
    analysis.image_count = parser.image_count
    analysis.missing_alt_count = parser.missing_alt_count
    text = " ".join(parser.text_parts)
    analysis.word_count = len(re.findall(r"\w+", text, flags=re.UNICODE))

    canonical = normalize_url(result.final_url, parser.canonical, None) if parser.canonical else None
    analysis.canonical_url = canonical or ""

    internal: list[str] = []
    external: list[str] = []
    seen_internal: set[str] = set()
    seen_external: set[str] = set()
    for href in parser.links:
        absolute = normalize_url(result.final_url, href, None)
        if not absolute:
            continue
        hostname = urlsplit(absolute).hostname or ""
        if hostname.lower() == allowed_host.lower():
            if absolute not in seen_internal:
                seen_internal.add(absolute)
                internal.append(absolute)
        elif absolute not in seen_external:
            seen_external.add(absolute)
            external.append(absolute)
    analysis.internal_urls = internal
    analysis.external_urls = external
    return analysis


Fetcher = Callable[[str], FetchResult]
