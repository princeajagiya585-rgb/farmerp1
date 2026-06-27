from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.core.views import AuditLogViewSet

from .views import (
    AttendanceReportView,
    CropReportView,
    DashboardView,
    FinanceReportView,
    InventoryReportView,
    PayrollReportView,
    TimeTrackingReportView,
)

router = DefaultRouter()
router.register("audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = [
    path("dashboard/", DashboardView.as_view()),
    path("attendance/", AttendanceReportView.as_view()),
    path("payroll/", PayrollReportView.as_view()),
    path("inventory/", InventoryReportView.as_view()),
    path("crops/", CropReportView.as_view()),
    path("finance/", FinanceReportView.as_view()),
    path("time-tracking/", TimeTrackingReportView.as_view()),
] + router.urls
