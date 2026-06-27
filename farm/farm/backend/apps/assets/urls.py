from rest_framework.routers import DefaultRouter

from .views import AssetViewSet, AssetMaintenanceViewSet

router = DefaultRouter()
router.register("items", AssetViewSet, basename="asset")
router.register("maintenance", AssetMaintenanceViewSet, basename="asset-maintenance")

urlpatterns = router.urls
