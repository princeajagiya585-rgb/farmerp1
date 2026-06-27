from rest_framework.routers import DefaultRouter

from .views import BreakdownReportViewSet

router = DefaultRouter()
router.register("reports", BreakdownReportViewSet, basename="breakdown")

urlpatterns = router.urls
