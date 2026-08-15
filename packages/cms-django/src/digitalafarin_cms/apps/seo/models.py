from django.db import models
from digitalafarin_cms.apps.common.models import UUIDTimeStampedModel
from digitalafarin_cms.apps.sites.models import Site
from digitalafarin_cms.apps.content.models import ContentEntry

class SeoMeta(UUIDTimeStampedModel):
    entry=models.OneToOneField(ContentEntry,on_delete=models.CASCADE,related_name="seo_meta")
    title=models.CharField(max_length=255,blank=True)
    description=models.CharField(max_length=320,blank=True)
    canonical_url=models.URLField(blank=True)
    robots_index=models.BooleanField(default=True)
    robots_follow=models.BooleanField(default=True)
    og_title=models.CharField(max_length=255,blank=True)
    og_description=models.CharField(max_length=320,blank=True)
    og_image=models.URLField(blank=True)
    twitter_card=models.CharField(max_length=30,default="summary_large_image")
    focus_keyword=models.CharField(max_length=255,blank=True)
    secondary_keywords=models.JSONField(default=list,blank=True)
    seo_score=models.PositiveSmallIntegerField(default=0)
    analysis=models.JSONField(default=dict,blank=True)
    def __str__(self): return f"SEO: {self.entry.title}"

class SchemaMarkup(UUIDTimeStampedModel):
    entry=models.ForeignKey(ContentEntry,on_delete=models.CASCADE,related_name="schema_markups")
    schema_type=models.CharField(max_length=80)
    data=models.JSONField(default=dict)
    is_active=models.BooleanField(default=True)

class KeywordCluster(UUIDTimeStampedModel):
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="keyword_clusters")
    name=models.CharField(max_length=200)
    intent=models.CharField(max_length=50,blank=True)
    pillar_entry=models.ForeignKey(ContentEntry,null=True,blank=True,on_delete=models.SET_NULL,related_name="pillar_clusters")
    notes=models.TextField(blank=True)
    def __str__(self): return self.name

class Keyword(UUIDTimeStampedModel):
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="keywords")
    cluster=models.ForeignKey(KeywordCluster,null=True,blank=True,on_delete=models.SET_NULL,related_name="keywords")
    phrase=models.CharField(max_length=255)
    intent=models.CharField(max_length=50,blank=True)
    volume=models.PositiveIntegerField(null=True,blank=True)
    difficulty=models.DecimalField(max_digits=5,decimal_places=2,null=True,blank=True)
    priority=models.PositiveSmallIntegerField(default=50)
    class Meta: constraints=[models.UniqueConstraint(fields=["site","phrase"],name="unique_keyword_site_phrase")]
    def __str__(self): return self.phrase

class KeywordMapping(UUIDTimeStampedModel):
    keyword=models.ForeignKey(Keyword,on_delete=models.CASCADE,related_name="mappings")
    entry=models.ForeignKey(ContentEntry,on_delete=models.CASCADE,related_name="keyword_mappings")
    is_primary=models.BooleanField(default=False)
    target_position=models.PositiveSmallIntegerField(null=True,blank=True)
    class Meta: constraints=[models.UniqueConstraint(fields=["keyword","entry"],name="unique_keyword_entry")]

class Redirect(UUIDTimeStampedModel):
    class RedirectType(models.TextChoices):
        PERMANENT="301","301"; TEMPORARY="302","302"; TEMPORARY_307="307","307"; PERMANENT_308="308","308"; GONE="410","410"
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="redirects")
    source_path=models.CharField(max_length=500)
    destination_path=models.CharField(max_length=500,blank=True)
    redirect_type=models.CharField(max_length=3,choices=RedirectType.choices,default=RedirectType.PERMANENT)
    is_active=models.BooleanField(default=True)
    hits=models.PositiveBigIntegerField(default=0)
    class Meta: constraints=[models.UniqueConstraint(fields=["site","source_path"],name="unique_redirect_source")]

class InternalLinkSuggestion(UUIDTimeStampedModel):
    source_entry=models.ForeignKey(ContentEntry,on_delete=models.CASCADE,related_name="link_suggestions_from")
    target_entry=models.ForeignKey(ContentEntry,on_delete=models.CASCADE,related_name="link_suggestions_to")
    anchor_text=models.CharField(max_length=255)
    score=models.DecimalField(max_digits=5,decimal_places=2,default=0)
    status=models.CharField(max_length=20,default="suggested")
