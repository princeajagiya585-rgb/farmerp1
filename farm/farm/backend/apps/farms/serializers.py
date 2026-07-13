from rest_framework import serializers

from .models import Farm, Field, FarmDocument, FarmHistory


class FieldSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    current_crop = serializers.CharField(read_only=True)

    class Meta:
        model = Field
        fields = "__all__"


class FieldDetailSerializer(serializers.ModelSerializer):
    """Extended serializer with crop allocation info."""
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    current_crop = serializers.CharField(read_only=True)
    crop_history = serializers.JSONField(read_only=True)

    class Meta:
        model = Field
        fields = "__all__"


class FarmSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source="manager.get_full_name", read_only=True)
    field_count = serializers.IntegerField(read_only=True)
    active_crop_count = serializers.IntegerField(read_only=True)
    employee_count = serializers.IntegerField(read_only=True)
    asset_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Farm
        fields = "__all__"


class FarmListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for farm dashboard listing."""
    manager_name = serializers.CharField(source="manager.get_full_name", read_only=True)
    field_count = serializers.IntegerField(read_only=True)
    active_crop_count = serializers.IntegerField(read_only=True)
    employee_count = serializers.IntegerField(read_only=True)
    asset_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Farm
        fields = [
            "id", "name", "code", "location", "total_area",
            "latitude", "longitude", "geofence", "check_in_radius",
            "manager_name", "field_count", "active_crop_count",
            "employee_count", "asset_count", "is_active", "created_at",
        ]


class FarmDashboardSerializer(serializers.Serializer):
    """Farm-wise dashboard KPIs."""
    farm = FarmListSerializer()
    fields_count = serializers.IntegerField()
    active_crops_count = serializers.IntegerField()
    total_employees = serializers.IntegerField()
    total_assets = serializers.IntegerField()
    total_tasks_open = serializers.IntegerField()
    present_today = serializers.IntegerField()
    total_revenue = serializers.FloatField()
    total_expenses = serializers.FloatField()
    total_harvest_qty = serializers.FloatField()
    alerts_count = serializers.IntegerField()


class FarmDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.get_full_name", read_only=True)
    doc_type_display = serializers.CharField(source="get_doc_type_display", read_only=True)

    class Meta:
        model = FarmDocument
        fields = "__all__"


class FarmHistorySerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source="recorded_by.get_full_name", read_only=True)
    event_type_display = serializers.CharField(source="get_event_type_display", read_only=True)

    class Meta:
        model = FarmHistory
        fields = "__all__"
