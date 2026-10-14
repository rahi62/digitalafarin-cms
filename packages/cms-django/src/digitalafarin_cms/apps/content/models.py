from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from digitalafarin_cms.apps.common.models import UUIDTimeStampedModel
from digitalafarin_cms.apps.sites.models import Site

class ContentTypeDefinition(UUIDTimeStampedModel):
    class Kind(models.TextChoices):
        COLLECTION = "collection", "Collection"
        SINGLETON = "singleton", "Singleton"

    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.COLLECTION)
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="content_types")
    name=models.CharField(max_length=120)
    slug=models.SlugField(max_length=120)
    schema=models.JSONField(default=dict,blank=True, help_text="Custom field definitions")
    icon=models.CharField(max_length=50,blank=True)
    is_public=models.BooleanField(default=True)
    collection_path=models.CharField(max_length=500,blank=True,default="")
    entry_path_pattern=models.CharField(max_length=500,blank=True,default="")
    class Meta: constraints=[models.UniqueConstraint(fields=["site","slug"],name="unique_content_type_site_slug")]
    def __str__(self): return f"{self.site.domain}:{self.slug}"
    def save(self, *args, **kwargs):
        from .routing import validate_type_routing, validate_collection_claim
        self.collection_path, self.entry_path_pattern = validate_type_routing(self.collection_path, self.entry_path_pattern)
        with transaction.atomic():
            Site.objects.select_for_update().get(pk=self.site_id)
            previous = type(self).objects.filter(pk=self.pk).first() if not self._state.adding else None
            validate_collection_claim(self.site_id, self.collection_path, previous)
            return super().save(*args, **kwargs)

class ContentSchemaMigration(UUIDTimeStampedModel):
    """Audit trail for explicit, approved schema/data transformations."""
    content_type=models.ForeignKey(ContentTypeDefinition,on_delete=models.PROTECT,related_name="schema_migrations")
    operation=models.CharField(max_length=50)
    source_key=models.CharField(max_length=120)
    destination_key=models.CharField(max_length=120)
    before_schema=models.JSONField(default=dict)
    after_schema=models.JSONField(default=dict)
    affected_entries=models.PositiveIntegerField(default=0)
    executed_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.SET_NULL,null=True,blank=True)


class Category(UUIDTimeStampedModel):
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="categories")
    name=models.CharField(max_length=160)
    slug=models.SlugField(max_length=160)
    parent=models.ForeignKey("self",null=True,blank=True,on_delete=models.SET_NULL,related_name="children")
    class Meta: constraints=[models.UniqueConstraint(fields=["site","slug"],name="unique_category_site_slug")]
    def __str__(self): return self.name

class Tag(UUIDTimeStampedModel):
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="tags")
    name=models.CharField(max_length=160)
    slug=models.SlugField(max_length=160)
    class Meta: constraints=[models.UniqueConstraint(fields=["site","slug"],name="unique_tag_site_slug")]
    def __str__(self): return self.name

class ContentEntry(UUIDTimeStampedModel):
    class Status(models.TextChoices):
        DRAFT="draft","Draft"; REVIEW="review","Review"; SCHEDULED="scheduled","Scheduled"; PUBLISHED="published","Published"; ARCHIVED="archived","Archived"
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="entries")
    content_type=models.ForeignKey(ContentTypeDefinition,on_delete=models.PROTECT,related_name="entries")
    singleton_slot=models.OneToOneField(ContentTypeDefinition,null=True,blank=True,editable=False,on_delete=models.PROTECT,related_name="singleton_entry")
    title=models.CharField(max_length=255)
    slug=models.SlugField(max_length=255,allow_unicode=True)
    path=models.CharField(max_length=500,help_text="Canonical site path, e.g. /blog/example/")
    path_mode=models.CharField(max_length=10,choices=[("manual","Manual"),("auto","Automatic")],default="manual")
    excerpt=models.TextField(blank=True)
    blocks=models.JSONField(default=list,blank=True)
    custom_fields=models.JSONField(default=dict,blank=True)
    status=models.CharField(max_length=20,choices=Status.choices,default=Status.DRAFT)
    author=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,on_delete=models.SET_NULL,related_name="cms_entries")
    categories=models.ManyToManyField(Category,blank=True,related_name="entries")
    tags=models.ManyToManyField(Tag,blank=True,related_name="entries")
    parent=models.ForeignKey("self",null=True,blank=True,on_delete=models.SET_NULL,related_name="children")
    published_at=models.DateTimeField(null=True,blank=True)
    scheduled_at=models.DateTimeField(null=True,blank=True)
    is_featured=models.BooleanField(default=False)
    deleted_at=models.DateTimeField(null=True,blank=True,db_index=True)
    deleted_by=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,
                                 on_delete=models.SET_NULL,related_name="cms_trashed_entries")
    class Meta:
        constraints=[models.UniqueConstraint(fields=["site","path"],name="unique_entry_site_path")]
        ordering=["-published_at","-created_at"]
    def __str__(self): return self.title
    def save(self, *args, **kwargs):
        if self._state.adding and self.status == self.Status.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        from .routing import validate_entry_route
        with transaction.atomic():
            # Serializes route claims for one site, including legacy encoded aliases.
            Site.objects.select_for_update().get(pk=self.site_id)
            content_type = ContentTypeDefinition.objects.get(pk=self.content_type_id)
            self.singleton_slot_id = self.content_type_id if content_type.kind == ContentTypeDefinition.Kind.SINGLETON else None
            if self.singleton_slot_id and self.path_mode != "manual":
                from django.core.exceptions import ValidationError
                raise ValidationError({"path_mode": "Singleton pages require a manually controlled route."})
            previous = type(self).objects.filter(pk=self.pk).first() if not self._state.adding else None
            self.path = validate_entry_route(self, previous)
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = set(kwargs["update_fields"]) | {"path", "singleton_slot"}
            result = super().save(*args, **kwargs)
            # Editing a published entry changes the working copy only. Route redirects and
            # the public representation are changed exclusively by explicit publication.
            if previous is None and self.status == self.Status.PUBLISHED:
                from .publication import publish_snapshot
                publish_snapshot(self)
            return result

    def publish(self):
        from .publication import publish_snapshot
        with transaction.atomic():
            self.status = self.Status.PUBLISHED
            self.published_at = self.published_at or timezone.now()
            self.scheduled_at = None
            self.save(update_fields=["status", "published_at", "scheduled_at", "updated_at"])
            publish_snapshot(self)


class PublishedEntry(UUIDTimeStampedModel):
    """Immutable-to-public working-copy projection, atomically replaced on publish."""
    entry = models.OneToOneField(ContentEntry, on_delete=models.CASCADE, related_name="published_copy")
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="published_entries")
    content_type = models.ForeignKey(ContentTypeDefinition, on_delete=models.PROTECT, related_name="published_entries")
    path = models.CharField(max_length=500)
    title = models.CharField(max_length=255)
    excerpt = models.TextField(blank=True)
    published_at = models.DateTimeField()
    payload = models.JSONField(default=dict)
    seo = models.JSONField(default=dict, blank=True)
    schemas = models.JSONField(default=list, blank=True)
    category_slugs = models.JSONField(default=list, blank=True)
    tag_slugs = models.JSONField(default=list, blank=True)
    is_indexable = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["site", "path"], name="unique_published_site_path"),
        ]
        indexes = [
            models.Index(fields=["site", "-published_at"], name="cms_published_site_time"),
        ]


class ContentRevision(UUIDTimeStampedModel):
    entry=models.ForeignKey(ContentEntry,on_delete=models.CASCADE,related_name="revisions")
    number=models.PositiveIntegerField()
    snapshot=models.JSONField(default=dict)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,on_delete=models.SET_NULL)
    note=models.CharField(max_length=255,blank=True)
    class Meta:
        constraints=[models.UniqueConstraint(fields=["entry","number"],name="unique_revision_number")]
        ordering=["-number"]

class ReusableBlock(UUIDTimeStampedModel):
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="reusable_blocks")
    name=models.CharField(max_length=160)
    key=models.SlugField(max_length=160)
    block=models.JSONField(default=dict)
    class Meta: constraints=[models.UniqueConstraint(fields=["site","key"],name="unique_reusable_block_key")]

class Menu(UUIDTimeStampedModel):
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="menus")
    name=models.CharField(max_length=120)
    key=models.SlugField(max_length=120)
    class Meta: constraints=[models.UniqueConstraint(fields=["site","key"],name="unique_menu_site_key")]
    def __str__(self): return self.name

class MenuItem(UUIDTimeStampedModel):
    menu=models.ForeignKey(Menu,on_delete=models.CASCADE,related_name="items")
    label=models.CharField(max_length=160)
    url=models.CharField(max_length=500)
    parent=models.ForeignKey("self",null=True,blank=True,on_delete=models.CASCADE,related_name="children")
    sort_order=models.PositiveIntegerField(default=0)
    is_external=models.BooleanField(default=False)
    class Meta: ordering=["sort_order","created_at"]


class ComponentBindingDraft(UUIDTimeStampedModel):
    """Site-scoped authoring artifact; never executed directly by a Next.js host."""
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="cms_component_drafts")
    host_key = models.SlugField(max_length=80)
    slots = models.JSONField(default=list)
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                  on_delete=models.SET_NULL, related_name="created_cms_component_drafts")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                  on_delete=models.SET_NULL, related_name="updated_cms_component_drafts")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["site", "host_key"], name="unique_cms_component_site_host")]


class ComponentBindingRevision(UUIDTimeStampedModel):
    draft = models.ForeignKey(ComponentBindingDraft, on_delete=models.CASCADE, related_name="revisions")
    version = models.PositiveIntegerField()
    slots = models.JSONField(default=list)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="cms_component_revisions")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["draft", "version"], name="unique_cms_component_revision")]
