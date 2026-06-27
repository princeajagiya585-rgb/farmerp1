from django.contrib import admin

from .models import Employee, Shift, WorkforceAllocation, Attendance, Department, Skill, EmploymentHistory, PerformanceReview, Availability


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = (
        "employee_code",
        "first_name",
        "last_name",
        "category",
        "employment_type",
        "farm",
        "phone",
    )
    list_filter = ("category", "employment_type", "farm")
    search_fields = ("employee_code", "first_name", "last_name", "phone")


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ("name", "farm", "start_time", "end_time")
    list_filter = ("farm",)
    search_fields = ("name",)


@admin.register(WorkforceAllocation)
class WorkforceAllocationAdmin(admin.ModelAdmin):
    list_display = ("employee", "farm", "field", "shift", "date")
    list_filter = ("farm", "date")
    search_fields = ("employee__first_name", "employee__last_name", "work_description")


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = (
        "employee",
        "farm",
        "date",
        "status",
        "approval_status",
        "overtime_hours",
    )
    list_filter = ("status", "approval_status", "farm", "date")
    search_fields = ("employee__first_name", "employee__last_name", "remarks")


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "description")
    search_fields = ("name", "code")


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ("name", "category")
    list_filter = ("category",)
    search_fields = ("name", "category")


@admin.register(EmploymentHistory)
class EmploymentHistoryAdmin(admin.ModelAdmin):
    list_display = ("employee", "event_type", "designation", "department", "effective_date")
    list_filter = ("event_type", "department", "effective_date")
    search_fields = ("employee__first_name", "employee__last_name", "designation", "notes")


@admin.register(PerformanceReview)
class PerformanceReviewAdmin(admin.ModelAdmin):
    list_display = ("employee", "review_date", "rating", "reviewer")
    list_filter = ("rating", "review_date")
    search_fields = ("employee__first_name", "employee__last_name", "strengths", "improvements", "remarks")


@admin.register(Availability)
class AvailabilityAdmin(admin.ModelAdmin):
    list_display = ("employee", "start_date", "end_date", "status")
    list_filter = ("status", "start_date", "end_date")
    search_fields = ("employee__first_name", "employee__last_name", "reason")
