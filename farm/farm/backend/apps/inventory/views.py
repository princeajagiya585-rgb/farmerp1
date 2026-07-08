from decimal import Decimal

from django.db import transaction
from django.db.models import F, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.core.mixins import BaseModelViewSet
from apps.farms.views import FarmScopedQuerysetMixin

from .models import Item, StockMovement
from .serializers import ItemSerializer, StockMovementSerializer


class ItemViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Item.objects.select_related("farm").all()
    serializer_class = ItemSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm", "category", "created_by"]
    search_fields = ["name", "sku", "supplier", "description"]

    @action(detail=False, methods=["get"])
    def low_stock(self, request):
        qs = self.filter_queryset(
            self.get_queryset().filter(current_stock__lte=F("reorder_level"))
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def valuation(self, request):
        qs = self.filter_queryset(self.get_queryset())
        total = qs.aggregate(
            total=Sum(F("current_stock") * F("unit_cost"))
        )["total"] or Decimal("0")
        by_category = (
            qs.values("category")
            .annotate(value=Sum(F("current_stock") * F("unit_cost")))
            .order_by("category")
        )
        breakdown = {
            row["category"]: row["value"] or Decimal("0") for row in by_category
        }
        return Response({"total_value": total, "by_category": breakdown})


class StockMovementViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = StockMovement.objects.select_related("item", "farm").all()
    serializer_class = StockMovementSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["item", "farm", "movement_type", "created_by"]
    search_fields = ["reference", "reason", "notes", "item__name", "item__sku"]

    @action(detail=False, methods=["get"])
    def consumption(self, request):
        """Consumption report: total stock-OUT per item over an optional date range."""
        qs = self.filter_queryset(self.get_queryset()).filter(
            movement_type=StockMovement.MovementType.OUT
        )
        start = request.query_params.get("start")
        end = request.query_params.get("end")
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        rows = [
            {
                "item": row["item__name"],
                "category": row["item__category"],
                "consumed": row["consumed"] or Decimal("0"),
            }
            for row in qs.values("item__name", "item__category")
            .annotate(consumed=Sum("quantity"))
            .order_by("-consumed")
        ]
        total = sum((r["consumed"] for r in rows), Decimal("0"))
        return Response({"rows": rows, "total_consumed": total})

    @staticmethod
    def _delta(movement_type, quantity):
        """Signed effect of a movement on current_stock."""
        q = quantity or Decimal("0")
        return -q if movement_type == StockMovement.MovementType.OUT else q

    def _apply(self, item_id, delta):
        # Atomic, DB-side increment so two concurrent movements on the same item
        # can't read-modify-write over each other and corrupt the stock level.
        Item.objects.filter(pk=item_id).update(
            current_stock=Coalesce(F("current_stock"), Decimal("0")) + delta,
            updated_at=timezone.now(),
        )

    def perform_create(self, serializer):
        with transaction.atomic():
            super().perform_create(serializer)
            movement = serializer.instance
            self._apply(movement.item_id, self._delta(movement.movement_type, movement.quantity))

    def perform_update(self, serializer):
        # Reverse the old effect, then apply the new one (handles item/type/qty changes).
        with transaction.atomic():
            old = StockMovement.objects.get(pk=serializer.instance.pk)
            old_item_id, old_delta = old.item_id, self._delta(old.movement_type, old.quantity)
            movement = serializer.save()
            self._apply(old_item_id, -old_delta)
            self._apply(movement.item_id, self._delta(movement.movement_type, movement.quantity))

    def perform_destroy(self, instance):
        with transaction.atomic():
            item_id, delta = instance.item_id, self._delta(instance.movement_type, instance.quantity)
            instance.delete()
            self._apply(item_id, -delta)
