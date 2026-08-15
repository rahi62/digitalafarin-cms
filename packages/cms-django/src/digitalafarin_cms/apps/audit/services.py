from __future__ import annotations

from collections import Counter, defaultdict, deque
from urllib.parse import urljoin, urlsplit, urlunsplit

from django.db.models import Count
from django.utils import timezone

from digitalafarin_cms.apps.content.models import ContentEntry
from .crawler import Fetcher, PageAnalysis, analyze_fetch, normalize_url, safe_fetch
from .models import AuditIssue, AuditPage, AuditRun


SEVERITY_PENALTY = {
    AuditIssue.Severity.ERROR: 15,
    AuditIssue.Severity.WARNING: 5,
    AuditIssue.Severity.NOTICE: 2,
}


def site_audit_base_url(site) -> str:
    configured = ((site.settings or {}).get("audit_base_url") or (site.settings or {}).get("frontend_url") or "").strip()
    value = configured or str(site.domain).strip()
    if not value.startswith(("http://", "https://")):
        value = f"https://{value}"
    parts = urlsplit(value)
    if not parts.hostname:
        raise ValueError("Site audit URL does not contain a valid hostname.")
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), "", "", ""))


def _issue(page: AuditPage, code: str, severity: str, title: str, **details):
    return AuditIssue(
        run=page.run,
        page=page,
        url=page.url,
        code=code,
        severity=severity,
        title=title,
        details=details,
    )


def page_issues(page: AuditPage) -> list[AuditIssue]:
    issues: list[AuditIssue] = []
    status = page.status_code

    if status == 0:
        return issues
    if 400 <= status < 500:
        issues.append(_issue(page, "http_4xx", AuditIssue.Severity.ERROR, f"HTTP {status} client error", status_code=status))
    elif status >= 500:
        issues.append(_issue(page, "http_5xx", AuditIssue.Severity.ERROR, f"HTTP {status} server error", status_code=status))

    if page.final_url and page.final_url.rstrip("/") != page.url.rstrip("/"):
        issues.append(_issue(page, "redirected_url", AuditIssue.Severity.NOTICE, "URL redirects", final_url=page.final_url))

    if "html" not in page.content_type:
        return issues

    title_length = len(page.title)
    description_length = len(page.meta_description)
    if not page.title:
        issues.append(_issue(page, "missing_title", AuditIssue.Severity.ERROR, "Missing HTML title"))
    elif title_length < 30:
        issues.append(_issue(page, "short_title", AuditIssue.Severity.NOTICE, "Title is shorter than recommended", length=title_length))
    elif title_length > 65:
        issues.append(_issue(page, "long_title", AuditIssue.Severity.WARNING, "Title is too long", length=title_length))

    if not page.meta_description:
        issues.append(_issue(page, "missing_meta_description", AuditIssue.Severity.WARNING, "Missing meta description"))
    elif description_length < 70:
        issues.append(_issue(page, "short_meta_description", AuditIssue.Severity.NOTICE, "Meta description is short", length=description_length))
    elif description_length > 180:
        issues.append(_issue(page, "long_meta_description", AuditIssue.Severity.WARNING, "Meta description is too long", length=description_length))

    if page.h1_count == 0:
        issues.append(_issue(page, "missing_h1", AuditIssue.Severity.WARNING, "Page has no H1"))
    elif page.h1_count > 1:
        issues.append(_issue(page, "multiple_h1", AuditIssue.Severity.WARNING, "Page has multiple H1 headings", count=page.h1_count))

    if not page.is_indexable:
        issues.append(_issue(page, "noindex", AuditIssue.Severity.WARNING, "Page is marked noindex", robots=page.robots))
    if not page.canonical_url:
        issues.append(_issue(page, "missing_canonical", AuditIssue.Severity.NOTICE, "Canonical URL is missing"))
    elif page.final_url and page.canonical_url.rstrip("/") != page.final_url.rstrip("/"):
        issues.append(_issue(page, "canonical_mismatch", AuditIssue.Severity.WARNING, "Canonical points to a different URL", canonical=page.canonical_url, final_url=page.final_url))

    if page.word_count < 250:
        issues.append(_issue(page, "thin_content", AuditIssue.Severity.WARNING, "Page has thin content", word_count=page.word_count))
    if page.missing_alt_count:
        issues.append(_issue(page, "images_missing_alt", AuditIssue.Severity.WARNING, "Images are missing alt text", missing=page.missing_alt_count, images=page.image_count))
    if page.internal_links == 0:
        issues.append(_issue(page, "no_internal_links", AuditIssue.Severity.NOTICE, "Page has no internal links"))
    if page.response_ms >= 5000:
        issues.append(_issue(page, "very_slow_response", AuditIssue.Severity.WARNING, "Server response is very slow", response_ms=page.response_ms))
    elif page.response_ms >= 1500:
        issues.append(_issue(page, "slow_response", AuditIssue.Severity.NOTICE, "Server response is slow", response_ms=page.response_ms))
    return issues


def _page_from_analysis(run: AuditRun, analysis: PageAnalysis) -> AuditPage:
    return AuditPage.objects.create(
        run=run,
        url=analysis.url,
        final_url=analysis.final_url,
        path=analysis.path,
        status_code=analysis.status_code,
        content_type=analysis.content_type,
        response_ms=analysis.response_ms,
        title=analysis.title,
        meta_description=analysis.meta_description,
        canonical_url=analysis.canonical_url,
        robots=analysis.robots,
        is_indexable=analysis.is_indexable,
        h1_count=analysis.h1_count,
        h2_count=analysis.h2_count,
        word_count=analysis.word_count,
        image_count=analysis.image_count,
        missing_alt_count=analysis.missing_alt_count,
        internal_links=len(analysis.internal_urls),
        external_links=len(analysis.external_urls),
    )


def _duplicate_issues(run: AuditRun, pages: list[AuditPage], attribute: str, code: str, label: str) -> list[AuditIssue]:
    grouped: dict[str, list[AuditPage]] = defaultdict(list)
    for page in pages:
        value = str(getattr(page, attribute, "") or "").strip().casefold()
        if value and page.status_code < 400 and "html" in page.content_type:
            grouped[value].append(page)
    issues: list[AuditIssue] = []
    for duplicates in grouped.values():
        if len(duplicates) < 2:
            continue
        urls = [page.url for page in duplicates]
        for page in duplicates:
            issues.append(_issue(page, code, AuditIssue.Severity.WARNING, label, duplicates=urls))
    return issues


def _calculate_score(pages: int, severity_counts: Counter) -> int:
    if pages <= 0:
        return 0
    penalty = sum(SEVERITY_PENALTY.get(severity, 0) * count for severity, count in severity_counts.items())
    return max(0, min(100, round(100 - penalty / pages)))


def execute_audit(run: AuditRun, fetcher: Fetcher = safe_fetch) -> dict:
    run.status = AuditRun.Status.RUNNING
    run.started_at = timezone.now()
    run.finished_at = None
    run.health_score = 0
    run.pages_crawled = 0
    run.summary = {}
    run.save(update_fields=["status", "started_at", "finished_at", "health_score", "pages_crawled", "summary", "updated_at"])
    run.issues.all().delete()
    run.pages.all().delete()

    base_url = site_audit_base_url(run.site)
    allowed_host = (urlsplit(base_url).hostname or "").lower()
    max_pages = max(1, min(int(run.max_pages or 100), 500))

    published_paths = list(
        ContentEntry.objects.filter(
            site=run.site,
            status=ContentEntry.Status.PUBLISHED,
            content_type__is_public=True,
        ).values_list("path", flat=True)
    )
    seed_urls: list[str] = []
    for path in ["/", *published_paths]:
        normalized = normalize_url(base_url, urljoin(base_url + "/", path), allowed_host)
        if normalized and normalized not in seed_urls:
            seed_urls.append(normalized)

    queue = deque(seed_urls)
    queued = set(seed_urls)
    seen: set[str] = set()
    pages: list[AuditPage] = []
    page_by_url: dict[str, AuditPage] = {}
    graph: dict[str, set[str]] = defaultdict(set)
    all_issues: list[AuditIssue] = []

    while queue and len(pages) < max_pages:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        try:
            result = fetcher(url)
            analysis = analyze_fetch(result, allowed_host)
            page = _page_from_analysis(run, analysis)
            pages.append(page)
            page_by_url[url] = page
            graph[url].update(analysis.internal_urls)
            all_issues.extend(page_issues(page))
            for target in analysis.internal_urls:
                normalized_target = normalize_url(url, target, allowed_host)
                if normalized_target and normalized_target not in queued and normalized_target not in seen and len(queued) < max_pages * 5:
                    queued.add(normalized_target)
                    queue.append(normalized_target)
        except Exception as exc:
            page = AuditPage.objects.create(
                run=run,
                url=url,
                final_url=url,
                path=urlsplit(url).path or "/",
                status_code=0,
                is_indexable=False,
            )
            pages.append(page)
            page_by_url[url] = page
            all_issues.append(_issue(page, "fetch_error", AuditIssue.Severity.ERROR, "Could not fetch URL", error=str(exc)[:1000]))

    incoming = Counter()
    for source, targets in graph.items():
        for target in targets:
            if target in page_by_url:
                incoming[target] += 1
                target_page = page_by_url[target]
                if target_page.status_code == 0 or target_page.status_code >= 400:
                    source_page = page_by_url.get(source)
                    if source_page:
                        all_issues.append(_issue(
                            source_page,
                            "broken_internal_link",
                            AuditIssue.Severity.ERROR,
                            "Broken internal link",
                            target=target,
                            target_status=target_page.status_code,
                        ))

    seed_set = set(seed_urls)
    for page in pages:
        count = int(incoming.get(page.url, 0))
        page.incoming_internal_links = count
        if page.url in seed_set and page.path != "/" and count == 0 and page.status_code < 400:
            all_issues.append(_issue(page, "orphan_page", AuditIssue.Severity.WARNING, "Published page has no incoming internal links"))

    all_issues.extend(_duplicate_issues(run, pages, "title", "duplicate_title", "Duplicate page title"))
    all_issues.extend(_duplicate_issues(run, pages, "meta_description", "duplicate_meta_description", "Duplicate meta description"))

    if all_issues:
        AuditIssue.objects.bulk_create(all_issues)

    issue_counts_by_page = {
        row["page_id"]: row["count"]
        for row in AuditIssue.objects.filter(run=run, page__isnull=False)
        .values("page_id")
        .annotate(count=Count("id"))
    }
    for page in pages:
        page.issue_count = int(issue_counts_by_page.get(page.id, 0))
    if pages:
        AuditPage.objects.bulk_update(pages, ["incoming_internal_links", "issue_count"])

    severity_counts = Counter(
        AuditIssue.objects.filter(run=run).values_list("severity", flat=True)
    )
    code_counts = Counter(AuditIssue.objects.filter(run=run).values_list("code", flat=True))
    status_counts = Counter(str(page.status_code) for page in pages)
    html_pages = [page for page in pages if "html" in page.content_type]
    indexable_pages = sum(1 for page in html_pages if page.is_indexable and 200 <= page.status_code < 400)
    response_values = [page.response_ms for page in pages if page.response_ms > 0]
    score = _calculate_score(len(pages), severity_counts)
    summary = {
        "issues": sum(severity_counts.values()),
        "errors": severity_counts.get(AuditIssue.Severity.ERROR, 0),
        "warnings": severity_counts.get(AuditIssue.Severity.WARNING, 0),
        "notices": severity_counts.get(AuditIssue.Severity.NOTICE, 0),
        "issue_codes": dict(code_counts.most_common()),
        "status_codes": dict(status_counts),
        "html_pages": len(html_pages),
        "indexable_pages": indexable_pages,
        "avg_response_ms": round(sum(response_values) / len(response_values)) if response_values else 0,
        "crawl_limit_reached": bool(queue and len(pages) >= max_pages),
        "max_pages": max_pages,
        "base_url": base_url,
    }

    run.status = AuditRun.Status.DONE
    run.finished_at = timezone.now()
    run.pages_crawled = len(pages)
    run.health_score = score
    run.summary = summary
    run.save(update_fields=["status", "finished_at", "pages_crawled", "health_score", "summary", "updated_at"])
    return {"pages": len(pages), "issues": summary["issues"], "score": score, "summary": summary}
