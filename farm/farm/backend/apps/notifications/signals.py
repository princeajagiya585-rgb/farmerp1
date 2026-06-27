"""Auto-generate in-app notifications on key domain events."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .services import notify, notify_roles


@receiver(post_save, sender="tasks.Task")
def task_assigned(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    if created and instance.assigned_to_id:
        notify(
            instance.assigned_to,
            title="New task assigned",
            body=f"You have been assigned: {instance.title}",
            notification_type="TASK",
            link="/tasks",
            data={"task_id": str(instance.id)},
        )


@receiver(post_save, sender="workforce.Attendance")
def attendance_pending(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    if created and instance.approval_status == "PENDING":
        notify_roles(
            instance.farm,
            ["FARM_MANAGER"],
            title="Attendance awaiting approval",
            body=f"Attendance for {instance.date} needs verification.",
            notification_type="APPROVAL",
            link="/attendance",
        )


@receiver(post_save, sender="finance.Expense")
def expense_pending(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    if created and instance.status == "PENDING":
        notify_roles(
            instance.farm,
            ["FARM_MANAGER"],
            title="Expense awaiting approval",
            body=f"₹{instance.amount} — {instance.description or instance.category}",
            notification_type="APPROVAL",
            link="/finance",
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


@receiver(post_save, sender="breakdowns.BreakdownReport")
def breakdown_reported(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    if not created:
        return
    reporter = getattr(instance.created_by, "get_full_name", lambda: "")() or "A worker"
    notify_roles(
        instance.farm,
        ["FARM_MANAGER"],
        title=f"Machine breakdown: {instance.machine_name}",
        body=f"{reporter} reported a {instance.get_severity_display().lower()} "
        f"breakdown of {instance.machine_name}. {instance.details}",
        notification_type="ALERT",
        link="/breakdowns",
        data={"breakdown_id": str(instance.id), "severity": instance.severity},
        exclude=instance.created_by,
    )


@receiver(post_save, sender="inventory.StockMovement")
def stock_low(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    if not created:
        return
    item = instance.item
    if item and item.current_stock <= item.reorder_level:
        notify_roles(
            instance.farm,
            ["FARM_MANAGER"],
            title="Low stock alert",
            body=f"{item.name} is low ({item.current_stock} {item.unit} left, reorder at {item.reorder_level}).",
            notification_type="INVENTORY",
            link="/inventory",
        )
