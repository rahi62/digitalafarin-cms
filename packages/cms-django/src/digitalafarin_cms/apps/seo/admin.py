from django.contrib import admin
from .models import SeoMeta, SchemaMarkup, KeywordCluster, Keyword, KeywordMapping, Redirect, InternalLinkSuggestion
admin.site.register([SeoMeta,SchemaMarkup,KeywordCluster,Keyword,KeywordMapping,Redirect,InternalLinkSuggestion])
