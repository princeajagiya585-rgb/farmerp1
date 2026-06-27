from rest_framework.routers import DefaultRouter

from .views import FarmViewSet, FieldViewSet, FarmDocumentViewSet, FarmHistoryViewSet

router = DefaultRouter()
router.register("documents", FarmDocumentViewSet, basename="farm-document")
router.register("history", FarmHistoryViewSet, basename="farm-history")
router.register("fields", FieldViewSet, basename="field")
router.register("", FarmViewSet, basename="farm")

urlpatterns = router.urls
