"""Auto-mirror money-out / money-in events onto the Expenses & Revenue pages.

The app tracks several financial events in their own modules (item purchases,
asset purchases, produce sales). The owner wants a single mental model: every
spend shows on the Expenses page (``Expense``) and every earning shows on the
Revenue page (``RevenueEntry``). These signal receivers keep a mirrored,
already-approved ledger-style row in sync with each source record.

Each mirror is keyed on ``(source_type, source_id)`` and written with
``update_or_create`` so editing the source re-syncs its mirror and re-running
(e.g. the backfill migration) never creates duplicates. Deleting the source
deletes its mirror.

Note: salary payouts are already mirrored to ``Expense`` directly by the payroll
module (``apps.payroll.views._record_salary_expense``), so they are not handled
here.
"""

from decimal import Decimal

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.assets.models import Asset

from .models import Expense, Purchase, RevenueEntry, Sale


def _to_decimal(value):
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


# ── Purchase → Expense ────────────────────────────────────────────────────────
@receiver(post_save, sender=Purchase)
def mirror_purchase_to_expense(sender, instance, **kwargs):
    """Every item purchase appears on the Expenses page as an INPUTS expense."""
    desc = instance.notes or (
        f"Purchase {instance.invoice_no}" if instance.invoice_no else "Purchase"
    )
    Expense.objects.update_or_create(
        source_type="purchase",
        source_id=str(instance.id),
        defaults=dict(
            farm=instance.farm,
            category=Expense.Category.INPUTS,
            amount=_to_decimal(instance.total_amount),
            date=instance.date,
            description=desc,
            status=Expense.Status.APPROVED,
            is_paid=instance.is_paid,
            created_by=instance.created_by,
        ),
    )


@receiver(post_delete, sender=Purchase)
def unmirror_purchase(sender, instance, **kwargs):
    Expense.objects.filter(
        source_type="purchase", source_id=str(instance.id)
    ).delete()


# ── Asset → Expense ───────────────────────────────────────────────────────────
@receiver(post_save, sender=Asset)
def mirror_asset_to_expense(sender, instance, **kwargs):
    """Buying an asset appears on the Expenses page as an ASSET expense.

    Only assets with a positive purchase cost produce an expense; if the cost is
    cleared later, any existing mirror is removed.
    """
    cost = _to_decimal(instance.purchase_cost)
    if cost <= 0:
        Expense.objects.filter(
            source_type="asset", source_id=str(instance.id)
        ).delete()
        return
    Expense.objects.update_or_create(
        source_type="asset",
        source_id=str(instance.id),
        defaults=dict(
            farm=instance.farm,
            category=Expense.Category.ASSET,
            amount=cost,
            date=instance.purchase_date or instance.created_at.date(),
            description=f"Asset purchase: {instance.name}",
            status=Expense.Status.APPROVED,
            is_paid=True,
            created_by=instance.created_by,
        ),
    )


@receiver(post_delete, sender=Asset)
def unmirror_asset(sender, instance, **kwargs):
    Expense.objects.filter(
        source_type="asset", source_id=str(instance.id)
    ).delete()


# ── Sale → RevenueEntry ───────────────────────────────────────────────────────
@receiver(post_save, sender=Sale)
def mirror_sale_to_revenue(sender, instance, **kwargs):
    """Every sale appears on the Revenue page as a Crop Sale revenue entry."""
    RevenueEntry.objects.update_or_create(
        source_type="sale",
        source_id=str(instance.id),
        defaults=dict(
            farm=instance.farm,
            source=RevenueEntry.Source.HARVEST_SALE,
            category=RevenueEntry.Category.CROP_SALE,
            name=instance.name or instance.buyer or "Sale",
            crop=instance.crop,
            amount=_to_decimal(instance.amount),
            date=instance.date,
            description=(
                f"Sale to {instance.buyer}" if instance.buyer else "Sale"
            ),
            created_by=instance.created_by,
        ),
    )


@receiver(post_delete, sender=Sale)
def unmirror_sale(sender, instance, **kwargs):
    RevenueEntry.objects.filter(
        source_type="sale", source_id=str(instance.id)
    ).delete()
