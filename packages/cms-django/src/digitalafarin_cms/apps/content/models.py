from django.conf import settings
from django.db import models
from django.utils import timezone
from digitalafarin_cms.apps.common.models import UUIDTimeStampedModel
from digitalafarin_cms.apps.sites.models import Site

class ContentTypeDefinition(UUIDTimeStampedModel):
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="content_types")
    name=models.CharField(max_length=120)
    slug=models.SlugField(max_length=120)
    schema=models.JSONField(default=dict,blank=True, help_text="Custom field definitions")
    icon=models.CharField(max_length=50,blank=True)
    is_public=models.BooleanField(default=True)
    class Meta: constraints=[models.UniqueConstraint(fields=["site","slug"],name="unique_content_type_site_slug")]
    def __str__(self): return f"{self.site.domain}:{self.slug}"

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
    title=models.CharField(max_length=255)
    slug=models.SlugField(max_length=255)
    path=models.CharField(max_length=500,help_text="Canonical site path, e.g. /blog/example/")
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
    class Meta:
        constraints=[models.UniqueConstraint(fields=["site","path"],name="unique_entry_site_path")]
        ordering=["-published_at","-created_at"]
    def __str__(self): return self.title
    def publish(self):
        self.status=self.Status.PUBLISHED
        self.published_at=self.published_at or timezone.now()
        self.save(update_fields=["status","published_at","updated_at"])

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
