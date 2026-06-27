from django.conf import settings
from django.db import models

from apps.core.models import OwnedModel


class BreakdownReport(OwnedModel):
    """A field worker's report that a machine has broken down / crashed on a farm.

    Created from the mobile worker app with a photo and written details, it
    alerts the farm's manager/supervisor and all super admins (see
    apps.notifications.signals).
    """

    class Severity(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"

    class Status(models.TextChoices):
        REPORTED = "REPORTED", "Reported"
        ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        RESOLVED = "RESOLVED", "Resolved"

    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="breakdown_reports"
    )
    machine_name = models.CharField(max_length=150)
    severity = models.CharField(
        max_length=20, choices=Severity.choices, default=Severity.HIGH
    )
    details = models.TextField()
    photo = models.ImageField(upload_to="breakdowns/", null=True, blank=True)
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.REPORTED
    )
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="acknowledged_breakdowns",
    )
    resolution_notes = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.machine_name} @ {self.farm} ({self.severity})"
