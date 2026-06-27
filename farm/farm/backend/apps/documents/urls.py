from rest_framework.routers import DefaultRouter

from .views import DocumentVersionViewSet, DocumentViewSet

router = DefaultRouter()
router.register("versions", DocumentVersionViewSet, basename="documentversion")
router.register("", DocumentViewSet, basename="document")

urlpatterns = router.urls
