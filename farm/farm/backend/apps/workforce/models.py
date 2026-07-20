from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel, OwnedModel


class Employee(TimeStampedModel):
    class Category(models.TextChoices):
        EMPLOYEE = "EMPLOYEE", "Employee"
        LABOUR = "LABOUR", "Labour"
        MANAGER = "MANAGER", "Manager"
        SUPERVISOR = "SUPERVISOR", "Supervisor"
        DRIVER = "DRIVER", "Driver"
        SECURITY = "SECURITY", "Security"
        OFFICE_STAFF = "OFFICE_STAFF", "Office Staff"
        ACCOUNTANT = "ACCOUNTANT", "Accountant"
        TECHNICIAN = "TECHNICIAN", "Technician"
        SUPER_ADMIN = "SUPER_ADMIN", "Super Administrator"

    class EmploymentType(models.TextChoices):
        PERMANENT = "PERMANENT", "Permanent"
        CONTRACT = "CONTRACT", "Contract"
        DAILY_WAGE = "DAILY_WAGE", "Daily Wage"
        SEASONAL = "SEASONAL", "Seasonal"

    class WageType(models.TextChoices):
        # How this employee's pay is calculated on the payslip:
        #   MONTHLY → monthly_salary, prorated per attended day
        #   HOURLY  → hourly_wage × hours actually worked
        MONTHLY = "MONTHLY", "Monthly Salary"
        HOURLY = "HOURLY", "Hourly Wage"

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
    wage_type = models.CharField(
        max_length=20, choices=WageType.choices, default=WageType.MONTHLY,
        help_text="Whether pay is calculated per month (attendance-prorated) or per hour worked",
    )
    daily_wage = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    hourly_wage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text="Rate per hour worked, used when wage_type is HOURLY",
    )
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
        # Same role markers as User.get_full_name ((M) manager, (A) admin) —
        # category stays in sync with the linked user's role via
        # workforce/signals.py, so this needs no extra query on list endpoints.
        base = f"{self.first_name} {self.last_name}"
        marker = {
            self.Category.MANAGER: "M",
            self.Category.SUPER_ADMIN: "A",
        }.get(self.category)
        if marker:
            return f"{base} ({marker})"
        return base


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
        PRESENT_DONE = "PRESENT_DONE", "Present Done"

    class ApprovalStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        FAILED = "FAILED", "Failed"

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
        max_length=20, choices=Status.choices, default=None, null=True, blank=True
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
    check_in_distance = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Distance from farm center in metres at check-in"
    )
    geofence_status = models.BooleanField(
        null=True, blank=True,
        help_text="True if GPS is inside farm geofence, False if outside, null if no GPS"
    )
    overtime_hours = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remarks = models.TextField(blank=True)
    check_in_notes = models.TextField(blank=True)
    check_out_notes = models.TextField(blank=True)
    # Address fields for GPS location
    check_in_address = models.TextField(blank=True, help_text="Auto-detected address from check-in GPS")
    check_out_address = models.TextField(blank=True, help_text="Auto-detected address from check-out GPS")
    # Working hours calculation (in seconds)
    working_seconds = models.IntegerField(default=0, help_text="Total working seconds for this attendance")
    overtime_seconds = models.IntegerField(default=0, help_text="Overtime seconds beyond regular working hours")
    # Check-out geofence status (can be different from check-in)
    check_out_geofence_status = models.BooleanField(
        null=True, blank=True,
        help_text="True if GPS is inside farm geofence at check-out, False if outside, null if no GPS"
    )
    # Distance from farm center at check-out
    check_out_distance = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Distance from farm center in metres at check-out"
    )

    class Meta:
        ordering = ["-date"]
        unique_together = ("employee", "date")

    def __str__(self):
        return f"{self.employee.name} - {self.date} ({self.status})"

    def calculate_working_hours(self):
        """Calculate working hours in seconds between check-in and check-out."""
        if not self.check_in_time or not self.check_out_time:
            return 0
        delta = self.check_out_time - self.check_in_time
        return int(delta.total_seconds())

    def calculate_overtime(self, regular_hours=8):
        """Calculate overtime seconds beyond regular working hours (default 8 hours)."""
        working = self.calculate_working_hours()
        regular_seconds = regular_hours * 3600
        if working > regular_seconds:
            return working - regular_seconds
        return 0

    # Monthly-wage employees working under 5 hours count as a half day.
    FULL_DAY_MIN_SECONDS = 5 * 3600

    def refresh_time_derived_fields(self, regular_hours=8):
        """Recompute work hours, overtime, status and approval from the
        check-in / check-out times, mirroring the check_out action's rules.
        Called when an admin edits the times so the derived columns stay
        consistent with the new times. Does not save."""
        self.working_seconds = self.calculate_working_hours()
        self.overtime_seconds = self.calculate_overtime(regular_hours)
        self.overtime_hours = round(self.overtime_seconds / 3600, 2)
        if not self.check_in_time:
            return
        if self.check_out_time:
            if self.geofence_status is False:
                self.status = Attendance.Status.ABSENT
            else:
                is_monthly = getattr(
                    self.employee, "wage_type", Employee.WageType.MONTHLY
                ) == Employee.WageType.MONTHLY
                self.status = (
                    Attendance.Status.HALF_DAY
                    if is_monthly and self.working_seconds < self.FULL_DAY_MIN_SECONDS
                    else Attendance.Status.PRESENT_DONE
                )
                self.approval_status = Attendance.ApprovalStatus.APPROVED
        else:
            # Check-in only (check-out cleared or not yet done) → back to an
            # in-progress present day awaiting approval.
            self.status = (
                Attendance.Status.ABSENT
                if self.geofence_status is False
                else Attendance.Status.PRESENT
            )
            self.approval_status = Attendance.ApprovalStatus.PENDING


class AttendanceMonthlySummary(OwnedModel):
    """Manually overridden monthly attendance totals for one employee.

    The attendance `report` normally *computes* Present / Half-Day / Absent /
    Leave / OT hours from the daily Attendance records. When an admin edits
    those totals on the Attendance Reports page, the edited values are stored
    here and take precedence over the computed ones for that
    (employee, year, month) period. `month` is null for the whole-year /
    all-months view.
    """

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="monthly_summaries"
    )
    year = models.IntegerField()
    month = models.IntegerField(
        null=True, blank=True, help_text="1-12, or null for a whole-year / all-months view"
    )
    present = models.IntegerField(default=0)
    half_day = models.IntegerField(default=0)
    absent = models.IntegerField(default=0)
    leave = models.IntegerField(default=0)
    overtime_hours = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["-year", "-month"]
        unique_together = ("employee", "year", "month")
        verbose_name_plural = "Attendance monthly summaries"

    def __str__(self):
        return f"{self.employee.name} {self.year}-{self.month or 'ALL'} override"


class Department(TimeStampedModel):
    """An organizational department workers can be allocated to."""

    # Departments had no owner of any kind — no farm, no created_by — so the
    # table was global and every tenant saw and could edit every other tenant's
    # departments. Nullable because rows that predate this cannot always be
    # attributed; migration 0026 backfills from the employees in each one.
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, null=True, blank=True,
        related_name="departments",
    )
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=30, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Skill(TimeStampedModel):
    """A skill, grouped by a category, that workers can be tagged with."""

    # Same story as Department above: no owner column at all, so the table was
    # shared across tenants. Backfilled from the employees tagged with it.
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, null=True, blank=True,
        related_name="skills",
    )
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
