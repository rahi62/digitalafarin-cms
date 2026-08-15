from django.contrib import admin
from .models import ContentTypeDefinition, ContentEntry, ContentRevision, Category, Tag, ReusableBlock, Menu, MenuItem
admin.site.register([ContentTypeDefinition,ContentEntry,ContentRevision,Category,Tag,ReusableBlock,Menu,MenuItem])
