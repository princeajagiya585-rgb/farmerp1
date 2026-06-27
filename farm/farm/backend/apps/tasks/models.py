from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import OwnedModel


class Task(OwnedModel):
    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        URGENT = "URGENT", "Urgent"

    class Status(models.TextChoices):
        TODO = "TODO", "To Do"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        SUBMITTED = "SUBMITTED", "Submitted"
        VERIFIED = "VERIFIED", "Verified"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class ScheduleType(models.TextChoices):
        DAILY = "DAILY", "Daily"
        WEEKLY = "WEEKLY", "Weekly"
        MONTHLY = "MONTHLY", "Monthly"
        ANNUAL = "ANNUAL", "Annual"
        ADHOC = "ADHOC", "Ad-hoc"

    class Recurrence(models.TextChoices):
        NONE = "NONE", "None"
        DAILY = "DAILY", "Daily"
        WEEKLY = "WEEKLY", "Weekly"
        MONTHLY = "MONTHLY", "Monthly"
        ANNUAL = "ANNUAL", "Annual"

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="tasks"
    )
    field = models.ForeignKey(
        "farms.Field",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_tasks",
    )
    assigned_employee = models.ForeignKey(
        "workforce.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    priority = models.CharField(
        max_length=10, choices=Priority.choices, default=Priority.MEDIUM
    )
    status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.TODO
    )
    schedule_type = models.CharField(
        max_length=10, choices=ScheduleType.choices, default=ScheduleType.ADHOC
    )
    recurrence = models.CharField(
        max_length=10, choices=Recurrence.choices, default=Recurrence.NONE
    )
    category = models.CharField(max_length=100, blank=True)
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    progress = models.IntegerField(default=0, help_text="percent 0-100")
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_tasks",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    parent_task = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="occurrences",
        help_text="Root task of a recurring series",
    )

    def __str__(self):
        return self.title

    @property
    def is_overdue(self):
        from django.utils import timezone

        if not self.due_date:
            return False
        if self.status in (
            self.Status.COMPLETED,
            self.Status.VERIFIED,
            self.Status.CANCELLED,
        ):
            return False
        return self.due_date < timezone.now().date()


class TaskUpdate(OwnedModel):
    task = models.ForeignKey(
        Task, on_delete=models.CASCADE, related_name="updates"
    )
    note = models.TextField(blank=True)
    progress = models.IntegerField(default=0)
    photo = models.ImageField(upload_to="tasks/", null=True, blank=True)
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )

    def __str__(self):
        return f"Update on {self.task_id} ({self.progress}%)"


class TaskWorkSession(OwnedModel):
    """Tracks a work session on a task with start and end timers."""

    task = models.ForeignKey(
        Task, on_delete=models.CASCADE, related_name="work_sessions"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="task_work_sessions",
    )
    start_time = models.DateTimeField(default=timezone.now)
    end_time = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True)

    class Meta:
        ordering = ["-start_time"]
        verbose_name = "Task Work Session"
        verbose_name_plural = "Task Work Sessions"

    def __str__(self):
        end = self.end_time or "in progress"
        return f"{self.user} on {self.task.title} ({self.start_time} → {end})"

    @property
    def duration_minutes(self):
        """Return duration in minutes (float)."""
        end = self.end_time or timezone.now()
        delta = end - self.start_time
        return delta.total_seconds() / 60

    @property
    def is_active(self):
        return self.end_time is None
