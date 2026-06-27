from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ActivityPhotoViewSet,
    ClearAllPingsView,
    FieldActivityViewSet,
    GeofenceViewSet,
    LocationPingViewSet,
)

router = DefaultRouter()
router.register("geofences", GeofenceViewSet, basename="geofence")
router.register("pings", LocationPingViewSet, basename="locationping")
router.register("activities", FieldActivityViewSet, basename="fieldactivity")
router.register("activity-photos", ActivityPhotoViewSet, basename="activityphoto")

urlpatterns = [
    # Standalone endpoint placed BEFORE router.urls so it matches before
    # the router's detail route (^pings/(?P<pk>[^/.]+)/$).
    path(
        "pings/clear-all/",
        ClearAllPingsView.as_view(),
        name="clear-all-pings",
    ),
] + router.urls
