"""Remove old "Document uploaded" activity notifications.

Document uploads no longer fan out to other users (they are private to the
uploader), so the notifications already created by the old signal are purged
from every user's feed.
"""
from django.db import migrations


def delete_document_notifications(apps, schema_editor):
    Notification = apps.get_model("notifications", "Notification")
    Notification.objects.filter(title__startswith="Document uploaded").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(delete_document_notifications, migrations.RunPython.noop),
    ]
