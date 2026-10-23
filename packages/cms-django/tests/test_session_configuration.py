from django.core.checks import run_checks
from django.test import SimpleTestCase, override_settings


class SessionConfigurationTests(SimpleTestCase):
    def errors_for(self, authenticators):
        with override_settings(REST_FRAMEWORK={"DEFAULT_AUTHENTICATION_CLASSES": authenticators}):
            return [issue.id for issue in run_checks() if issue.id.startswith("digitalafarin_cms.")]

    def test_default_session_authentication_is_accepted(self):
        self.assertNotIn("digitalafarin_cms.E002", self.errors_for([
            "digitalafarin_cms.session_auth.CmsSessionJWTAuthentication",
        ]))

    def test_host_plain_jwt_override_is_rejected(self):
        self.assertIn("digitalafarin_cms.E002", self.errors_for([
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ]))

    def test_earlier_plain_jwt_cannot_bypass_later_session_authenticator(self):
        self.assertIn("digitalafarin_cms.E002", self.errors_for([
            "rest_framework_simplejwt.authentication.JWTAuthentication",
            "digitalafarin_cms.session_auth.CmsSessionJWTAuthentication",
        ]))

    def test_session_authenticator_before_plain_jwt_is_accepted(self):
        self.assertNotIn("digitalafarin_cms.E002", self.errors_for([
            "digitalafarin_cms.session_auth.CmsSessionJWTAuthentication",
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ]))

    def test_missing_and_unimportable_authenticators_report_configuration_error(self):
        for authenticators in ([], ["missing.module.Authentication"]):
            with self.subTest(authenticators=authenticators):
                self.assertIn("digitalafarin_cms.E002", self.errors_for(authenticators))

    def test_disabling_refresh_rotation_or_blacklist_is_rejected(self):
        from django.conf import settings
        for option in ('ROTATE_REFRESH_TOKENS', 'BLACKLIST_AFTER_ROTATION'):
            with self.subTest(option=option), override_settings(SIMPLE_JWT={
                **settings.SIMPLE_JWT, option: False,
            }):
                self.assertIn('digitalafarin_cms.E003', [issue.id for issue in run_checks()])

    def test_deployment_warns_when_legacy_tokens_bypass_managed_session_requirement(self):
        with override_settings(DIGITALAFARIN_CMS_REQUIRE_MANAGED_SESSIONS=False):
            self.assertIn('digitalafarin_cms.W002', [
                issue.id for issue in run_checks(include_deployment_checks=True)
            ])
        with override_settings(DIGITALAFARIN_CMS_REQUIRE_MANAGED_SESSIONS=True):
            self.assertNotIn('digitalafarin_cms.W002', [
                issue.id for issue in run_checks(include_deployment_checks=True)
            ])

    def test_deployment_warns_when_database_ignores_row_locks(self):
        from unittest.mock import patch
        from django.db import connections
        for supported in (False, True):
            with self.subTest(supported=supported), patch.object(
                connections['default'].features, 'has_select_for_update', supported,
            ):
                issues = [issue.id for issue in run_checks(include_deployment_checks=True)]
                self.assertEqual('digitalafarin_cms.W003' in issues, not supported)

    def test_missing_blacklist_app_is_rejected(self):
        from django.conf import settings
        with override_settings(INSTALLED_APPS=[
            app for app in settings.INSTALLED_APPS
            if app != 'rest_framework_simplejwt.token_blacklist'
        ]):
            self.assertIn('digitalafarin_cms.E003', [issue.id for issue in run_checks()])
