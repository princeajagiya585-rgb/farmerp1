from datetime import timedelta

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.utils import build_absolute_photo_url

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
    # NOTE: 'photo' is intentionally NOT declared as a SerializerMethodField.
    # We let DRF auto-generate it as an ImageField from the model so it can
    # accept file uploads (multipart → request.FILES). The to_representation
    # override below converts the relative URL to an absolute URL on output.

    class Meta:
        model = LocationPing
        fields = "__all__"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get('photo'):
            data['photo'] = build_absolute_photo_url(instance.photo, self.context.get('request'))
        return data

    @extend_schema_field(serializers.BooleanField(allow_null=True))
    def get_location_verified(self, obj):
        if not obj.farm_id:
            return None
        return location_inside_farm(obj.farm, obj.latitude, obj.longitude)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_location_name(self, obj):
        if obj.latitude is None or obj.longitude is None:
            return None
        return reverse_geocode(float(obj.latitude), float(obj.longitude))

    def validate_recorded_at(self, value):
        return _validate_not_future(value)


class ActivityPhotoSerializer(serializers.ModelSerializer):
    phase_display = serializers.CharField(source="get_phase_display", read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = ActivityPhoto
        fields = "__all__"

    def get_photo_url(self, obj):
        return build_absolute_photo_url(obj.photo, self.context.get('request'))

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

    @extend_schema_field(serializers.BooleanField(allow_null=True))
    def get_location_verified(self, obj):
        return location_inside_farm(obj.farm, obj.latitude, obj.longitude)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_location_name(self, obj):
        if obj.latitude is None or obj.longitude is None:
            return None
        return reverse_geocode(float(obj.latitude), float(obj.longitude))

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_photo_url(self, obj):
        return build_absolute_photo_url(obj.photo, self.context.get('request'))

    def validate_recorded_at(self, value):
        return _validate_not_future(value)
