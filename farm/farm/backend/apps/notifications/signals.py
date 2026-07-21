"""Auto-generate in-app notifications on key domain events.

Two layers:

1. Personal notifications — sent straight to the person the event is FOR
   (task assignee, payslip owner). These fire regardless of who acted.

2. Activity fan-out (notify_activity) — every new entry on every page is
   announced to all SUPER_ADMINs plus the farm's FARM_MANAGERs, scoped by
   farm and ALWAYS excluding the actor: nobody is notified of their own
   action. Admins therefore see everything (all farms), managers see
   everything happening on their farms, and employees only receive the
   personal notifications aimed at them.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .services import notify, notify_activity, notify_roles


# ── Personal notifications (direct recipient) ──────────────────────────────

@receiver(post_save, sender="tasks.Task")
def task_assigned(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    if created and instance.assigned_to_id and instance.assigned_to_id != getattr(instance, "created_by_id", None):
        notify(
            instance.assigned_to,
            title="New task assigned",
            body=f"You have been assigned: {instance.title}",
            notification_type="TASK",
            link="/tasks",
            data={"task_id": str(instance.id)},
        )


@receiver(post_save, sender="payroll.Payslip")
def payslip_ready(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    if not created:
        return
    user = getattr(getattr(instance, "employee", None), "user", None)
    if user:
        notify(
            user,
            title="Payslip generated",
            body=f"Your net pay is ₹{instance.net_pay}.",
            notification_type="PAYROLL",
            link="/payroll",
        )


# ── Activity fan-out: custom handlers ──────────────────────────────────────

@receiver(post_save, sender="workforce.Attendance")
def attendance_activity(sender, instance, created, **kwargs):
    if kwargs.get("raw") or not created:
        return
    # Auto-created daily Pending rows (management command / today_status)
    # have no actor — notifying those would spam every admin each morning.
    if not instance.created_by_id:
        return
    pending = instance.approval_status == "PENDING"
    detail = f"{instance.date} • {instance.status}" + (" • awaiting approval" if pending else "")
    notify_activity(
        instance,
        "Attendance",
        "/attendance",
        notification_type="APPROVAL" if pending else "INFO",
        subject=getattr(instance.employee, "name", ""),
        detail=detail,
    )


@receiver(post_save, sender="tasks.Task")
def task_activity(sender, instance, created, **kwargs):
    if kwargs.get("raw") or not created:
        return
    assignee = ""
    if instance.assigned_to_id:
        assignee = instance.assigned_to.get_full_name() or instance.assigned_to.username
    elif getattr(instance, "assigned_employee_id", None):
        assignee = instance.assigned_employee.name
    notify_activity(
        instance,
        "Task",
        "/tasks",
        notification_type="TASK",
        subject=instance.title,
        detail=f"Assigned to {assignee}" if assignee else "Unassigned",
    )


@receiver(post_save, sender="tasks.TaskActivity")
def task_work_activity(sender, instance, created, **kwargs):
    """Work-phase actions — Before Work / Break Start / Break End /
    During Work / Completed — fan out to admins + the farm's managers
    (actor excluded), e.g.:

        title: "Before Work: Water the north field"
        body:  "By Ramesh Patil • Farm: Green Valley • started work"
    """
    if kwargs.get("raw") or not created:
        return
    # Name the employee the entry is for when someone else (a manager)
    # recorded it on their behalf; otherwise "By <actor>" already says it.
    emp = instance.employee
    for_emp = ""
    if emp and getattr(emp, "user_id", None) != getattr(instance, "created_by_id", None):
        for_emp = f"For {emp.name}"
    detail = " • ".join(p for p in [for_emp, instance.notes or ""] if p)
    notify_activity(
        instance,
        instance.get_action_type_display(),
        "/tasks",
        notification_type="TASK",
        subject=getattr(instance.task, "title", ""),
        detail=detail,
    )


@receiver(post_save, sender="finance.Expense")
def expense_activity(sender, instance, created, **kwargs):
    if kwargs.get("raw") or not created:
        return
    pending = instance.status == "PENDING"
    notify_activity(
        instance,
        "Expense",
        "/finance",
        notification_type="APPROVAL" if pending else "INFO",
        subject=f"₹{instance.amount}",
        detail=(instance.description or instance.category or "") + (" • awaiting approval" if pending else ""),
    )


@receiver(post_save, sender="breakdowns.BreakdownReport")
def breakdown_reported(sender, instance, created, **kwargs):
    if kwargs.get("raw") or not created:
        return
    notify_activity(
        instance,
        "Machine breakdown",
        "/breakdowns",
        notification_type="ALERT",
        subject=instance.machine_name,
        detail=f"{instance.get_severity_display()} • {instance.details}",
    )


@receiver(post_save, sender="inventory.StockMovement")
def stock_movement_activity(sender, instance, created, **kwargs):
    if kwargs.get("raw") or not created:
        return
    item = instance.item
    notify_activity(
        instance,
        "Stock movement",
        "/inventory/movements",
        notification_type="INVENTORY",
        subject=getattr(item, "name", ""),
        detail=f"{instance.movement_type} {instance.quantity}",
    )
    # Low-stock alert stays a broadcast (no exclude): running out of stock
    # matters to the actor too.
    if item and item.current_stock <= item.reorder_level:
        notify_roles(
            instance.farm,
            ["FARM_MANAGER"],
            title="Low stock alert",
            body=f"{item.name} is low ({item.current_stock} {item.unit} left, reorder at {item.reorder_level}).",
            notification_type="INVENTORY",
            link="/inventory/alerts",
        )


# ── Activity fan-out: simple "new entry" pages ──────────────────────────────
# (sender, label, page, type, subject_fn, detail_fn)

_SIMPLE_ACTIVITIES = [
    ("finance.RevenueEntry", "Revenue", "/finance", "INFO",
     lambda i: f"₹{i.amount}", lambda i: i.name or i.description or i.category or ""),
    ("inventory.Item", "Inventory item added", "/inventory", "INVENTORY",
     lambda i: i.name, lambda i: i.category or ""),
    # documents.Document intentionally NOT listed: uploads are private to the
    # uploader, so they must not fan out to other users' notification feeds.
    ("payroll.Advance", "Advance", "/payroll/advances", "PAYROLL",
     lambda i: getattr(i.employee, "name", ""), lambda i: f"₹{i.amount}"),
    ("payroll.Payment", "Salary payment", "/payroll/payments", "PAYROLL",
     lambda i: getattr(i.employee, "name", ""), lambda i: f"₹{i.amount}"),
    ("payroll.Payslip", "Payslip generated", "/payroll", "PAYROLL",
     lambda i: getattr(i.employee, "name", ""), lambda i: f"Net ₹{i.net_pay}"),
    ("agronomy.Crop", "Crop added", "/agronomy", "INFO",
     lambda i: i.name, lambda i: ""),
    ("agronomy.PlantationRecord", "Plantation record", "/agronomy/plantation", "INFO",
     lambda i: getattr(i.crop, "name", ""), lambda i: ""),
    ("agronomy.Observation", "Crop observation", "/agronomy/observations", "INFO",
     lambda i: getattr(i.crop, "name", ""), lambda i: ""),
    ("agronomy.InputApplication", "Input application", "/agronomy/inputs", "INFO",
     lambda i: getattr(i.crop, "name", ""), lambda i: ""),
    ("agronomy.GrowthRecord", "Growth record", "/agronomy/growth", "INFO",
     lambda i: getattr(i.crop, "name", ""), lambda i: ""),
    ("agronomy.HarvestRecord", "Harvest record", "/agronomy/harvest", "INFO",
     lambda i: getattr(i.crop, "name", ""), lambda i: f"{i.quantity} {i.unit}"),
    ("assets.Asset", "Asset added", "/assets", "INFO",
     lambda i: i.name, lambda i: ""),
    ("assets.AssetMaintenance", "Asset maintenance", "/assets/maintenance", "INFO",
     lambda i: getattr(i.asset, "name", ""), lambda i: i.maintenance_type or ""),
    ("gps.FieldActivity", "Field activity", "/gps/activities", "INFO",
     lambda i: getattr(i.task, "title", "") or "Work entry", lambda i: i.description or ""),
]


def _make_activity_handler(label, page, ntype, subject_fn, detail_fn):
    def _handler(sender, instance, created, **kwargs):
        if kwargs.get("raw") or not created:
            return
        try:
            subject = subject_fn(instance) or ""
            detail = detail_fn(instance) or ""
        except Exception:
            subject, detail = "", ""
        notify_activity(instance, label, page, notification_type=ntype,
                        subject=subject, detail=detail)
    return _handler


for _sender, _label, _page, _ntype, _subj, _det in _SIMPLE_ACTIVITIES:
    post_save.connect(
        _make_activity_handler(_label, _page, _ntype, _subj, _det),
        sender=_sender,
        weak=False,
        dispatch_uid=f"notify_activity_{_sender}",
    )
