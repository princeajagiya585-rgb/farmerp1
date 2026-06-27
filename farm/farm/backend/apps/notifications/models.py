from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class Notification(TimeStampedModel):
    class NotificationType(models.TextChoices):
        INFO = "INFO", "Info"
        ALERT = "ALERT", "Alert"
        TASK = "TASK", "Task"
        PAYROLL = "PAYROLL", "Payroll"
        INVENTORY = "INVENTORY", "Inventory"
        APPROVAL = "APPROVAL", "Approval"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    notification_type = models.CharField(
        max_length=20,
        choices=NotificationType.choices,
        default=NotificationType.INFO,
    )
    is_read = models.BooleanField(default=False)
    data = models.JSONField(default=dict, blank=True)
    link = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return self.title
