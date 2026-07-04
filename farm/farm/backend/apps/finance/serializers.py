from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.utils import build_absolute_photo_url

from .models import (
    Budget,
    CostCenter,
    Expense,
    LedgerEntry,
    Payment,
    Purchase,
    PurchaseItem,
    RevenueEntry,
    Sale,
)


class ExpenseSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    cost_center_name = serializers.CharField(
        source="cost_center.name", read_only=True
    )
    crop_name = serializers.CharField(source="crop.name", read_only=True)
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True
    )
    bill_file_url = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = "__all__"
        extra_kwargs = {"bill_file": {"write_only": True}}

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_bill_file_url(self, obj):
        return build_absolute_photo_url(obj.bill_file, self.context.get("request"))


class PurchaseItemSerializer(serializers.ModelSerializer):
    inventory_item_name = serializers.CharField(
        source="inventory_item.name", read_only=True
    )

    class Meta:
        model = PurchaseItem
        fields = "__all__"


class PurchaseSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True
    )
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True, default=None
    )
    items = PurchaseItemSerializer(many=True, read_only=True)
    bill_file_url = serializers.SerializerMethodField()
    employee_name = serializers.CharField(
        source="employee.name", read_only=True, default=None
    )

    class Meta:
        model = Purchase
        fields = "__all__"
        extra_kwargs = {"bill_file": {"write_only": True}}

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_bill_file_url(self, obj):
        return build_absolute_photo_url(obj.bill_file, self.context.get("request"))


class LedgerEntrySerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True, default=None
    )

    class Meta:
        model = LedgerEntry
        fields = "__all__"


class PaymentSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True, default=None
    )
    bill_file_url = serializers.SerializerMethodField()
    employee_name = serializers.CharField(
        source="employee.name", read_only=True, default=None
    )

    class Meta:
        model = Payment
        fields = "__all__"
        extra_kwargs = {"bill_file": {"write_only": True}}

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_bill_file_url(self, obj):
        return build_absolute_photo_url(obj.bill_file, self.context.get("request"))


class RevenueEntrySerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)

    class Meta:
        model = RevenueEntry
        fields = "__all__"


class CostCenterSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    bill_file_url = serializers.SerializerMethodField()

    class Meta:
        model = CostCenter
        fields = "__all__"
        extra_kwargs = {"bill_file": {"write_only": True}}

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_bill_file_url(self, obj):
        return build_absolute_photo_url(obj.bill_file, self.context.get("request"))


class BudgetSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    cost_center_name = serializers.CharField(
        source="cost_center.name", read_only=True
    )
    spent = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()

    class Meta:
        model = Budget
        fields = "__all__"

    @extend_schema_field(serializers.DecimalField(max_digits=12, decimal_places=2))
    def get_spent(self, obj):
        return obj.spent

    @extend_schema_field(serializers.DecimalField(max_digits=12, decimal_places=2))
    def get_remaining(self, obj):
        return obj.remaining


class SaleSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    crop_name = serializers.CharField(source="crop.name", read_only=True)
    employee_name = serializers.CharField(
        source="employee.name", read_only=True, default=None
    )
    bill_file_url = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = "__all__"
        extra_kwargs = {"bill_file": {"write_only": True}}

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_bill_file_url(self, obj):
        return build_absolute_photo_url(obj.bill_file, self.context.get("request"))
