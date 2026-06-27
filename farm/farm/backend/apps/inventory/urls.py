from rest_framework.routers import DefaultRouter

from .views import ItemViewSet, StockMovementViewSet

router = DefaultRouter()
router.register("movements", StockMovementViewSet, basename="stockmovement")
router.register("items", ItemViewSet, basename="item")

urlpatterns = router.urls
