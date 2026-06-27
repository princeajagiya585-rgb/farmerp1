from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.core.mixins import BaseModelViewSet, EmployeeSelfScopedMixin
from apps.core.permissions import RoleAllowed
from apps.farms.views import FarmScopedQuerysetMixin

from .models import ActivityPhoto, FieldActivity, Geofence, LocationPing
from .serializers import (
    ActivityPhotoSerializer,
    FieldActivitySerializer,
    GeofenceSerializer,
    LocationPingSerializer,
)
from .utils import broadcast_ping, haversine_m


class ClearAllPingsView(APIView):
    """
    Standalone endpoint to delete every location ping.
    Only SUPER_ADMIN and FARM_MANAGER roles may call this.
    """
    permission_classes = [RoleAllowed]
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = []

    def post(self, request):
        # Super admin clears everything; a farm manager may only clear pings
        # for the farms they're assigned to (never other farms' history).
        if request.user.role == Role.SUPER_ADMIN:
            qs = LocationPing.objects.all()
        else:
            qs = LocationPing.objects.filter(farm__in=request.user.farms.all())
        count, _ = qs.delete()
        return Response(
            {"detail": f"Deleted {count} location ping(s).", "deleted": count}
        )


class GeofenceViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Geofence.objects.select_related("farm").all()
    serializer_class = GeofenceSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm"]

    def perform_create(self, serializer):
        farm = serializer.validated_data.get("farm")
        center_lat = serializer.validated_data.get("center_lat") or (farm.latitude if farm else None)
        center_lng = serializer.validated_data.get("center_lng") or (farm.longitude if farm else None)
        name = serializer.validated_data.get("name") or (farm.name if farm else "Geofence")
        serializer.save(
            name=name,
            center_lat=center_lat,
            center_lng=center_lng,
            radius_m=0,
        )

    def perform_update(self, serializer):
        farm = serializer.validated_data.get("farm", serializer.instance.farm)
        center_lat = serializer.validated_data.get("center_lat") or (farm.latitude if farm else None)
        center_lng = serializer.validated_data.get("center_lng") or (farm.longitude if farm else None)
        serializer.save(center_lat=center_lat, center_lng=center_lng)


class LocationPingViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = LocationPing.objects.select_related("user", "farm", "task").all()
    serializer_class = LocationPingSerializer
    farm_lookup = "farm_id"
    employee_self_lookup = "user"  # pings link directly to the user
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["user", "farm", "activity", "task"]
    # This view filters date_from/date_to on recorded_at itself (below).
    date_range_field = None

    def get_queryset(self):
        qs = super().get_queryset()
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if date_from:
            qs = qs.filter(recorded_at__gte=date_from)
        if date_to:
            # Include the full end day by adding a day
            qs = qs.filter(recorded_at__date__lte=date_to)
        return qs

    def perform_create(self, serializer):
        instance = serializer.save(
            created_by=self.request.user,
            user=self.request.user,
            recorded_at=serializer.validated_data.get("recorded_at") or timezone.now(),
        )
        broadcast_ping(instance, request=self.request)

    @action(detail=False, methods=["get"])
    def live(self, request):
        qs = self.filter_queryset(self.get_queryset()).order_by(
            "user_id", "-recorded_at"
        )
        latest = {}
        for ping in qs:
            if ping.user_id not in latest:
                latest[ping.user_id] = ping
        serializer = self.get_serializer(list(latest.values()), many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def route(self, request):
        """Ordered route (path) of pings for a user, with total distance walked.

        Query params: user (required for a single route), date (YYYY-MM-DD).
        """
        qs = self.filter_queryset(self.get_queryset())
        user = request.query_params.get("user")
        date_ = request.query_params.get("date")
        if user:
            qs = qs.filter(user_id=user)
        if date_:
            qs = qs.filter(recorded_at__date=date_)
        qs = qs.order_by("recorded_at")

        points, dist, prev = [], 0.0, None
        for p in qs:
            lat, lng = float(p.latitude), float(p.longitude)
            if prev is not None:
                dist += haversine_m(prev[0], prev[1], lat, lng)
            prev = (lat, lng)
            points.append(
                {
                    "lat": lat,
                    "lng": lng,
                    "recorded_at": p.recorded_at,
                    "activity": p.activity,
                    "user_name": p.user.get_full_name() or p.user.username if p.user else None,
                }
            )
        return Response(
            {"count": len(points), "total_distance_m": round(dist, 1), "points": points}
        )


class FieldActivityViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = FieldActivity.objects.select_related(
        "user", "farm", "task", "verified_by"
    ).prefetch_related("photos").all()
    serializer_class = FieldActivitySerializer
    farm_lookup = "farm_id"
    employee_self_lookup = "user"  # activities link directly to the user
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["user", "farm", "task", "status"]
    search_fields = ["description", "user__first_name", "user__last_name"]

    def get_queryset(self):
        qs = FieldActivity.objects.select_related(
            "user", "farm", "task", "verified_by"
        ).prefetch_related("photos").all()
        user = self.request.user
        if user.role == Role.SUPER_ADMIN:
            return qs
        if user.role == Role.EMPLOYEE:
            return qs.filter(user=user)
        # FARM_MANAGER: show activities for farms they manage or are assigned to
        from apps.farms.models import Farm
        assigned_farm_ids = list(user.farms.values_list("id", flat=True))
        managed_farm_ids = list(Farm.objects.filter(manager=user).values_list("id", flat=True))
        farm_ids = list(set(assigned_farm_ids + managed_farm_ids))
        return qs.filter(farm_id__in=farm_ids)

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            user=self.request.user,
            recorded_at=serializer.validated_data.get("recorded_at") or timezone.now(),
        )

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        activity = self.get_object()
        activity.status = FieldActivity.Status.VERIFIED
        activity.verified_by = request.user
        activity.verified_at = timezone.now()
        activity.save(
            update_fields=["status", "verified_by", "verified_at", "updated_at"]
        )
        return Response(self.get_serializer(activity).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        activity = self.get_object()
        activity.status = FieldActivity.Status.REJECTED
        activity.verified_by = request.user
        activity.verified_at = timezone.now()
        activity.save(
            update_fields=["status", "verified_by", "verified_at", "updated_at"]
        )
        return Response(self.get_serializer(activity).data)

    @action(detail=False, methods=["get"])
    def feed(self, request):
        """Live activity feed: the most recent field activities."""
        qs = self.filter_queryset(self.get_queryset()).order_by("-created_at")[:50]
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=False, methods=["get"])
    def field_progress(self, request):
        """Field progress tracking: activity counts & verified-% per field/task."""
        qs = self.filter_queryset(self.get_queryset())
        farm = request.query_params.get("farm")
        if farm:
            qs = qs.filter(farm_id=farm)

        groups = {}
        for a in qs.select_related("field", "task"):
            key = a.field_id or a.task_id or "unassigned"
            label = (
                a.field.name
                if a.field_id
                else (a.task.title if a.task_id else "Unassigned")
            )
            g = groups.setdefault(
                key,
                {"label": label, "total": 0, "verified": 0, "submitted": 0, "rejected": 0},
            )
            g["total"] += 1
            if a.status == FieldActivity.Status.VERIFIED:
                g["verified"] += 1
            elif a.status == FieldActivity.Status.SUBMITTED:
                g["submitted"] += 1
            elif a.status == FieldActivity.Status.REJECTED:
                g["rejected"] += 1

        rows = []
        for g in groups.values():
            g["verified_pct"] = (
                round(100 * g["verified"] / g["total"], 1) if g["total"] else 0
            )
            rows.append(g)
        rows.sort(key=lambda r: r["label"])
        return Response({"rows": rows})


class ActivityPhotoViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = ActivityPhoto.objects.select_related(
        "activity", "activity__farm"
    ).all()
    serializer_class = ActivityPhotoSerializer
    farm_lookup = "activity__farm_id"
    employee_self_lookup = "activity__user"  # photos link via their activity
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["activity", "phase"]
