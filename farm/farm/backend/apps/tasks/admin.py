from django.contrib import admin

from .models import Task, TaskUpdate, TaskWorkSession, TaskExecution, TaskBreakLog, TaskProgressLog, TaskActivity


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "farm",
        "status",
        "priority",
        "assigned_to",
        "progress",
        "due_date",
    )
    list_filter = ("status", "priority", "schedule_type", "farm")
    search_fields = ("title", "description", "category")


@admin.register(TaskUpdate)
class TaskUpdateAdmin(admin.ModelAdmin):
    list_display = ("task", "progress", "created_by", "created_at")
    list_filter = ("task",)
    search_fields = ("note",)


@admin.register(TaskWorkSession)
class TaskWorkSessionAdmin(admin.ModelAdmin):
    list_display = ("task", "user", "start_time", "end_time", "duration_minutes", "is_active")
    list_filter = ("task", "user", "start_time")
    search_fields = ("task__title", "user__username", "note")


@admin.register(TaskExecution)
class TaskExecutionAdmin(admin.ModelAdmin):
    list_display = ("task", "employee", "status", "started_at", "completed_at")
    list_filter = ("status", "task", "employee")
    search_fields = ("task__title", "employee__name")


@admin.register(TaskBreakLog)
class TaskBreakLogAdmin(admin.ModelAdmin):
    list_display = ("task_execution", "break_started_at", "break_ended_at", "break_duration_seconds")
    list_filter = ("task_execution",)
    search_fields = ("task_execution__task__title",)


@admin.register(TaskProgressLog)
class TaskProgressLogAdmin(admin.ModelAdmin):
    list_display = ("task_execution", "progress_percentage", "created_at")
    list_filter = ("task_execution",)
    search_fields = ("task_execution__task__title", "remarks")


@admin.register(TaskActivity)
class TaskActivityAdmin(admin.ModelAdmin):
    list_display = ("task", "employee", "action_type", "timestamp")
    list_filter = ("action_type", "task", "employee")
    search_fields = ("task__title", "employee__name", "notes")
