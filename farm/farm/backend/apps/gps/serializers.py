from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from .models import ActivityPhoto, FieldActivity, Geofence, LocationPing
from .utils import location_inside_farm, reverse_geocode


def _validate_not_future(value):
    """Timestamp validation: reject timestamps in the future (5 min tolerance)."""
    if value and value > timezone.now() + timedelta(minutes=5):
        raise serializers.ValidationError("Timestamp cannot be in the future.")
    return value


class GeofenceSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    farm_lat = serializers.DecimalField(
        source="farm.latitude", max_digits=9, decimal_places=6, read_only=True
    )
    farm_lng = serializers.DecimalField(
        source="farm.longitude", max_digits=9, decimal_places=6, read_only=True
    )

    class Meta:
        model = Geofence
        fields = "__all__"


class LocationPingSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    task_title = serializers.CharField(source="task.title", read_only=True)
    # The view stamps recorded_at server-side, so clients need not send it.
    recorded_at = serializers.DateTimeField(required=False)
    location_verified = serializers.SerializerMethodField()
    location_name = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()

    class Meta:
        model = LocationPing
        fields = "__all__"

    def get_location_verified(self, obj):
        if not obj.farm_id:
            return None
        return location_inside_farm(obj.farm, obj.latitude, obj.longitude)

    def get_location_name(self, obj):
        if obj.latitude is None or obj.longitude is None:
            return None
        return reverse_geocode(float(obj.latitude), float(obj.longitude))
        
    def get_photo(self, obj):
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None

    def validate_recorded_at(self, value):
        return _validate_not_future(value)


class ActivityPhotoSerializer(serializers.ModelSerializer):
    phase_display = serializers.CharField(source="get_phase_display", read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = ActivityPhoto
        fields = "__all__"

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None

    def validate_recorded_at(self, value):
        return _validate_not_future(value)


class FieldActivitySerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    field_name = serializers.CharField(source="field.name", read_only=True)
    task_title = serializers.CharField(source="task.title", read_only=True)
    verified_by_name = serializers.CharField(
        source="verified_by.get_full_name", read_only=True
    )
    photos = ActivityPhotoSerializer(many=True, read_only=True)
    location_verified = serializers.SerializerMethodField()
    location_name = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = FieldActivity
        fields = "__all__"
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True},
            "latitude": {"required": False},
            "longitude": {"required": False},
            "recorded_at": {"required": False},
        }

    def get_location_verified(self, obj):
        return location_inside_farm(obj.farm, obj.latitude, obj.longitude)

    def get_location_name(self, obj):
        if obj.latitude is None or obj.longitude is None:
            return None
        return reverse_geocode(float(obj.latitude), float(obj.longitude))

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None

    def validate_recorded_at(self, value):
        return _validate_not_future(value)
