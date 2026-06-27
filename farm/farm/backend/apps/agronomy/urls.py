from rest_framework.routers import DefaultRouter

from .views import (
    CropViewSet,
    GrowthRecordViewSet,
    HarvestRecordViewSet,
    InputApplicationViewSet,
    ObservationViewSet,
    PlantationRecordViewSet,
)

router = DefaultRouter()
router.register("plantation-records", PlantationRecordViewSet, basename="plantation-record")
router.register("observations", ObservationViewSet, basename="observation")
router.register("input-applications", InputApplicationViewSet, basename="input-application")
router.register("growth-records", GrowthRecordViewSet, basename="growth-record")
router.register("harvest-records", HarvestRecordViewSet, basename="harvest-record")
router.register("crops", CropViewSet, basename="crop")

urlpatterns = router.urls
