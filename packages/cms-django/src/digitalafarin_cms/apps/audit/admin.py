from django.contrib import admin

from .models import AuditIssue, AuditPage, AuditRun

admin.site.register([AuditRun, AuditPage, AuditIssue])
