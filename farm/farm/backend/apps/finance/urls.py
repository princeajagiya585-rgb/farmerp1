from rest_framework.routers import DefaultRouter

from .views import (
    BudgetViewSet,
    CostCenterViewSet,
    ExpenseViewSet,
    FinanceReportViewSet,
    LedgerEntryViewSet,
    PaymentViewSet,
    PurchaseItemViewSet,
    PurchaseViewSet,
    RevenueEntryViewSet,
    SaleViewSet,
)

router = DefaultRouter()
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("purchase-items", PurchaseItemViewSet, basename="purchaseitem")
router.register("purchases", PurchaseViewSet, basename="purchase")
router.register("ledger", LedgerEntryViewSet, basename="ledgerentry")
router.register("payments", PaymentViewSet, basename="payment")
router.register("revenues", RevenueEntryViewSet, basename="revenue")
router.register("sales", SaleViewSet, basename="sale")
router.register("cost-centers", CostCenterViewSet, basename="costcenter")
router.register("budgets", BudgetViewSet, basename="budget")
router.register("reports", FinanceReportViewSet, basename="finance-report")

urlpatterns = router.urls
