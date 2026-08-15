from django.contrib import admin
from .models import Organization, Site, Membership
admin.site.register([Organization, Site, Membership])
