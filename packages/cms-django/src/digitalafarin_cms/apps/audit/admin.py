from django.contrib import admin
from .models import AuditRun, AuditIssue
admin.site.register([AuditRun,AuditIssue])
