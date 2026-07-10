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
        ASSIGNED = "ASSIGNED", "Assigned"
        CONFIRMED = "CONFIRMED", "Confirmed"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        ON_BREAK = "ON_BREAK", "On Break"
        WAITING_APPROVAL = "WAITING_APPROVAL", "Waiting Approval"
        COMPLETED = "COMPLETED", "Completed"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        RETURNED = "RETURNED", "Returned"
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
        max_length=20, choices=Status.choices, default=Status.TODO
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

    # Work Lifecycle Fields (per requirements)
    before_work_time = models.DateTimeField(null=True, blank=True)
    completed_time = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.title

    @property
    def is_overdue(self):
        from django.utils import timezone

        if not self.due_date:
            return False
        if self.status in (
            self.Status.COMPLETED,
            self.Status.APPROVED,
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


class TaskExecution(OwnedModel):
    """Tracks the execution workflow of a task by an employee."""

    class Status(models.TextChoices):
        ASSIGNED = "ASSIGNED", "Assigned"
        CONFIRMED = "CONFIRMED", "Confirmed"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        ON_BREAK = "ON_BREAK", "On Break"
        WAITING_APPROVAL = "WAITING_APPROVAL", "Waiting Approval"
        COMPLETED = "COMPLETED", "Completed"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        RETURNED = "RETURNED", "Returned"

    task = models.ForeignKey(
        Task, on_delete=models.CASCADE, related_name="executions"
    )
    employee = models.ForeignKey(
        "workforce.Employee",
        on_delete=models.CASCADE,
        related_name="task_executions",
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ASSIGNED
    )

    # Timestamps for workflow
    confirmed_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    returned_at = models.DateTimeField(null=True, blank=True)

    # Timer tracking (in seconds)
    working_seconds = models.IntegerField(default=0)
    break_seconds = models.IntegerField(default=0)

    # Current timer state
    current_timer_started_at = models.DateTimeField(null=True, blank=True)
    current_break_started_at = models.DateTimeField(null=True, blank=True)

    # Progress
    progress_percentage = models.IntegerField(default=0)

    # GPS tracking
    gps_start_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    gps_start_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    gps_break_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    gps_break_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    gps_complete_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    gps_complete_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )

    # Before Work details (new fields for work lifecycle)
    before_work_photo = models.ImageField(upload_to="tasks/before_work/", null=True, blank=True)
    before_work_latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    before_work_longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    before_work_address = models.TextField(blank=True)
    before_work_time = models.DateTimeField(null=True, blank=True)

    # Break details
    break_start_photo = models.ImageField(upload_to="tasks/break_start/", null=True, blank=True)
    break_start_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    break_start_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    break_start_reason = models.TextField(blank=True)
    break_start_time = models.DateTimeField(null=True, blank=True)

    break_end_photo = models.ImageField(upload_to="tasks/break_end/", null=True, blank=True)
    break_end_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    break_end_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    break_end_time = models.DateTimeField(null=True, blank=True)

    # Total timer tracking (in seconds)
    total_break_seconds = models.IntegerField(default=0)
    total_work_seconds = models.IntegerField(default=0)
    current_timer_seconds = models.IntegerField(default=0)

    # Completion details
    completion_photo = models.ImageField(upload_to="tasks/completion/", null=True, blank=True)
    completion_notes = models.TextField(blank=True)
    completion_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    completion_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    completion_time = models.DateTimeField(null=True, blank=True)

    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_task_executions",
    )

    class Meta:
        unique_together = ("task", "employee")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.task.title} - {self.employee.name} ({self.status})"

    @property
    def is_completed(self):
        return self.status in [self.Status.COMPLETED, self.Status.APPROVED, self.Status.REJECTED]

    @property
    def is_approved(self):
        return self.status == self.Status.APPROVED

    def calculate_current_duration(self):
        """Calculate current working duration in seconds (excluding breaks)."""
        if not self.started_at:
            return 0

        now = timezone.now()
        total_seconds = (now - self.started_at).total_seconds()

        # Subtract break time
        break_logs = self.break_logs.all()
        for log in break_logs:
            if log.break_ended_at:
                duration = (log.break_ended_at - log.break_started_at).total_seconds()
                total_seconds -= duration
            elif self.status == self.Status.ON_BREAK:
                # Currently on break
                duration = (now - log.break_started_at).total_seconds()
                total_seconds -= duration

        return max(0, int(total_seconds))


class TaskBreakLog(OwnedModel):
    """Logs each break taken during task execution."""

    task_execution = models.ForeignKey(
        TaskExecution,
        on_delete=models.CASCADE,
        related_name="break_logs",
    )
    break_started_at = models.DateTimeField()
    break_ended_at = models.DateTimeField(null=True, blank=True)
    break_duration_seconds = models.IntegerField(default=0)

    gps_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    gps_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )

    def __str__(self):
        return f"Break on {self.task_execution.task.title} at {self.break_started_at}"

    def save(self, *args, **kwargs):
        if self.break_ended_at and self.break_started_at:
            delta = self.break_ended_at - self.break_started_at
            self.break_duration_seconds = int(delta.total_seconds())
        super().save(*args, **kwargs)


class TaskActivity(OwnedModel):
    """Tracks individual activity entries in the task work lifecycle.

    This model stores detailed records of each work action:
    - BEFORE_WORK: Employee starts work on a task
    - BREAK_START: Employee goes on break
    - BREAK_END: Employee resumes work after break
    - DURING_WORK: Employee provides progress update
    - COMPLETED: Employee completes the task
    """

    class ActionType(models.TextChoices):
        BEFORE_WORK = "BEFORE_WORK", "Before Work"
        BREAK_START = "BREAK_START", "Break Start"
        BREAK_END = "BREAK_END", "Break End"
        DURING_WORK = "DURING_WORK", "During Work"
        COMPLETED = "COMPLETED", "Completed"

    task = models.ForeignKey(
        Task, on_delete=models.CASCADE, related_name="activities"
    )
    task_execution = models.ForeignKey(
        TaskExecution,
        on_delete=models.CASCADE,
        related_name="activities",
        null=True,
        blank=True,
    )
    employee = models.ForeignKey(
        "workforce.Employee",
        on_delete=models.CASCADE,
        related_name="task_activities",
    )
    action_type = models.CharField(
        max_length=20, choices=ActionType.choices
    )
    photo = models.ImageField(upload_to="tasks/activities/", null=True, blank=True)
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    address = models.TextField(blank=True, help_text="Auto-detected address from GPS")
    notes = models.TextField(blank=True, help_text="Optional notes for DURING_WORK and COMPLETED")
    reason = models.TextField(blank=True, help_text="Reason for break (BREAK_START)")
    timestamp = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-timestamp"]
        verbose_name = "Task Activity"
        verbose_name_plural = "Task Activities"

    def __str__(self):
        return f"{self.action_type} on {self.task.title} at {self.timestamp}"


class TaskProgressLog(OwnedModel):
    """Logs progress updates during task execution (During Work button)."""

    task_execution = models.ForeignKey(
        TaskExecution,
        on_delete=models.CASCADE,
        related_name="progress_logs",
    )
    progress_percentage = models.IntegerField(default=0)
    remarks = models.TextField(blank=True)
    photo = models.ImageField(upload_to="tasks/progress/", null=True, blank=True)

    gps_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    gps_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )

    def __str__(self):
        return f"Progress {self.progress_percentage}% on {self.task_execution.task.title}"
