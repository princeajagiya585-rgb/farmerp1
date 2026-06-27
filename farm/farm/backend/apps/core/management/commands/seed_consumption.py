"""Seed dummy inventory items + stock OUT movements for Consumption Report."""
import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.farms.models import Farm
from apps.inventory.models import Item, StockMovement


class Command(BaseCommand):
    help = "Seed dummy consumption data for Inventory Reports"

    def handle(self, *args, **options):
        today = timezone.now().date()

        farm = Farm.objects.first()
        if not farm:
            self.stdout.write(self.style.ERROR("No farm found. Please run seed_demo first."))
            return

        self.stdout.write(f"Using farm: {farm.name}")

        # ── 5 Items ───────────────────────────────────────────────────
        items_data = [
            ("FERT-NPK-01",   "NPK 19:19:19",      "FERTILIZER", "kg", 150, 50,  85),
            ("PEST-CHLOR-01", "Chlorpyrifos 20EC", "PESTICIDE",  "L",  25,  10,  450),
            ("SEED-ONION-02", "Onion Seeds Red",   "SEED",       "kg", 40,  10,  180),
            ("CONS-FUEL-01",  "Diesel",            "CONSUMABLE", "L",  300, 100, 92),
            ("SPARE-PUMP-01", "Pump Spare Kit",    "SPARE_PART", "set",5,   2,   2500),
        ]

        items = {}
        for sku, name, cat, unit, stock, reorder, cost in items_data:
            item, created = Item.objects.get_or_create(sku=sku, defaults={
                "name": name, "category": cat, "farm": farm,
                "unit": unit,
                "current_stock": Decimal(str(stock)),
                "reorder_level": Decimal(str(reorder)),
                "unit_cost": Decimal(str(cost)),
                "supplier": "Agro Suppliers Ltd",
            })
            items[sku] = item
            if created:
                self.stdout.write(f"  + Item: {name}")

        # ── 5 Stock OUT movements (one per item) ──────────────────────
        out_data = [
            ("FERT-NPK-01",   25, 3,  "Applied to Block A - Grapes"),
            ("PEST-CHLOR-01", 3,  5,  "Pest control - aphids"),
            ("SEED-ONION-02", 8,  7,  "Sowing in Block C"),
            ("CONS-FUEL-01",  60, 2,  "Tractor field operations"),
            ("SPARE-PUMP-01", 1,  10, "Pump repair"),
        ]

        for sku, qty, days_ago, reason in out_data:
            item = items[sku]
            move_date = today - datetime.timedelta(days=days_ago)
            _, created = StockMovement.objects.get_or_create(
                item=item, movement_type="OUT", date=move_date,
                defaults={
                    "farm": farm,
                    "quantity": Decimal(str(qty)),
                    "reference": f"USE-{sku}",
                    "reason": reason,
                    "notes": reason,
                },
            )
            if created:
                self.stdout.write(f"  + OUT: {item.name} x{qty}")

        self.stdout.write(self.style.SUCCESS(
            "\n✅ Done! 5 items + 5 consumption entries seeded."
        ))
        self.stdout.write("Go to: Inventory → Inventory Reports → Consumption Report")
