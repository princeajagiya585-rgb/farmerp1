from django.utils import timezone

from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.core.mixins import BaseModelViewSet, EmployeeSelfScopedMixin
from apps.farms.views import FarmScopedQuerysetMixin

from .models import BreakdownReport
from .serializers import BreakdownReportSerializer

# Roles permitted to action (acknowledge / resolve) a report.
MANAGER_ROLES = {Role.SUPER_ADMIN, Role.FARM_MANAGER}


class BreakdownReportViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    """Machine breakdown reports.

    Workers (EMPLOYEE) create reports from the mobile app; managers/supervisors
    and super admins triage them via acknowledge / resolve. Listing is
    farm-scoped to the requesting user's assigned farms.
    """

    queryset = BreakdownReport.objects.select_related(
        "farm", "created_by", "acknowledged_by"
    ).all()
    serializer_class = BreakdownReportSerializer
    farm_lookup = "farm_id"
    employee_self_lookup = "created_by"
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["farm", "severity", "status"]
    search_fields = ["machine_name", "details", "resolution_notes"]

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        """Manager/supervisor marks the report as seen and being handled."""
        if request.user.role not in MANAGER_ROLES:
            return Response(
                {"detail": "You are not allowed to acknowledge reports."}, status=403
            )
        report = self.get_object()
        report.status = BreakdownReport.Status.ACKNOWLEDGED
        report.acknowledged_by = request.user
        report.save(update_fields=["status", "acknowledged_by", "updated_at"])
        return Response(self.get_serializer(report).data, status=200)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        """Mark the breakdown as resolved, with optional resolution notes."""
        if request.user.role not in MANAGER_ROLES:
            return Response(
                {"detail": "You are not allowed to resolve reports."}, status=403
            )
        report = self.get_object()
        report.status = BreakdownReport.Status.RESOLVED
        report.resolved_at = timezone.now()
        if not report.acknowledged_by:
            report.acknowledged_by = request.user
        if request.data.get("resolution_notes"):
            report.resolution_notes = request.data.get("resolution_notes")
        report.save()
        return Response(self.get_serializer(report).data, status=200)
