from decimal import Decimal
from django.db.models import Count, Q, Sum
from django.utils import timezone

from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.core.mixins import BaseModelViewSet
from apps.agronomy.models import Crop, HarvestRecord
from apps.finance.models import Expense, RevenueEntry
from apps.workforce.models import Attendance, Employee
from apps.tasks.models import Task

from .models import Farm, Field, FarmDocument, FarmHistory
from .serializers import (
    FarmSerializer,
    FarmListSerializer,
    FarmDashboardSerializer,
    FieldSerializer,
    FieldDetailSerializer,
    FarmDocumentSerializer,
    FarmHistorySerializer,
)


class FarmScopedQuerysetMixin:
    """Restrict list/detail to the requesting user's assigned farms."""

    GLOBAL_ROLES = {Role.SUPER_ADMIN}
    farm_lookup = "farm_id"  # path from model to the farm id

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role in self.GLOBAL_ROLES:
            return qs
        farm_ids = list(user.farms.values_list("id", flat=True))
        return qs.filter(**{f"{self.farm_lookup}__in": farm_ids})


class FarmViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Farm.objects.select_related("manager").all()
    serializer_class = FarmSerializer
    farm_lookup = "id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["is_active"]
    search_fields = ["name", "code", "location"]

    def get_serializer_class(self):
        if self.action == "list":
            return FarmListSerializer
        return FarmSerializer

    def perform_create(self, serializer):
        farm = serializer.save()
        # Assign the creator (and the farm's manager) as members so the new
        # farm is immediately visible to them in every farm-scoped list
        # (e.g. the Payroll Periods farm dropdown).
        user = self.request.user
        if user and user.is_authenticated:
            farm.members.add(user)
        if farm.manager_id:
            farm.members.add(farm.manager)

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """Farm-wise performance dashboard with KPIs for each farm."""
        farms = self.filter_queryset(self.get_queryset())
        today = timezone.now().date()
        results = []

        for farm in farms:
            fields_count = farm.field_count
            active_crops_count = farm.active_crop_count
            total_employees = farm.employee_count
            total_assets = farm.asset_count

            total_tasks_open = Task.objects.filter(
                farm=farm,
                status__in=[Task.Status.TODO, Task.Status.IN_PROGRESS],
            ).count()

            present_today = Attendance.objects.filter(
                farm=farm, date=today, status=Attendance.Status.PRESENT
            ).count()

            total_revenue = float(
                RevenueEntry.objects.filter(farm=farm).aggregate(s=Sum("amount"))["s"] or Decimal("0")
            )
            total_expenses = float(
                Expense.objects.filter(farm=farm, status=Expense.Status.APPROVED).aggregate(s=Sum("amount"))["s"]
                or Decimal("0")
            )
            total_harvest_qty = float(
                HarvestRecord.objects.filter(farm=farm).aggregate(s=Sum("quantity"))["s"] or Decimal("0")
            )

            # Determine alerts
            alerts_count = 0
            if total_tasks_open > 10:
                alerts_count += 1
            if total_assets == 0:
                alerts_count += 1
            if total_employees == 0:
                alerts_count += 1

            farm_data = FarmListSerializer(farm, context={"request": request}).data
            results.append({
                "farm": farm_data,
                "fields_count": fields_count,
                "active_crops_count": active_crops_count,
                "total_employees": total_employees,
                "total_assets": total_assets,
                "total_tasks_open": total_tasks_open,
                "present_today": present_today,
                "total_revenue": total_revenue,
                "total_expenses": total_expenses,
                "total_harvest_qty": total_harvest_qty,
                "alerts_count": alerts_count,
            })

        return Response(results)

    @action(detail=True, methods=["get"])
    def overview(self, request, pk=None):
        """Comprehensive overview of a single farm with all related data."""
        farm = self.get_object()
        today = timezone.now().date()

        # Fields with current crop info
        fields = farm.fields.all()
        fields_data = FieldDetailSerializer(fields, many=True, context={"request": request}).data

        # Active crops
        active_crops = Crop.objects.filter(
            farm=farm,
            status__in=[Crop.Status.PLANNED, Crop.Status.PLANTED, Crop.Status.GROWING],
        ).values("id", "name", "variety", "field__name", "status", "area", "planting_date", "expected_yield")

        # Recent harvest records (last 10)
        recent_harvests = list(
            HarvestRecord.objects.filter(farm=farm)
            .select_related("crop")
            .order_by("-date")[:10]
            .values("date", "crop__name", "quantity", "unit", "revenue")
        )

        # Assets summary
        assets_summary = farm.assets.values("asset_type").annotate(count=Count("id")).order_by("asset_type")

        # Financial summary
        total_revenue = float(
            RevenueEntry.objects.filter(farm=farm).aggregate(s=Sum("amount"))["s"] or Decimal("0")
        )
        total_expenses = float(
            Expense.objects.filter(farm=farm, status=Expense.Status.APPROVED).aggregate(s=Sum("amount"))["s"]
            or Decimal("0")
        )

        # Employee summary
        employees_total = farm.employees.count()
        present_today = Attendance.objects.filter(
            farm=farm, date=today, status=Attendance.Status.PRESENT
        ).count()

        # Task summary
        open_tasks = Task.objects.filter(
            farm=farm,
            status__in=[Task.Status.TODO, Task.Status.IN_PROGRESS],
        ).count()
        overdue_tasks = Task.objects.filter(
            farm=farm,
            due_date__lt=today,
            status__in=[Task.Status.TODO, Task.Status.IN_PROGRESS],
        ).count()

        # History timeline
        history = FarmHistory.objects.filter(farm=farm)[:20]
        history_data = FarmHistorySerializer(history, many=True, context={"request": request}).data

        return Response({
            "farm_data": FarmSerializer(farm, context={"request": request}).data,
            "fields": fields_data,
            "fields_count": fields.count(),
            "total_field_area": float(fields.aggregate(s=Sum("area"))["s"] or Decimal("0")),
            "active_crops": list(active_crops),
            "active_crops_count": len(active_crops),
            "recent_harvests": recent_harvests,
            "assets_summary": list(assets_summary),
            "total_assets": farm.asset_count,
            "financial_summary": {
                "total_revenue": total_revenue,
                "total_expenses": total_expenses,
                "net": total_revenue - total_expenses,
            },
            "workforce_summary": {
                "total_employees": employees_total,
                "present_today": present_today,
                "absent_today": Attendance.objects.filter(
                    farm=farm, date=today, status=Attendance.Status.ABSENT
                ).count(),
            },
            "task_summary": {
                "open_tasks": open_tasks,
                "overdue_tasks": overdue_tasks,
                "completed_tasks": Task.objects.filter(farm=farm, status=Task.Status.COMPLETED).count(),
            },
            "history": history_data,
        })


class FieldViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Field.objects.select_related("farm").all()
    serializer_class = FieldSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm", "is_active"]
    search_fields = ["name", "code", "soil_type"]

    def get_serializer_class(self):
        if self.action == "crop_allocation" or self.action == "retrieve":
            return FieldDetailSerializer
        return FieldSerializer

    @action(detail=True, methods=["get"])
    def crop_allocation(self, request, pk=None):
        """Get the crop allocation history for a specific field/plot."""
        field = self.get_object()
        crops = Crop.objects.filter(field=field).order_by("-created_at")

        from apps.agronomy.serializers import CropSerializer
        crops_data = CropSerializer(
            crops, many=True, context={"request": request}
        ).data

        current_crops = [c for c in crops_data if c.get("status") in ("PLANTED", "GROWING")]
        past_crops = [c for c in crops_data if c.get("status") not in ("PLANTED", "GROWING")]

        return Response({
            "field": FieldDetailSerializer(field, context={"request": request}).data,
            "current_crops": current_crops,
            "past_crops": past_crops,
            "total_crops_planted": len(crops),
        })


class FarmDocumentViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = FarmDocument.objects.select_related("farm", "uploaded_by").all()
    serializer_class = FarmDocumentSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm", "doc_type"]
    search_fields = ["title", "description"]


class FarmHistoryViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = FarmHistory.objects.select_related("farm", "recorded_by").all()
    serializer_class = FarmHistorySerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm", "event_type"]
    search_fields = ["title", "description"]
