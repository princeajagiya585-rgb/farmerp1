from rest_framework.routers import DefaultRouter

from .views import (
    PayrollPeriodViewSet,
    AdvanceViewSet,
    IncentiveViewSet,
    DeductionViewSet,
    PayslipViewSet,
    PaymentViewSet,
)

router = DefaultRouter()
router.register("periods", PayrollPeriodViewSet, basename="payrollperiod")
router.register("advances", AdvanceViewSet, basename="advance")
router.register("incentives", IncentiveViewSet, basename="incentive")
router.register("deductions", DeductionViewSet, basename="deduction")
router.register("payslips", PayslipViewSet, basename="payslip")
router.register("payments", PaymentViewSet, basename="payment")

urlpatterns = router.urls
