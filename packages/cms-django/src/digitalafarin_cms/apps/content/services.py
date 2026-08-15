from .models import ContentRevision

def create_revision(entry, user=None, note=""):
    latest=entry.revisions.first()
    number=(latest.number+1) if latest else 1
    snapshot={
        "title":entry.title,"slug":entry.slug,"path":entry.path,"excerpt":entry.excerpt,
        "blocks":entry.blocks,"custom_fields":entry.custom_fields,"status":entry.status,
    }
    return ContentRevision.objects.create(entry=entry,number=number,snapshot=snapshot,created_by=user,note=note)
