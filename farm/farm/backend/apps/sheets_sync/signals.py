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
from django.db.models.signals import m2m_changed, post_delete, post_save, pre_save

from apps.sheets_sync import custom_sheets, registry, worker

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


# ---------------------------------------------------------------------------
# "Super Admins" curated sheet (accounts.User is not part of the auto mirror)
# ---------------------------------------------------------------------------

_PREV_ROLE = "_sheets_sync_prev_role"


def _user_pre_save(sender, instance, raw=False, **kwargs):
    """Stash the stored role so post_save can tell a demotion happened.

    Without this a user demoted out of SUPER_ADMIN would keep their row in
    the sheet: the new role alone gives no reason to rebuild.
    """
    if raw or not instance.pk:
        setattr(instance, _PREV_ROLE, None)
        return
    prev = sender.objects.filter(pk=instance.pk).values_list("role", flat=True).first()
    setattr(instance, _PREV_ROLE, prev)


def _user_post_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    from apps.accounts.models import Role

    prev = getattr(instance, _PREV_ROLE, None)
    if instance.role != Role.SUPER_ADMIN and prev != Role.SUPER_ADMIN:
        return  # nothing about the super-admin roster changed
    transaction.on_commit(
        lambda: worker.enqueue_custom(custom_sheets.SUPER_ADMINS)
    )


def _user_post_delete(sender, instance, **kwargs):
    from apps.accounts.models import Role

    if instance.role != Role.SUPER_ADMIN:
        return
    transaction.on_commit(
        lambda: worker.enqueue_custom(custom_sheets.SUPER_ADMINS)
    )


def _user_farms_changed(sender, action, **kwargs):
    """The sheet shows each admin's farms, so m2m edits must rebuild it."""
    if not action.startswith("post_"):
        return
    transaction.on_commit(
        lambda: worker.enqueue_custom(custom_sheets.SUPER_ADMINS)
    )


def connect_super_admins():
    from apps.accounts.models import User

    pre_save.connect(_user_pre_save, sender=User,
                     dispatch_uid=DISPATCH_UID % ("presave", "accounts.user"))
    post_save.connect(_user_post_save, sender=User,
                      dispatch_uid=DISPATCH_UID % ("sa-save", "accounts.user"))
    post_delete.connect(_user_post_delete, sender=User,
                        dispatch_uid=DISPATCH_UID % ("sa-delete", "accounts.user"))
    m2m_changed.connect(
        _user_farms_changed, sender=User.farms.through,
        dispatch_uid=DISPATCH_UID % ("sa-farms", "accounts.user"),
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
    connect_super_admins()
    _connected = count
    return count


def connected_model_count():
    return _connected
