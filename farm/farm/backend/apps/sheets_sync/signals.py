"""
Signal wiring: mirror every successful Supabase write to Google Sheets.

Ordering guarantee — the user-facing contract is "Supabase first, then
Sheets".  Handlers do nothing but register a ``transaction.on_commit``
callback, so a Sheets job only exists once Postgres has durably committed
the row.  If the transaction rolls back, no sync happens; if the sync
fails, the database record is untouched.

Bulk ORM operations (``bulk_create``, ``QuerySet.update``) bypass Django
signals by design — run ``manage.py sheets_backfill`` to true-up after
bulk imports.
"""
import logging

from django.db import transaction
from django.db.models.signals import m2m_changed, post_delete, post_save

from apps.sheets_sync import registry, worker

logger = logging.getLogger(__name__)

_connected = 0

DISPATCH_UID = "sheets_sync.%s.%s"


def _on_post_save(sender, instance, raw=False, **kwargs):
    if raw:  # loaddata fixtures
        return
    meta = sender._meta
    transaction.on_commit(
        lambda: worker.enqueue_upsert(meta.app_label, meta.model_name,
                                      instance.pk)
    )


def _on_post_delete(sender, instance, **kwargs):
    title = registry.worksheet_title(sender)
    pk = instance.pk
    transaction.on_commit(lambda: worker.enqueue_delete(title, pk))


def _on_m2m_changed(sender, action, **kwargs):
    # The through table changed — rewrite its worksheet after commit.
    if not action.startswith("post_"):
        return
    meta = sender._meta
    transaction.on_commit(
        lambda: worker.enqueue_refresh(meta.app_label, meta.model_name)
    )


def connect_all():
    """Attach handlers for every synced model (idempotent via dispatch_uid)."""
    global _connected
    count = 0
    for model in registry.iter_synced_models():
        label = model._meta.label_lower
        if model._meta.auto_created:
            # Auto M2M through tables don't emit post_save; they're covered
            # by m2m_changed on the owning field below.
            continue
        post_save.connect(_on_post_save, sender=model,
                          dispatch_uid=DISPATCH_UID % ("save", label))
        post_delete.connect(_on_post_delete, sender=model,
                            dispatch_uid=DISPATCH_UID % ("delete", label))
        count += 1

        for m2m in model._meta.local_many_to_many:
            through = m2m.remote_field.through
            if registry.is_synced(through):
                m2m_changed.connect(
                    _on_m2m_changed, sender=through,
                    dispatch_uid=DISPATCH_UID % ("m2m", through._meta.label_lower),
                )
    _connected = count
    return count


def connected_model_count():
    return _connected
