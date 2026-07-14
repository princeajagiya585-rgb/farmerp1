"""Backfill Expense / RevenueEntry mirrors for existing records.

Reports now count the unified Expense / RevenueEntry tables ONLY, so every
pre-existing Purchase, Asset and Sale must be mirrored — otherwise their amounts
would silently drop out of the profit totals. Guarded by update_or_create on the
(source_type, source_id) link, so it is safe to re-run.
"""

from decimal import Decimal

from django.db import migrations


def _dec(value):
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def backfill(apps, schema_editor):
    Expense = apps.get_model("finance", "Expense")
    RevenueEntry = apps.get_model("finance", "RevenueEntry")
    Purchase = apps.get_model("finance", "Purchase")
    Sale = apps.get_model("finance", "Sale")
    Asset = apps.get_model("assets", "Asset")

    # Purchases → Expense (INPUTS)
    for p in Purchase.objects.all():
        desc = p.notes or (f"Purchase {p.invoice_no}" if p.invoice_no else "Purchase")
        Expense.objects.update_or_create(
            source_type="purchase",
            source_id=str(p.id),
            defaults=dict(
                farm_id=p.farm_id,
                category="INPUTS",
                amount=_dec(p.total_amount),
                date=p.date,
                description=desc,
                status="APPROVED",
                is_paid=p.is_paid,
                created_by_id=p.created_by_id,
            ),
        )

    # Assets (with a purchase cost) → Expense (ASSET)
    for a in Asset.objects.all():
        cost = _dec(a.purchase_cost)
        if cost <= 0:
            continue
        Expense.objects.update_or_create(
            source_type="asset",
            source_id=str(a.id),
            defaults=dict(
                farm_id=a.farm_id,
                category="ASSET",
                amount=cost,
                date=a.purchase_date or a.created_at.date(),
                description=f"Asset purchase: {a.name}",
                status="APPROVED",
                is_paid=True,
                created_by_id=a.created_by_id,
            ),
        )

    # Sales → RevenueEntry (CROP_SALE)
    for s in Sale.objects.all():
        RevenueEntry.objects.update_or_create(
            source_type="sale",
            source_id=str(s.id),
            defaults=dict(
                farm_id=s.farm_id,
                source="HARVEST_SALE",
                category="CROP_SALE",
                name=s.buyer or "Sale",
                crop_id=s.crop_id,
                amount=_dec(s.amount),
                date=s.date,
                description=f"Sale to {s.buyer}" if s.buyer else "Sale",
                created_by_id=s.created_by_id,
            ),
        )


def unbackfill(apps, schema_editor):
    Expense = apps.get_model("finance", "Expense")
    RevenueEntry = apps.get_model("finance", "RevenueEntry")
    Expense.objects.filter(source_type__in=["purchase", "asset"]).delete()
    RevenueEntry.objects.filter(source_type="sale").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0010_expense_source_id_expense_source_type_and_more"),
        ("assets", "0003_asset_warranty_years"),
    ]

    operations = [
        migrations.RunPython(backfill, unbackfill),
    ]
