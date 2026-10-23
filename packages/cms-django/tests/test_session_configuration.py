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
