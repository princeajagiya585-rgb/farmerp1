from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.core.mixins import BaseModelViewSet
from apps.farms.views import FarmScopedQuerysetMixin

from .models import (
    Crop,
    GrowthRecord,
    HarvestRecord,
    InputApplication,
    Observation,
    PlantationRecord,
)
from .serializers import (
    CropSerializer,
    GrowthRecordSerializer,
    HarvestRecordSerializer,
    InputApplicationSerializer,
    ObservationSerializer,
    PlantationRecordSerializer,
)


class CropViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Crop.objects.select_related("farm", "field").all()
    serializer_class = CropSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm", "field", "status", "season"]
    search_fields = ["name", "variety"]

    @action(detail=False, methods=["get"])
    def analytics(self, request):
        """Historical analysis: crop-wise & farm-wise yields, seasonal & yield analysis."""
        from decimal import Decimal

        crops = list(self.filter_queryset(self.get_queryset()))
        crop_ids = [c.id for c in crops]
        harvests = HarvestRecord.objects.filter(crop_id__in=crop_ids).select_related(
            "crop", "farm"
        )

        by_crop, by_farm, by_season = {}, {}, {}
        for h in harvests:
            cname = h.crop.name
            c = by_crop.setdefault(cname, {"crop": cname, "quantity": Decimal("0"), "revenue": Decimal("0")})
            c["quantity"] += h.quantity or Decimal("0")
            c["revenue"] += h.revenue or Decimal("0")
            fname = h.farm.name
            f = by_farm.setdefault(fname, {"farm": fname, "quantity": Decimal("0"), "revenue": Decimal("0")})
            f["quantity"] += h.quantity or Decimal("0")
            f["revenue"] += h.revenue or Decimal("0")

        # Actual harvested quantity per crop id — used for both the seasonal
        # roll-up and the crop-level yield analysis below.
        actual_by_cropobj = {}
        for h in harvests:
            actual_by_cropobj[h.crop_id] = actual_by_cropobj.get(h.crop_id, Decimal("0")) + (h.quantity or Decimal("0"))

        for c in crops:
            season = c.season or "Unspecified"
            s = by_season.setdefault(season, {"season": season, "crops": 0, "expected_yield": Decimal("0"), "harvested": Decimal("0")})
            s["crops"] += 1
            s["expected_yield"] += c.expected_yield or Decimal("0")
            s["harvested"] += actual_by_cropobj.get(c.id, Decimal("0"))

        yield_analysis = []
        for c in crops:
            actual = actual_by_cropobj.get(c.id, Decimal("0"))
            expected = c.expected_yield or Decimal("0")
            yield_analysis.append(
                {
                    "crop": f"{c.name} {c.variety}".strip(),
                    "season": c.season or "—",
                    "expected_yield": expected,
                    "actual_yield": actual,
                    "variance": actual - expected,
                }
            )

        return Response(
            {
                "by_crop": sorted(by_crop.values(), key=lambda r: -r["quantity"]),
                "by_farm": sorted(by_farm.values(), key=lambda r: -r["quantity"]),
                "by_season": sorted(by_season.values(), key=lambda r: r["season"]),
                "yield_analysis": yield_analysis,
            }
        )

    @action(detail=False, methods=["get"])
    def allocation(self, request):
        """Crop allocation grouped by farm and field/block."""
        crops = self.filter_queryset(self.get_queryset()).select_related(
            "farm", "field"
        ).order_by("farm__name", "field__name", "name")

        farms_map = {}
        for c in crops:
            farm_id = c.farm_id
            if farm_id not in farms_map:
                farms_map[farm_id] = {
                    "farm_id": farm_id,
                    "farm_name": c.farm.name,
                    "blocks": {},
                }
            block_key = c.field_id or 0
            block_name = c.field.block_name if c.field and c.field.block_name else (c.field.name if c.field else "Unassigned")
            if block_key not in farms_map[farm_id]["blocks"]:
                farms_map[farm_id]["blocks"][block_key] = {
                    "field_id": c.field_id,
                    "block_name": block_name,
                    "crops": [],
                }
            farms_map[farm_id]["blocks"][block_key]["crops"].append({
                "id": c.id,
                "name": c.name,
                "variety": c.variety,
                "status": c.status,
                "area": str(c.area),
                "growth_stage": c.growth_stage,
                "planting_date": c.planting_date,
                "expected_harvest_date": c.expected_harvest_date,
            })

        result = []
        for farm_data in farms_map.values():
            farm_data["blocks"] = list(farm_data["blocks"].values())
            farm_data["total_crops"] = sum(len(b["crops"]) for b in farm_data["blocks"])
            result.append(farm_data)

        return Response(result)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        crop = self.get_object()
        data = {
            "crop": CropSerializer(crop, context={"request": request}).data,
            "observations": ObservationSerializer(
                crop.observations.all(), many=True, context={"request": request}
            ).data,
            "input_applications": InputApplicationSerializer(
                crop.input_applications.all(),
                many=True,
                context={"request": request},
            ).data,
            "growth_records": GrowthRecordSerializer(
                crop.growth_records.all(), many=True, context={"request": request}
            ).data,
            "harvest_records": HarvestRecordSerializer(
                crop.harvest_records.all(), many=True, context={"request": request}
            ).data,
        }
        return Response(data)


class PlantationRecordViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = PlantationRecord.objects.select_related("crop", "farm").all()
    serializer_class = PlantationRecordSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["crop", "farm"]
    search_fields = ["spacing", "notes"]


class ObservationViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Observation.objects.select_related("crop", "farm", "field").all()
    serializer_class = ObservationSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["crop", "farm", "observation_type", "severity"]
    search_fields = ["title", "description"]


class InputApplicationViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = InputApplication.objects.select_related(
        "crop", "farm", "field", "inventory_item"
    ).all()
    serializer_class = InputApplicationSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["crop", "farm", "input_type"]
    search_fields = ["product_name", "dosage", "notes"]


class GrowthRecordViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = GrowthRecord.objects.select_related("crop", "farm").all()
    serializer_class = GrowthRecordSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["crop", "farm", "stage"]
    search_fields = ["stage", "notes"]


class HarvestRecordViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = HarvestRecord.objects.select_related("crop", "farm").all()
    serializer_class = HarvestRecordSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["crop", "farm", "quality_grade"]
    search_fields = ["quality_grade", "notes"]
