from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from digitalafarin_cms.apps.sites.models import Organization, Site, Membership
from digitalafarin_cms.apps.content.models import ContentTypeDefinition, ContentEntry, Category, Menu, MenuItem
from digitalafarin_cms.apps.seo.models import SeoMeta, SchemaMarkup, KeywordCluster, Keyword, KeywordMapping

class Command(BaseCommand):
    help="Create development demo data"
    def handle(self,*args,**options):
        User=get_user_model()
        user,created=User.objects.get_or_create(username="admin",defaults={"email":"admin@example.com","is_staff":True,"is_superuser":True})
        if created or not user.has_usable_password():
            user.set_password("admin12345"); user.is_staff=True; user.is_superuser=True; user.save()
        org,_=Organization.objects.get_or_create(slug="digitalafarin",defaults={"name":"DigitalAfarin"})
        site,_=Site.objects.get_or_create(domain="demo.local",defaults={"organization":org,"name":"Demo SEO Site","default_language":"fa"})
        Membership.objects.get_or_create(organization=org,user=user,defaults={"role":"owner"})
        page_type,_=ContentTypeDefinition.objects.get_or_create(site=site,slug="page",defaults={"name":"Page","schema":{"fields":[]}})
        post_type,_=ContentTypeDefinition.objects.get_or_create(site=site,slug="post",defaults={"name":"Post","schema":{"fields":[]}})
        home,_=ContentEntry.objects.get_or_create(site=site,path="/",defaults={"content_type":page_type,"title":"DigitalAfarin SEO CMS","slug":"home","status":"published","author":user,"blocks":[{"id":"hero-1","type":"hero","data":{"title":"Headless SEO CMS","subtitle":"Django REST + Next.js"}},{"id":"p-1","type":"paragraph","data":{"text":"This page is served from the CMS resolver API."}}]})
        SeoMeta.objects.get_or_create(entry=home,defaults={"title":"Headless SEO CMS | DigitalAfarin","description":"Multi-site content and SEO management platform for Next.js.","focus_keyword":"headless seo cms","seo_score":80})
        SchemaMarkup.objects.get_or_create(entry=home,schema_type="WebPage",defaults={"data":{"@context":"https://schema.org","@type":"WebPage","name":home.title}})
        cluster,_=KeywordCluster.objects.get_or_create(site=site,name="Headless CMS",defaults={"pillar_entry":home,"intent":"commercial"})
        kw,_=Keyword.objects.get_or_create(site=site,phrase="headless seo cms",defaults={"cluster":cluster,"intent":"commercial","priority":90})
        KeywordMapping.objects.get_or_create(keyword=kw,entry=home,defaults={"is_primary":True})
        menu,_=Menu.objects.get_or_create(site=site,key="main",defaults={"name":"Main Menu"})
        MenuItem.objects.get_or_create(menu=menu,label="Home",url="/",defaults={"sort_order":0})
        self.stdout.write(self.style.SUCCESS("Demo data ready: admin / admin12345; site=demo.local"))
