from __future__ import annotations

from collections import Counter, defaultdict
from urllib.parse import urlsplit

from django.utils import timezone

from digitalafarin_cms.apps.audit.models import AuditIssue, AuditRun
from digitalafarin_cms.apps.content.models import ContentEntry
from digitalafarin_cms.apps.integrations.search_performance import build_content_decay
from .models import SeoMeta


TECHNICAL_CODES = {
    "http_4xx",
    "http_5xx",
    "broken_internal_link",
    "canonical_mismatch",
    "missing_canonical",
    "redirected_url",
    "missing_h1",
    "multiple_h1",
    "noindex",
    "very_slow_response",
    "slow_response",
}

CONTENT_CODES = {"thin_content", "images_missing_alt"}
LINK_CODES = {"orphan_page", "no_internal_links", "broken_internal_link"}


def _priority(score: int):
    if score >= 65:
        return "high"
    if score >= 35:
        return "medium"
    return "low"


def _action(action_type, label, reason, recommendation, *, severity="notice", source="cms"):
    return {
        "type": action_type,
        "label": label,
        "reason": reason,
        "recommendation": recommendation,
        "severity": severity,
        "source": source,
    }


def _issue_path(issue):
    if issue.page_id and issue.page and issue.page.path:
        return issue.page.path
    try:
        return urlsplit(issue.url).path or "/"
    except ValueError:
        return ""


def _audit_context(site):
    run = (
        AuditRun.objects.filter(site=site, status=AuditRun.Status.DONE)
        .order_by("-finished_at", "-created_at")
        .first()
    )
    if not run:
        return None, {}, {}

    pages = {
        page.path: page
        for page in run.pages.all()
        if page.path
    }
    issues_by_path = defaultdict(list)
    for issue in (
        AuditIssue.objects.filter(run=run, is_resolved=False)
        .select_related("page")
        .order_by("severity", "code")
    ):
        path = _issue_path(issue)
        if path:
            issues_by_path[path].append(issue)
    return run, pages, issues_by_path


def _meta_problem(meta):
    if meta is None:
        return True
    return not meta.title or not meta.description or meta.seo_score < 70


def build_seo_opportunities(
    site,
    *,
    current_days=28,
    min_impressions=100,
    include_low=False,
    limit=100,
):
    decay = build_content_decay(
        site,
        current_days=current_days,
        baseline_days=current_days,
        min_impressions=min_impressions,
        include_healthy=False,
    )
    decay_by_path = {item["path"]: item for item in decay["results"]}
    audit_run, audit_pages, audit_issues = _audit_context(site)
    metas = {
        meta.entry_id: meta
        for meta in SeoMeta.objects.filter(entry__site=site).select_related("entry")
    }

    entries = list(
        ContentEntry.objects.filter(
            site=site,
            status=ContentEntry.Status.PUBLISHED,
            content_type__is_public=True,
        )
        .select_related("content_type")
        .order_by("title")
    )

    opportunities = []
    now = timezone.now()
    for entry in entries:
        path = entry.path
        decay_item = decay_by_path.get(path)
        page = audit_pages.get(path)
        issues = audit_issues.get(path, [])
        meta = metas.get(entry.id)
        issue_codes = Counter(issue.code for issue in issues)
        error_count = sum(1 for issue in issues if issue.severity == AuditIssue.Severity.ERROR)
        warning_count = sum(1 for issue in issues if issue.severity == AuditIssue.Severity.WARNING)
        actions = []
        score = 0.0

        if decay_item:
            score += decay_item["decay_score"] * 0.55
            signal_codes = {signal["code"] for signal in decay_item["signals"]}

            if signal_codes & {"ranking_decay", "content_refresh"}:
                signals = [signal for signal in decay_item["signals"] if signal["code"] in {"ranking_decay", "content_refresh"}]
                actions.append(
                    _action(
                        "refresh_content",
                        "Refresh content",
                        " ".join(signal["reason"] for signal in signals),
                        "Update stale sections, re-check search intent and competitors, then strengthen relevant internal links before republishing.",
                        severity="error" if "ranking_decay" in signal_codes else "warning",
                        source="search_performance",
                    )
                )

            if signal_codes & {"ctr_decay", "ctr_opportunity"}:
                actions.append(
                    _action(
                        "improve_snippet",
                        "Improve SERP snippet",
                        "Search visibility is not translating into enough clicks.",
                        "Rewrite title and meta description around the queries currently generating impressions; verify intent and SERP features.",
                        severity="warning",
                        source="search_performance",
                    )
                )

            if "demand_decay" in signal_codes:
                actions.append(
                    _action(
                        "investigate_demand",
                        "Investigate demand shift",
                        "Clicks and impressions declined together.",
                        "Check seasonality and query demand before rewriting. Consider repositioning, consolidating or expanding the topic only if demand supports it.",
                        severity="warning",
                        source="search_performance",
                    )
                )

            if "quick_win" in signal_codes:
                score += 12
                actions.append(
                    _action(
                        "quick_win",
                        "Quick-win optimization",
                        "The page already has meaningful impressions and near-page-one visibility.",
                        "Prioritize snippet improvements and a few strong contextual internal links; small ranking gains may unlock disproportionate clicks.",
                        severity="notice",
                        source="search_performance",
                    )
                )

        technical = [issue for issue in issues if issue.code in TECHNICAL_CODES]
        if technical:
            score += min(30, error_count * 12 + warning_count * 5)
            codes = ", ".join(dict.fromkeys(issue.code for issue in technical[:5]))
            actions.append(
                _action(
                    "fix_technical",
                    "Fix technical SEO",
                    f"Latest crawl reports: {codes}.",
                    "Resolve crawl/indexability/canonical/heading/response issues, then rerun SEO Audit to confirm the fix.",
                    severity="error" if error_count else "warning",
                    source="audit",
                )
            )

        content_audit = [issue for issue in issues if issue.code in CONTENT_CODES]
        if content_audit and not any(action["type"] == "refresh_content" for action in actions):
            score += min(12, len(content_audit) * 5)
            actions.append(
                _action(
                    "improve_content_quality",
                    "Improve on-page content",
                    "Latest crawl found thin-content or image-alt quality issues.",
                    "Improve content depth where justified and complete meaningful image alt text without keyword stuffing.",
                    severity="warning",
                    source="audit",
                )
            )

        link_problem = bool(issue_codes.keys() & LINK_CODES) or (page is not None and page.incoming_internal_links == 0)
        if link_problem:
            score += 12
            actions.append(
                _action(
                    "strengthen_internal_links",
                    "Strengthen internal links",
                    "The page has weak, missing or broken internal-link signals in the latest crawl.",
                    "Add contextual links from relevant authoritative pages and repair broken internal destinations; avoid sitewide boilerplate as the only support.",
                    severity="warning",
                    source="audit",
                )
            )

        if _meta_problem(meta):
            if meta is None:
                score += 20
                reason = "No page-level SeoMeta record exists."
            else:
                deficiency = max(0, 70 - meta.seo_score)
                score += min(18, 8 + deficiency * 0.25)
                missing = []
                if not meta.title:
                    missing.append("title")
                if not meta.description:
                    missing.append("description")
                reason = f"SEO score is {meta.seo_score}/100" + (f" and missing {', '.join(missing)}" if missing else "") + "."
            actions.append(
                _action(
                    "improve_on_page_seo",
                    "Improve page SEO",
                    reason,
                    "Complete the page metadata, focus keyword and on-page checks, then run the built-in SEO analyzer again.",
                    severity="warning",
                    source="seo_meta",
                )
            )

        age_days = max(0, (now.date() - entry.updated_at.date()).days)
        if age_days >= 365 and not any(action["type"] == "refresh_content" for action in actions):
            score += 8
            actions.append(
                _action(
                    "review_freshness",
                    "Review content freshness",
                    f"This published page has not been updated for {age_days} days.",
                    "Verify facts, dates, entities, examples, offers and screenshots; refresh only sections that are genuinely stale.",
                    severity="notice",
                    source="content",
                )
            )

        score = min(100, round(score))
        priority = _priority(score)
        if not actions or (priority == "low" and not include_low):
            continue

        search_metrics = None
        if decay_item:
            search_metrics = {
                "current": decay_item["current"],
                "delta": decay_item["delta"],
                "decay_score": decay_item["decay_score"],
            }

        opportunities.append(
            {
                "entry": {
                    "id": str(entry.id),
                    "title": entry.title,
                    "path": entry.path,
                    "updated_at": entry.updated_at.isoformat(),
                },
                "score": score,
                "priority": priority,
                "metrics": {
                    "search": search_metrics,
                    "seo_score": meta.seo_score if meta else None,
                    "audit_issue_count": len(issues),
                    "audit_errors": error_count,
                    "audit_warnings": warning_count,
                    "incoming_internal_links": page.incoming_internal_links if page else None,
                    "word_count": page.word_count if page else None,
                    "age_days": age_days,
                },
                "audit_issue_codes": dict(issue_codes),
                "actions": actions,
            }
        )

    opportunities.sort(
        key=lambda item: (
            item["score"],
            ((item["metrics"]["search"] or {}).get("current") or {}).get("impressions", 0),
        ),
        reverse=True,
    )
    limit = max(1, min(int(limit or 100), 500))
    opportunities = opportunities[:limit]

    action_counts = Counter(
        action["type"]
        for opportunity in opportunities
        for action in opportunity["actions"]
    )
    return {
        "site": str(site.id),
        "site_name": site.name,
        "sources": {
            "audit_run": str(audit_run.id) if audit_run else None,
            "audit_finished_at": audit_run.finished_at.isoformat() if audit_run and audit_run.finished_at else None,
            "search_windows": decay.get("windows"),
        },
        "summary": {
            "total": len(opportunities),
            "high": sum(1 for item in opportunities if item["priority"] == "high"),
            "medium": sum(1 for item in opportunities if item["priority"] == "medium"),
            "low": sum(1 for item in opportunities if item["priority"] == "low"),
            "actions": dict(action_counts),
        },
        "results": opportunities,
    }
