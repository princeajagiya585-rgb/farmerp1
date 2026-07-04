from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.utils import build_absolute_photo_url

from .models import Asset, AssetMaintenance


class AssetSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    asset_type_display = serializers.CharField(
        source="get_asset_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.name", read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = "__all__"
        read_only_fields = ("created_by",)

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_photo_url(self, obj):
        return build_absolute_photo_url(obj.photo, self.context.get('request'))


class AssetMaintenanceSerializer(serializers.ModelSerializer):
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    maintenance_type_display = serializers.CharField(
        source="get_maintenance_type_display", read_only=True
    )

    class Meta:
        model = AssetMaintenance
        fields = "__all__"
        read_only_fields = ("created_by",)
