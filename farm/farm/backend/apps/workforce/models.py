from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel, OwnedModel


class Employee(TimeStampedModel):
    class Category(models.TextChoices):
        EMPLOYEE = "EMPLOYEE", "Employee"
        LABOUR = "LABOUR", "Labour"

    class EmploymentType(models.TextChoices):
        PERMANENT = "PERMANENT", "Permanent"
        CONTRACT = "CONTRACT", "Contract"
        DAILY_WAGE = "DAILY_WAGE", "Daily Wage"
        SEASONAL = "SEASONAL", "Seasonal"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_profile",
    )
    employee_code = models.CharField(max_length=50, unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.LABOUR
    )
    employment_type = models.CharField(
        max_length=20, choices=EmploymentType.choices, default=EmploymentType.DAILY_WAGE
    )
    designation = models.CharField(max_length=100, blank=True)
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="employees"
    )
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    photo = models.ImageField(upload_to="employees/", null=True, blank=True)
    is_active = models.BooleanField(default=True, help_text="Whether the employee is currently active/employed")
    date_of_joining = models.DateField(null=True, blank=True)
    daily_wage = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bank_account = models.CharField(max_length=50, blank=True)
    bank_ifsc = models.CharField(max_length=20, blank=True)
    department = models.ForeignKey(
        "Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
    )
    skills = models.ManyToManyField("Skill", blank=True, related_name="employees")

    class Meta:
        ordering = ["first_name", "last_name"]

    def __str__(self):
        return f"{self.name} ({self.employee_code})"

    @property
    def name(self):
        return f"{self.first_name} {self.last_name}"


class Shift(TimeStampedModel):
    name = models.CharField(max_length=100)
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="shifts"
    )
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.start_time} - {self.end_time})"


class WorkforceAllocation(OwnedModel):
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="allocations"
    )
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="allocations"
    )
    field = models.ForeignKey(
        "farms.Field",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="allocations",
    )
    shift = models.ForeignKey(
        Shift,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="allocations",
    )
    date = models.DateField()
    work_description = models.TextField(blank=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employee.name} - {self.date}"


class Attendance(OwnedModel):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        ABSENT = "ABSENT", "Absent"
        HALF_DAY = "HALF_DAY", "Half Day"
        LEAVE = "LEAVE", "Leave"

    class ApprovalStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="attendances"
    )
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="attendances"
    )
    date = models.DateField()
    check_in_time = models.DateTimeField(null=True, blank=True)
    check_out_time = models.DateTimeField(null=True, blank=True)
    check_in_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    check_in_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    check_out_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    check_out_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    check_in_photo = models.ImageField(upload_to="attendance/", null=True, blank=True)
    check_out_photo = models.ImageField(upload_to="attendance/", null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PRESENT
    )
    approval_status = models.CharField(
        max_length=20, choices=ApprovalStatus.choices, default=ApprovalStatus.PENDING
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_attendances",
    )
    overtime_hours = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remarks = models.TextField(blank=True)

    class Meta:
        ordering = ["-date"]
        unique_together = ("employee", "date")

    def __str__(self):
        return f"{self.employee.name} - {self.date} ({self.status})"


class Department(TimeStampedModel):
    """An organizational department workers can be allocated to."""

    name = models.CharField(max_length=120)
    code = models.CharField(max_length=30, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Skill(TimeStampedModel):
    """A skill, grouped by a category, that workers can be tagged with."""

    name = models.CharField(max_length=120)
    category = models.CharField(
        max_length=120, blank=True, help_text="e.g. Machinery, Irrigation, Harvesting"
    )

    class Meta:
        ordering = ["category", "name"]

    def __str__(self):
        return f"{self.name} ({self.category})" if self.category else self.name


class EmploymentHistory(OwnedModel):
    """Timeline of employment events for an employee."""

    class Event(models.TextChoices):
        JOINED = "JOINED", "Joined"
        PROMOTED = "PROMOTED", "Promoted"
        TRANSFERRED = "TRANSFERRED", "Transferred"
        DESIGNATION_CHANGE = "DESIGNATION_CHANGE", "Designation Change"
        TERMINATED = "TERMINATED", "Terminated"
        OTHER = "OTHER", "Other"

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="employment_history"
    )
    event_type = models.CharField(
        max_length=25, choices=Event.choices, default=Event.JOINED
    )
    designation = models.CharField(max_length=120, blank=True)
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employment_events",
    )
    effective_date = models.DateField()
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-effective_date"]

    def __str__(self):
        return f"{self.employee.name} - {self.event_type} ({self.effective_date})"


class PerformanceReview(OwnedModel):
    """A periodic performance review / rating for an employee."""

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="performance_reviews"
    )
    review_date = models.DateField()
    period = models.CharField(max_length=60, blank=True, help_text="e.g. Q1 2026")
    rating = models.IntegerField(
        default=3, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="performance_reviews_given",
    )
    strengths = models.TextField(blank=True)
    improvements = models.TextField(blank=True)
    remarks = models.TextField(blank=True)

    class Meta:
        ordering = ["-review_date"]

    def __str__(self):
        return f"{self.employee.name} - {self.rating}/5 ({self.review_date})"


class Availability(OwnedModel):
    """Worker availability / leave window for availability management."""

    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        ON_LEAVE = "ON_LEAVE", "On Leave"
        ASSIGNED = "ASSIGNED", "Assigned Elsewhere"
        UNAVAILABLE = "UNAVAILABLE", "Unavailable"

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="availabilities"
    )
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.AVAILABLE
    )
    reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-start_date"]
        verbose_name_plural = "Availabilities"

    def __str__(self):
        return f"{self.employee.name} - {self.status} ({self.start_date})"
