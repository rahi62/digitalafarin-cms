from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.audit.comparison import compare_audit_runs, issue_fingerprint
from digitalafarin_cms.apps.audit.models import AuditIssue, AuditRun
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class AuditComparisonTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="trend-owner", password="x")
        self.org = Organization.objects.create(name="Trend Org", slug="trend-org")
        self.site = Site.objects.create(organization=self.org, name="Trend Site", domain="trend.example")
        Membership.objects.create(organization=self.org, user=self.user, role=Membership.Role.OWNER)
        self.baseline = AuditRun.objects.create(
            site=self.site,
            status=AuditRun.Status.DONE,
            health_score=60,
            pages_crawled=5,
            summary={"errors": 2, "warnings": 1},
        )
        self.current = AuditRun.objects.create(
            site=self.site,
            status=AuditRun.Status.DONE,
            health_score=82,
            pages_crawled=6,
            summary={"errors": 1, "warnings": 2},
        )

        AuditIssue.objects.create(
            run=self.baseline,
            url="https://trend.example/a/",
            code="missing_title",
            severity=AuditIssue.Severity.ERROR,
            title="Missing title",
        )
        AuditIssue.objects.create(
            run=self.baseline,
            url="https://trend.example/b/",
            code="thin_content",
            severity=AuditIssue.Severity.WARNING,
            title="Thin content",
        )
        AuditIssue.objects.create(
            run=self.baseline,
            url="https://trend.example/c/",
            code="broken_internal_link",
            severity=AuditIssue.Severity.ERROR,
            title="Broken link",
            details={"target": "https://trend.example/old-target/"},
        )

        AuditIssue.objects.create(
            run=self.current,
            url="https://trend.example/b/",
            code="thin_content",
            severity=AuditIssue.Severity.WARNING,
            title="Thin content",
        )
        AuditIssue.objects.create(
            run=self.current,
            url="https://trend.example/d/",
            code="images_missing_alt",
            severity=AuditIssue.Severity.WARNING,
            title="Missing alt",
        )
        AuditIssue.objects.create(
            run=self.current,
            url="https://trend.example/c/",
            code="broken_internal_link",
            severity=AuditIssue.Severity.ERROR,
            title="Broken link",
            details={"target": "https://trend.example/new-target/"},
        )

    def auth_client(self):
        client = APIClient()
        client.force_authenticate(self.user)
        return client

    def test_comparison_reports_new_fixed_persistent_and_score_delta(self):
        result = compare_audit_runs(self.current, self.baseline)
        self.assertTrue(result["has_baseline"])
        self.assertEqual(result["delta"]["health_score"], 22)
        self.assertEqual(result["delta"]["pages_crawled"], 1)
        self.assertEqual(result["counts"], {"new": 2, "fixed": 2, "persistent": 1})
        self.assertEqual({item["code"] for item in result["persistent_issues"]}, {"thin_content"})
        self.assertIn("images_missing_alt", {item["code"] for item in result["new_issues"]})
        self.assertIn("missing_title", {item["code"] for item in result["fixed_issues"]})

    def test_broken_link_target_is_part_of_fingerprint(self):
        old = self.baseline.issues.get(code="broken_internal_link")
        new = self.current.issues.get(code="broken_internal_link")
        self.assertNotEqual(issue_fingerprint(old), issue_fingerprint(new))

    def test_compare_endpoint_uses_previous_completed_run_automatically(self):
        response = self.auth_client().get(f"/api/cms/v1/audit/runs/{self.current.id}/compare/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["baseline"]["id"], str(self.baseline.id))
        self.assertEqual(response.data["counts"]["persistent"], 1)

    def test_compare_rejects_baseline_from_another_site(self):
        other_org = Organization.objects.create(name="Other Trend", slug="other-trend")
        other_site = Site.objects.create(organization=other_org, name="Other", domain="other-trend.example")
        Membership.objects.create(organization=other_org, user=self.user, role=Membership.Role.OWNER)
        other_run = AuditRun.objects.create(site=other_site, status=AuditRun.Status.DONE)
        response = self.auth_client().get(
            f"/api/cms/v1/audit/runs/{self.current.id}/compare/",
            {"baseline": str(other_run.id)},
        )
        self.assertEqual(response.status_code, 404)

    def test_first_run_has_no_baseline_and_all_issues_are_new(self):
        fresh_org = Organization.objects.create(name="Fresh", slug="fresh-trend")
        fresh_site = Site.objects.create(organization=fresh_org, name="Fresh", domain="fresh-trend.example")
        Membership.objects.create(organization=fresh_org, user=self.user, role=Membership.Role.OWNER)
        run = AuditRun.objects.create(site=fresh_site, status=AuditRun.Status.DONE, health_score=90)
        AuditIssue.objects.create(
            run=run,
            url="https://fresh-trend.example/",
            code="missing_meta_description",
            severity=AuditIssue.Severity.WARNING,
            title="Missing description",
        )
        response = self.auth_client().get(f"/api/cms/v1/audit/runs/{run.id}/compare/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["has_baseline"])
        self.assertEqual(response.data["counts"]["new"], 1)
        self.assertEqual(response.data["counts"]["fixed"], 0)
