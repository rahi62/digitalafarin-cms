from django.conf import settings
from django.db import models
from digitalafarin_cms.apps.common.models import UUIDTimeStampedModel

class Organization(UUIDTimeStampedModel):
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=160, unique=True)
    is_active = models.BooleanField(default=True)
    def __str__(self): return self.name

class Site(UUIDTimeStampedModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="sites")
    name = models.CharField(max_length=160)
    domain = models.CharField(max_length=255, unique=True)
    default_language = models.CharField(max_length=10, default="fa")
    timezone = models.CharField(max_length=64, default="Asia/Tehran")
    is_active = models.BooleanField(default=True)
    settings = models.JSONField(default=dict, blank=True)
    def __str__(self): return f"{self.name} ({self.domain})"

class Membership(UUIDTimeStampedModel):
    class Role(models.TextChoices):
        OWNER="owner","Owner"; ADMIN="admin","Admin"; SEO="seo","SEO Manager"; EDITOR="editor","Editor"; WRITER="writer","Writer"; VIEWER="viewer","Viewer"
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cms_memberships")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)
    class Meta:
        constraints=[models.UniqueConstraint(fields=["organization","user"], name="unique_org_member")]


class CmsUserSession(UUIDTimeStampedModel):
    """User-wide CMS login session; shared across tenants and all CMS API servers."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cms_login_sessions")
    refresh_expires_at = models.DateTimeField()
    last_seen_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "revoked_at", "refresh_expires_at"],
                         name="cms_user_session_lookup"),
        ]


class CmsLoginRateBucket(models.Model):
    """Short-lived HMAC identifiers and counters; never raw account/IP/password data."""
    key = models.CharField(max_length=64, primary_key=True)
    attempts = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(db_index=True)
