from rest_framework import serializers

from .models import BreakdownReport


class BreakdownReportSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    reported_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True
    )
    acknowledged_by_name = serializers.CharField(
        source="acknowledged_by.get_full_name", read_only=True
    )
    severity_display = serializers.CharField(
        source="get_severity_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = BreakdownReport
        fields = "__all__"
        read_only_fields = (
            "created_by",
            "acknowledged_by",
            "resolved_at",
            "status",
        )
