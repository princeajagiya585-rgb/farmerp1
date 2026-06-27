from django.contrib import admin

from .models import Task, TaskUpdate, TaskWorkSession


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
