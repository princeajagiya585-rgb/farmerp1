from django.db import models

from apps.core.models import OwnedModel


class Item(OwnedModel):
    class Category(models.TextChoices):
        FERTILIZER = "FERTILIZER", "Fertilizer"
        PESTICIDE = "PESTICIDE", "Pesticide"
        SEED = "SEED", "Seed"
        CONSUMABLE = "CONSUMABLE", "Consumable"
        SPARE_PART = "SPARE_PART", "Spare Part"

    name = models.CharField(max_length=150)
    sku = models.CharField(max_length=64, unique=True)
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.CONSUMABLE
    )
    unit = models.CharField(max_length=20, blank=True, default="kg")
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="inventory_items"
    )
    current_stock = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reorder_level = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    supplier = models.CharField(max_length=150, blank=True)
    description = models.TextField(blank=True)
    date = models.DateField(null=True, blank=True)
    # Reorder-alert workflow: set to True once the ordered stock has
    # physically arrived at the farm ("Done" on the alerts screens).
    restocked = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.sku})"

    @property
    def is_low_stock(self):
        return self.current_stock <= self.reorder_level

    @property
    def stock_value(self):
        return self.current_stock * self.unit_cost


class StockMovement(OwnedModel):
    class MovementType(models.TextChoices):
        IN = "IN", "Stock In"
        OUT = "OUT", "Stock Out"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"

    item = models.ForeignKey(
        Item, on_delete=models.CASCADE, related_name="movements"
    )
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="stock_movements"
    )
    movement_type = models.CharField(
        max_length=20, choices=MovementType.choices, default=MovementType.IN
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference = models.CharField(max_length=150, blank=True)
    reason = models.CharField(max_length=255, blank=True)
    date = models.DateField()
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.movement_type} {self.quantity} {self.item.name}"
