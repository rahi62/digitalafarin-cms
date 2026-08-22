from django.contrib import admin

from .models import SearchImportRun, SearchPerformanceDaily, WebhookEndpoint


@admin.register(SearchPerformanceDaily)
class SearchPerformanceDailyAdmin(admin.ModelAdmin):
    list_display = ("site", "date", "path", "clicks", "impressions", "ctr", "position", "source")
    list_filter = ("site", "source", "date")
    search_fields = ("path", "page_url", "entry__title")
    date_hierarchy = "date"


@admin.register(SearchImportRun)
class SearchImportRunAdmin(admin.ModelAdmin):
    list_display = ("site", "provider", "status", "date_start", "date_end", "rows_upserted", "created_at")
    list_filter = ("provider", "status", "site")
    search_fields = ("source_label", "site__name", "site__domain")


admin.site.register(WebhookEndpoint)
