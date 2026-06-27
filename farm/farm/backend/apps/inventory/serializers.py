from rest_framework import serializers

from .models import Item, StockMovement


class ItemSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    stock_value = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )

    class Meta:
        model = Item
        fields = "__all__"


class StockMovementSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)

    class Meta:
        model = StockMovement
        fields = "__all__"
