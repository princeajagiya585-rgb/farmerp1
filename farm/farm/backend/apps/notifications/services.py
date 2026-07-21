import asyncio

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import Notification
from .serializers import NotificationSerializer

# Reference to the ASGI server's (Daphne) event loop, registered by the
# WebSocket consumer on connect. The default InMemoryChannelLayer only delivers
# within a single event loop, but `notify()` is usually called from a sync view
# running in a worker thread (a *different* loop). Scheduling group_send onto the
# consumer's loop makes in-process delivery work without an external broker
# (e.g. Redis). With channels_redis configured this path is harmless.
_EVENT_LOOP = None


def register_event_loop(loop):
    global _EVENT_LOOP
    _EVENT_LOOP = loop


def _broadcast_notification(instance):
    """Send a new notification to the recipient via WebSocket (best-effort)."""
    try:
        channel_layer = get_channel_layer()
        # Materialise the payload synchronously (DB access is safe here).
        message = {"type": "notify", "data": NotificationSerializer(instance).data}
        group = f"notifications_{instance.recipient_id}"
        loop = _EVENT_LOOP
        if loop is not None and loop.is_running():
            # Deliver on the consumer's loop so InMemoryChannelLayer reaches it.
            asyncio.run_coroutine_threadsafe(
                channel_layer.group_send(group, message), loop
            )
        else:
            async_to_sync(channel_layer.group_send)(group, message)
    except Exception:
        pass


def notify(recipient, title, body="", notification_type="INFO", data=None, link=""):
    """Create and return a Notification. Importable by other apps."""
    if recipient is None:
        return None
    instance = Notification.objects.create(
        recipient=recipient,
        title=title,
        body=body,
        notification_type=notification_type,
        data=data or {},
        link=link,
    )
    _broadcast_notification(instance)
    return instance


def _resolve_farm(instance):
    """Best-effort farm lookup: direct field first, then via common relations."""
    farm = getattr(instance, "farm", None)
    if farm is not None:
        return farm
    for rel in ("employee", "asset", "item", "crop", "task"):
        related = getattr(instance, rel, None)
        farm = getattr(related, "farm", None)
        if farm is not None:
            return farm
    return None


def notify_activity(instance, label, page, notification_type="INFO", subject="", detail=""):
    """Fan a new entry out to every SUPER_ADMIN plus the farm's managers.

    The actor (created_by) is always excluded — nobody gets notified of
    their own action. Actor names carry the (M)/(A) role markers from
    User.get_full_name(), and the body always names the farm and the page
    the work belongs to, e.g.:

        title: "Attendance: Ramesh Patil"
        body:  "By Hitesh Bhai (M) • Farm: Green Valley • 2026-07-16 • PRESENT"
        link:  "/attendance"
    """
    actor = getattr(instance, "created_by", None)
    farm = _resolve_farm(instance)
    actor_name = (actor.get_full_name() or actor.username) if actor else "System"
    farm_name = getattr(farm, "name", "") or "—"
    title = f"{label}: {subject}" if subject else label
    parts = [f"By {actor_name}", f"Farm: {farm_name}"]
    if detail:
        parts.append(str(detail))
    return notify_roles(
        farm,
        ["FARM_MANAGER"],
        title=title,
        body=" • ".join(parts),
        notification_type=notification_type,
        data={"farm": farm_name, "actor": actor_name, "page": page},
        link=page,
        exclude=actor,
    )


def notify_roles(farm, roles, title, body="", notification_type="INFO", data=None, link="", exclude=None):
    """Notify every active user who has one of `roles` and is assigned to `farm`,
    plus that farm's super admins and the main super administrator. Returns the
    number of notifications created.

    A *regular* super admin's SUPER_ADMIN clause used to be unconditional and
    unscoped, so every super admin on the platform got a bell + WebSocket alert
    for every attendance mark, task, expense and breakdown of every other
    tenant. Regular super admins are now matched on the farm like anyone else,
    so they only see their own tenant.

    The one exception is the *main* super administrator — the single
    ``is_superuser`` owner badged "MAIN". They are the platform operator and
    oversee every tenant, so a manager's or employee's activity on any farm fans
    a copy to them regardless of farm. This is deliberately the only cross-tenant
    recipient: adding it here, at the single fan-out chokepoint, keeps the
    owner's global view in one place while leaving the tenant boundary intact for
    every other account.

    What the owner does NOT get is another super admin's *own* actions. Each
    super admin runs their own tenant; their personal activity is their business,
    not the owner's oversight feed. The fan-out passes the actor as ``exclude``,
    so when the actor is a super admin the owner is left out — the owner sees
    other tenants' staff, never the other admins themselves.
    """
    User = get_user_model()
    role_list = list(roles)
    if farm is not None:
        query = Q(role="SUPER_ADMIN", farms=farm) | Q(role__in=role_list, farms=farm)
        # Always include the farm's designated manager, even if they were never
        # added to the farm's members (User.farms) M2M — Farm.manager is the
        # source of truth for who runs the farm, so they must get farm alerts.
        if getattr(farm, "manager_id", None):
            query |= Q(pk=farm.manager_id)
    else:
        # No farm to scope by: this is a platform-wide notice, so it can only go
        # to the roles asked for. A blanket super-admin fan-out here would be the
        # same cross-tenant leak by another route.
        query = Q(role__in=role_list)
    # The main super administrator watches the whole platform, so manager and
    # employee activity across every tenant fans a copy to them — the sole
    # intended cross-tenant recipient. A super admin's own action does not: the
    # actor arrives as `exclude`, and if that actor is a super admin the owner is
    # not added (and `exclude` already drops the owner from their own actions).
    actor_is_super_admin = getattr(exclude, "role", None) == "SUPER_ADMIN"
    if not actor_is_super_admin:
        query |= Q(is_superuser=True)
    recipients = User.objects.filter(query, is_active=True).distinct()
    if exclude is not None:
        recipients = recipients.exclude(pk=getattr(exclude, "pk", exclude))
    created = 0
    for user in recipients:
        notify(user, title, body, notification_type, data, link)
        created += 1
    return created
