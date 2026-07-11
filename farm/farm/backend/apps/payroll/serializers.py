from drf_spectacular.utils import extend_schema_serializer
from rest_framework import serializers

from .models import (
    PayrollPeriod,
    Advance,
    Incentive,
    Deduction,
    Payslip,
    Payment,
)


class PayrollPeriodSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = PayrollPeriod
        fields = "__all__"


class AdvanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    balance = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = Advance
        fields = "__all__"


class IncentiveSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = Incentive
        fields = "__all__"


class DeductionSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = Deduction
        fields = "__all__"


class PayslipSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    employee_monthly_salary = serializers.DecimalField(
        source="employee.monthly_salary",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    period_month = serializers.IntegerField(source="period.month", read_only=True)
    period_year = serializers.IntegerField(source="period.year", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = Payslip
        fields = "__all__"


@extend_schema_serializer(component_name="PayrollPayment")
class PaymentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    farm_name = serializers.CharField(source="employee.farm.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = "__all__"
