from rest_framework import serializers

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

    def get_bill_file_url(self, obj):
        if obj.bill_file:
            request = self.context.get("request")
            return request.build_absolute_uri(obj.bill_file.url) if request else obj.bill_file.url
        return None


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

    def get_bill_file_url(self, obj):
        if obj.bill_file:
            request = self.context.get("request")
            return request.build_absolute_uri(obj.bill_file.url) if request else obj.bill_file.url
        return None


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

    def get_bill_file_url(self, obj):
        if obj.bill_file:
            request = self.context.get("request")
            return request.build_absolute_uri(obj.bill_file.url) if request else obj.bill_file.url
        return None


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

    def get_bill_file_url(self, obj):
        if obj.bill_file:
            request = self.context.get("request")
            return request.build_absolute_uri(obj.bill_file.url) if request else obj.bill_file.url
        return None


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

    def get_spent(self, obj):
        return obj.spent

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

    def get_bill_file_url(self, obj):
        if obj.bill_file:
            request = self.context.get("request")
            return request.build_absolute_uri(obj.bill_file.url) if request else obj.bill_file.url
        return None
