from rest_framework.routers import DefaultRouter

from .views import (
    EmployeeViewSet,
    ShiftViewSet,
    WorkforceAllocationViewSet,
    AttendanceViewSet,
    DepartmentViewSet,
    SkillViewSet,
    EmploymentHistoryViewSet,
    PerformanceReviewViewSet,
    AvailabilityViewSet,
)

router = DefaultRouter()
router.register("shifts", ShiftViewSet, basename="shift")
router.register("allocations", WorkforceAllocationViewSet, basename="allocation")
router.register("attendance", AttendanceViewSet, basename="attendance")
router.register("employees", EmployeeViewSet, basename="employee")
router.register("departments", DepartmentViewSet, basename="department")
router.register("skills", SkillViewSet, basename="skill")
router.register("employment-history", EmploymentHistoryViewSet, basename="employmenthistory")
router.register("performance", PerformanceReviewViewSet, basename="performance")
router.register("availability", AvailabilityViewSet, basename="availability")

urlpatterns = router.urls
