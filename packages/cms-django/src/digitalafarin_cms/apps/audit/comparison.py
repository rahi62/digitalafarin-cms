from __future__ import annotations

from collections import Counter

from .models import AuditIssue, AuditRun


def issue_fingerprint(issue: AuditIssue) -> str:
    target = ""
    if issue.code == "broken_internal_link":
        target = str((issue.details or {}).get("target") or "")
    return f"{issue.code}|{issue.url}|{target}"


def issue_payload(issue: AuditIssue) -> dict:
    return {
        "id": str(issue.id),
        "code": issue.code,
        "severity": issue.severity,
        "title": issue.title,
        "url": issue.url,
        "page_path": issue.page.path if issue.page_id and issue.page else None,
        "details": issue.details or {},
    }


def _severity_counts(issues) -> dict:
    counts = Counter(issue.severity for issue in issues)
    return {
        "error": counts.get(AuditIssue.Severity.ERROR, 0),
        "warning": counts.get(AuditIssue.Severity.WARNING, 0),
        "notice": counts.get(AuditIssue.Severity.NOTICE, 0),
    }


def compare_audit_runs(current: AuditRun, baseline: AuditRun | None, limit: int = 100) -> dict:
    current_issues = list(current.issues.select_related("page").all())
    current_map = {issue_fingerprint(issue): issue for issue in current_issues}

    if baseline is None:
        new_keys = set(current_map)
        fixed_keys: set[str] = set()
        persistent_keys: set[str] = set()
        baseline_issues = []
        baseline_map = {}
    else:
        baseline_issues = list(baseline.issues.select_related("page").all())
        baseline_map = {issue_fingerprint(issue): issue for issue in baseline_issues}
        current_keys = set(current_map)
        baseline_keys = set(baseline_map)
        new_keys = current_keys - baseline_keys
        fixed_keys = baseline_keys - current_keys
        persistent_keys = current_keys & baseline_keys

    def payloads(keys, mapping):
        selected = [mapping[key] for key in keys]
        severity_order = {
            AuditIssue.Severity.ERROR: 0,
            AuditIssue.Severity.WARNING: 1,
            AuditIssue.Severity.NOTICE: 2,
        }
        selected.sort(key=lambda issue: (severity_order.get(issue.severity, 9), issue.code, issue.url))
        return [issue_payload(issue) for issue in selected[:limit]]

    current_severity = _severity_counts(current_issues)
    baseline_severity = _severity_counts(baseline_issues)

    return {
        "has_baseline": baseline is not None,
        "current": {
            "id": str(current.id),
            "created_at": current.created_at,
            "health_score": current.health_score,
            "pages_crawled": current.pages_crawled,
            "issues": len(current_map),
            "severity": current_severity,
        },
        "baseline": (
            {
                "id": str(baseline.id),
                "created_at": baseline.created_at,
                "health_score": baseline.health_score,
                "pages_crawled": baseline.pages_crawled,
                "issues": len(baseline_map),
                "severity": baseline_severity,
            }
            if baseline
            else None
        ),
        "delta": {
            "health_score": current.health_score - (baseline.health_score if baseline else 0),
            "pages_crawled": current.pages_crawled - (baseline.pages_crawled if baseline else 0),
            "issues": len(current_map) - len(baseline_map),
            "errors": current_severity["error"] - baseline_severity["error"],
            "warnings": current_severity["warning"] - baseline_severity["warning"],
        },
        "counts": {
            "new": len(new_keys),
            "fixed": len(fixed_keys),
            "persistent": len(persistent_keys),
        },
        "new_issues": payloads(new_keys, current_map),
        "fixed_issues": payloads(fixed_keys, baseline_map),
        "persistent_issues": payloads(persistent_keys, current_map),
        "truncated": {
            "new": len(new_keys) > limit,
            "fixed": len(fixed_keys) > limit,
            "persistent": len(persistent_keys) > limit,
        },
    }
