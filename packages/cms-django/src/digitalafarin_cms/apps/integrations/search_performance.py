from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from urllib.parse import urlsplit

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from digitalafarin_cms.apps.content.models import ContentEntry
from .models import SearchImportRun, SearchPerformanceDaily


def _hostname(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    parsed = urlsplit(value if "://" in value else f"//{value}")
    return (parsed.hostname or "").lower().rstrip(".")


def allowed_search_hosts(site) -> set[str]:
    hosts = {_hostname(site.domain)}
    settings = site.settings or {}
    for key in ("frontend_url", "audit_base_url"):
        host = _hostname(str(settings.get(key) or ""))
        if host:
            hosts.add(host)
    return {host for host in hosts if host}


def normalize_search_path(site, raw_page: str) -> tuple[str, str]:
    raw_page = str(raw_page or "").strip()
    if not raw_page:
        raise ValueError("page is required")

    page_url = ""
    if raw_page.startswith(("http://", "https://")):
        parsed = urlsplit(raw_page)
        host = (parsed.hostname or "").lower().rstrip(".")
        if not host or host not in allowed_search_hosts(site):
            raise ValueError("page URL does not belong to the selected site")
        path = parsed.path or "/"
        page_url = raw_page.split("#", 1)[0]
    else:
        parsed = urlsplit(raw_page if raw_page.startswith("/") else f"/{raw_page}")
        path = parsed.path or "/"

    if not path.startswith("/"):
        path = f"/{path}"
    while "//" in path:
        path = path.replace("//", "/")

    entry = match_entry(site, path)
    return (entry.path if entry else path), page_url


def match_entry(site, path: str):
    candidates = [path]
    if path != "/":
        candidates.append(path.rstrip("/"))
        candidates.append(f"{path.rstrip('/')}/")
    return ContentEntry.objects.filter(site=site, path__in=list(dict.fromkeys(candidates))).first()


def _clean_top_queries(value):
    if not isinstance(value, list):
        return []
    cleaned = []
    for item in value[:25]:
        if isinstance(item, str):
            query = item.strip()
            if query:
                cleaned.append({"query": query})
        elif isinstance(item, dict):
            query = str(item.get("query") or "").strip()
            if not query:
                continue
            cleaned.append(
                {
                    "query": query,
                    "clicks": max(0, int(item.get("clicks") or 0)),
                    "impressions": max(0, int(item.get("impressions") or 0)),
                    "position": max(0.0, float(item.get("position") or 0.0)),
                }
            )
    return cleaned


@transaction.atomic
def import_search_performance(site, rows, *, provider="manual", source_label=""):
    if not rows:
        raise ValueError("At least one search performance row is required")
    if len(rows) > 5000:
        raise ValueError("A single import is limited to 5000 rows")

    prepared = []
    for row in rows:
        path, page_url = normalize_search_path(site, row["page"])
        impressions = max(0, int(row.get("impressions") or 0))
        clicks = max(0, int(row.get("clicks") or 0))
        if clicks > impressions and impressions > 0:
            raise ValueError(f"clicks cannot exceed impressions for {path}")
        ctr = row.get("ctr")
        ctr = (clicks / impressions) if ctr in (None, "") and impressions else float(ctr or 0.0)
        if ctr > 1:
            ctr = ctr / 100.0
        if ctr < 0 or ctr > 1:
            raise ValueError(f"ctr must be between 0 and 1 for {path}")
        position = max(0.0, float(row.get("position") or 0.0))
        entry = match_entry(site, path)
        prepared.append(
            {
                "date": row["date"],
                "path": entry.path if entry else path,
                "page_url": page_url,
                "entry": entry,
                "clicks": clicks,
                "impressions": impressions,
                "ctr": ctr,
                "position": position,
                "top_queries": _clean_top_queries(row.get("top_queries")),
            }
        )

    dates = [item["date"] for item in prepared]
    run = SearchImportRun.objects.create(
        site=site,
        provider=provider,
        status=SearchImportRun.Status.COMPLETED,
        source_label=str(source_label or "")[:160],
        date_start=min(dates),
        date_end=max(dates),
        rows_received=len(prepared),
        rows_upserted=0,
        metadata={"mode": "page_daily"},
    )

    upserted = 0
    source = SearchPerformanceDaily.Source.GSC if provider == SearchImportRun.Provider.GSC else SearchPerformanceDaily.Source.MANUAL
    for item in prepared:
        SearchPerformanceDaily.objects.update_or_create(
            site=site,
            date=item["date"],
            path=item["path"],
            defaults={
                "entry": item["entry"],
                "page_url": item["page_url"],
                "clicks": item["clicks"],
                "impressions": item["impressions"],
                "ctr": item["ctr"],
                "position": item["position"],
                "top_queries": item["top_queries"],
                "source": source,
            },
        )
        upserted += 1

    run.rows_upserted = upserted
    run.save(update_fields=["rows_upserted", "updated_at"])
    return run


def _pct_change(current: float, baseline: float):
    if baseline == 0:
        return None if current == 0 else 100.0
    return ((current - baseline) / baseline) * 100.0


def _round(value, digits=2):
    return round(float(value or 0.0), digits)


def _aggregate(rows):
    data = defaultdict(
        lambda: {
            "clicks": 0,
            "impressions": 0,
            "position_weighted": 0.0,
            "position_weight": 0,
            "positions": [],
            "entry": None,
        }
    )
    for row in rows:
        item = data[row.path]
        item["clicks"] += row.clicks
        item["impressions"] += row.impressions
        item["positions"].append(row.position)
        if row.impressions:
            item["position_weighted"] += row.position * row.impressions
            item["position_weight"] += row.impressions
        if item["entry"] is None and row.entry_id:
            item["entry"] = row.entry

    result = {}
    for path, item in data.items():
        impressions = item["impressions"]
        clicks = item["clicks"]
        if item["position_weight"]:
            position = item["position_weighted"] / item["position_weight"]
        else:
            positions = item["positions"]
            position = sum(positions) / len(positions) if positions else 0.0
        result[path] = {
            "clicks": clicks,
            "impressions": impressions,
            "ctr": clicks / impressions if impressions else 0.0,
            "position": position,
            "entry": item["entry"],
        }
    return result


def _signal(code, label, severity, reason, recommendation):
    return {
        "code": code,
        "label": label,
        "severity": severity,
        "reason": reason,
        "recommendation": recommendation,
    }


def build_content_decay(
    site,
    *,
    current_days=28,
    baseline_days=None,
    min_impressions=100,
    current_end: date | None = None,
    include_healthy=False,
):
    current_days = max(7, min(int(current_days or 28), 90))
    baseline_days = max(7, min(int(baseline_days or current_days), 90))
    min_impressions = max(0, int(min_impressions or 0))

    performance = SearchPerformanceDaily.objects.filter(site=site).select_related("entry")
    latest = performance.aggregate(latest=Max("date"))["latest"]
    if latest is None:
        return {
            "site": str(site.id),
            "site_name": site.name,
            "windows": None,
            "summary": {"pages_analyzed": 0, "flagged": 0, "high_priority": 0},
            "results": [],
        }

    current_end = current_end or latest
    current_start = current_end - timedelta(days=current_days - 1)
    baseline_end = current_start - timedelta(days=1)
    baseline_start = baseline_end - timedelta(days=baseline_days - 1)

    rows = list(
        performance.filter(date__gte=baseline_start, date__lte=current_end).order_by("date")
    )
    current = _aggregate([row for row in rows if current_start <= row.date <= current_end])
    baseline = _aggregate([row for row in rows if baseline_start <= row.date <= baseline_end])

    results = []
    now = timezone.now()
    for path in sorted(set(current) | set(baseline)):
        cur = current.get(path, {"clicks": 0, "impressions": 0, "ctr": 0.0, "position": 0.0, "entry": None})
        base = baseline.get(path, {"clicks": 0, "impressions": 0, "ctr": 0.0, "position": 0.0, "entry": None})
        if max(cur["impressions"], base["impressions"]) < min_impressions:
            continue

        clicks_delta = _pct_change(cur["clicks"], base["clicks"])
        impressions_delta = _pct_change(cur["impressions"], base["impressions"])
        ctr_delta = _pct_change(cur["ctr"], base["ctr"])
        position_delta = cur["position"] - base["position"] if base["position"] else 0.0
        entry = cur.get("entry") or base.get("entry")
        age_days = None
        if entry and entry.updated_at:
            age_days = max(0, (now.date() - entry.updated_at.date()).days)

        signals = []
        clicks_down = clicks_delta is not None and clicks_delta <= -20
        impressions_stable = impressions_delta is not None and impressions_delta > -15
        impressions_down = impressions_delta is not None and impressions_delta <= -20
        ctr_down = ctr_delta is not None and ctr_delta <= -15
        ranking_worse = position_delta >= 1.0

        if clicks_down and impressions_stable and ranking_worse:
            signals.append(
                _signal(
                    "ranking_decay",
                    "Ranking loss",
                    "error" if position_delta >= 2.5 or clicks_delta <= -35 else "warning",
                    "Clicks dropped while search demand stayed relatively stable and average position worsened.",
                    "Refresh the page, compare SERP competitors, strengthen internal links and inspect intent drift.",
                )
            )
        elif clicks_down and impressions_stable and ctr_down:
            signals.append(
                _signal(
                    "ctr_decay",
                    "CTR loss",
                    "warning",
                    "Impressions stayed stable but clicks and CTR fell without a matching ranking loss.",
                    "Rework title/meta for current intent and inspect SERP features or snippet cannibalization.",
                )
            )

        if clicks_down and impressions_down:
            signals.append(
                _signal(
                    "demand_decay",
                    "Demand decline",
                    "warning",
                    "Clicks and impressions declined together, which can indicate demand, seasonality or topical decline.",
                    "Validate seasonality and query demand before rewriting; consolidate or reposition content if demand has shifted.",
                )
            )

        if impressions_delta is not None and impressions_delta >= 15 and ctr_down:
            signals.append(
                _signal(
                    "ctr_opportunity",
                    "CTR opportunity",
                    "warning",
                    "Search visibility increased but CTR declined.",
                    "Prioritize title/meta testing and align the snippet with the queries now generating impressions.",
                )
            )

        if age_days is not None and age_days >= 180 and clicks_delta is not None and clicks_delta <= -15:
            signals.append(
                _signal(
                    "content_refresh",
                    "Content refresh",
                    "warning" if age_days >= 365 else "notice",
                    f"The entry has not been updated for {age_days} days while clicks declined.",
                    "Review outdated sections, examples, entities, statistics, FAQ coverage and internal links before republishing.",
                )
            )

        if cur["impressions"] >= max(500, min_impressions) and 4 <= cur["position"] <= 15 and cur["ctr"] < 0.03:
            signals.append(
                _signal(
                    "quick_win",
                    "Quick win",
                    "notice",
                    "The page already has meaningful visibility and ranks near page one, but CTR is still low.",
                    "Improve snippet relevance and add supporting internal links; small ranking gains may unlock disproportionate clicks.",
                )
            )

        if not signals and not include_healthy:
            continue

        score = 0.0
        if clicks_delta is not None and clicks_delta < 0:
            score += min(45, abs(clicks_delta) * 0.7)
        if position_delta > 0:
            score += min(30, position_delta * 10)
        if impressions_delta is not None and impressions_delta < -20:
            score += min(15, abs(impressions_delta) * 0.25)
        if age_days is not None and age_days >= 365:
            score += 10
        if any(signal["code"] == "ctr_opportunity" for signal in signals):
            score = max(score, 35)
        score = min(100, round(score))

        severities = {signal["severity"] for signal in signals}
        priority = "high" if "error" in severities or score >= 70 else "medium" if "warning" in severities or score >= 35 else "low"
        results.append(
            {
                "path": path,
                "entry": {
                    "id": str(entry.id),
                    "title": entry.title,
                    "updated_at": entry.updated_at.isoformat(),
                    "status": entry.status,
                } if entry else None,
                "current": {
                    "clicks": cur["clicks"],
                    "impressions": cur["impressions"],
                    "ctr": _round(cur["ctr"] * 100),
                    "position": _round(cur["position"]),
                },
                "baseline": {
                    "clicks": base["clicks"],
                    "impressions": base["impressions"],
                    "ctr": _round(base["ctr"] * 100),
                    "position": _round(base["position"]),
                },
                "delta": {
                    "clicks_pct": None if clicks_delta is None else _round(clicks_delta),
                    "impressions_pct": None if impressions_delta is None else _round(impressions_delta),
                    "ctr_pct": None if ctr_delta is None else _round(ctr_delta),
                    "position": _round(position_delta),
                },
                "age_days": age_days,
                "decay_score": score,
                "priority": priority,
                "signals": signals,
            }
        )

    results.sort(key=lambda item: (item["decay_score"], item["current"]["impressions"]), reverse=True)
    summary = {
        "pages_analyzed": len(set(current) | set(baseline)),
        "flagged": len(results),
        "high_priority": sum(1 for item in results if item["priority"] == "high"),
        "ranking_decay": sum(1 for item in results if any(s["code"] == "ranking_decay" for s in item["signals"])),
        "ctr_issues": sum(1 for item in results if any(s["code"] in {"ctr_decay", "ctr_opportunity"} for s in item["signals"])),
        "demand_decay": sum(1 for item in results if any(s["code"] == "demand_decay" for s in item["signals"])),
        "refresh_candidates": sum(1 for item in results if any(s["code"] == "content_refresh" for s in item["signals"])),
        "quick_wins": sum(1 for item in results if any(s["code"] == "quick_win" for s in item["signals"])),
    }
    return {
        "site": str(site.id),
        "site_name": site.name,
        "windows": {
            "current": {"start": current_start.isoformat(), "end": current_end.isoformat(), "days": current_days},
            "baseline": {"start": baseline_start.isoformat(), "end": baseline_end.isoformat(), "days": baseline_days},
            "latest_data_date": latest.isoformat(),
        },
        "summary": summary,
        "results": results,
    }
