from apps.accounts.models import Role
from apps.core.mixins import BaseModelViewSet
from apps.farms.views import FarmScopedQuerysetMixin

from .models import Asset, AssetMaintenance
from .serializers import AssetSerializer, AssetMaintenanceSerializer


class AssetViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    """Farm assets — equipment, machinery, vehicles, tools, infrastructure.

    Pass ?kind=equipment to limit the list to machinery/equipment/vehicles
    (used by the "Equipment & Machinery" sub-module).
    """

    queryset = Asset.objects.select_related("farm", "assigned_to").all()
    serializer_class = AssetSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm", "asset_type", "status", "assigned_to"]
    search_fields = ["name", "code", "manufacturer", "model_number", "serial_number"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("kind") == "equipment":
            # Convert TextChoices to string values for the filter
            qs = qs.filter(asset_type__in=[k.value for k in Asset.EQUIPMENT_KINDS])
        return qs


class AssetMaintenanceViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = AssetMaintenance.objects.select_related("asset", "asset__farm").all()
    serializer_class = AssetMaintenanceSerializer
    farm_lookup = "asset__farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["asset", "maintenance_type", "date"]
    search_fields = ["description", "performed_by"]
