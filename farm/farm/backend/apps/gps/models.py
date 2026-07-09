from django.conf import settings
from django.db import models

from apps.core.models import OwnedModel, TimeStampedModel


class Geofence(TimeStampedModel):
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="geofences"
    )
    name = models.CharField(max_length=255)
    polygon = models.JSONField(default=list, help_text="list of [lat,lng]")
    center_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    center_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    radius_m = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.name} ({self.farm_id})"


class LocationPing(OwnedModel):
    class Activity(models.TextChoices):
        CHECKIN = "CHECKIN", "Check-in"
        CHECKOUT = "CHECKOUT", "Check-out"
        DURING_WORK = "DURING_WORK", "During Work"
        BREAK = "BREAK", "Break"
        RESUME = "RESUME", "Resume"
        TASK = "TASK", "Task"
        PATROL = "PATROL", "Patrol"
        TRACK = "TRACK", "Track"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="location_pings",
    )
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.SET_NULL, null=True, blank=True
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    accuracy = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    activity = models.CharField(
        max_length=15, choices=Activity.choices, default=Activity.TRACK
    )
    task = models.ForeignKey(
        "tasks.Task",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="location_pings",
    )
    photo = models.ImageField(upload_to="location_pings/", null=True, blank=True)
    notes = models.TextField(blank=True, help_text="Optional notes submitted with this work proof ping")
    recorded_at = models.DateTimeField()

    def __str__(self):
        return f"{self.user_id} @ {self.recorded_at}"


class FieldActivity(OwnedModel):
    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="field_activities",
    )
    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE)
    field = models.ForeignKey(
        "farms.Field",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="field_activities",
    )
    task = models.ForeignKey(
        "tasks.Task",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="field_activities",
    )
    description = models.TextField(blank=True)
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    photo = models.ImageField(upload_to="field_activity/", null=True, blank=True)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.SUBMITTED
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_activities",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    recorded_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"FieldActivity {self.id} ({self.status})"


class ActivityPhoto(TimeStampedModel):
    """A geo-tagged, timestamped photo at a phase of a field activity."""

    class Phase(models.TextChoices):
        BEFORE = "BEFORE", "Before Work"
        DURING = "DURING", "During Work"
        COMPLETION = "COMPLETION", "Completion"

    activity = models.ForeignKey(
        FieldActivity, on_delete=models.CASCADE, related_name="photos"
    )
    phase = models.CharField(
        max_length=12, choices=Phase.choices, default=Phase.DURING
    )
    photo = models.ImageField(upload_to="field_activity/")
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    recorded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["phase", "created_at"]

    def __str__(self):
        return f"{self.phase} photo for {self.activity_id}"
