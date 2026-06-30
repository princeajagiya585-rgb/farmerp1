from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Task, TaskUpdate, TaskWorkSession


class TaskWorkSessionSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(
        source="user.get_full_name", read_only=True
    )
    username = serializers.CharField(source="user.username", read_only=True)
    duration_minutes = serializers.FloatField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = TaskWorkSession
        fields = [
            "id",
            "task",
            "user",
            "user_name",
            "username",
            "start_time",
            "end_time",
            "duration_minutes",
            "is_active",
            "note",
            "created_by",
            "created_at",
        ]
        # "user" is server-stamped on create (see TaskWorkSessionViewSet) so a
        # user cannot attribute tracked time to a coworker.
        read_only_fields = ["start_time", "user", "created_by", "created_at"]


class TaskUpdateSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source="task.title", read_only=True)

    class Meta:
        model = TaskUpdate
        fields = "__all__"


class TaskSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    field_name = serializers.CharField(source="field.name", read_only=True)
    assigned_to_name = serializers.CharField(
        source="assigned_to.get_full_name", read_only=True
    )
    assigned_employee_name = serializers.CharField(
        source="assigned_employee.name", read_only=True
    )
    verified_by_name = serializers.CharField(
        source="verified_by.get_full_name", read_only=True
    )
    update_count = serializers.IntegerField(
        source="updates.count", read_only=True
    )
    is_overdue = serializers.BooleanField(read_only=True)
    active_session = serializers.SerializerMethodField()
    total_tracked_minutes = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = "__all__"

    @extend_schema_field(TaskWorkSessionSerializer(allow_null=True))
    def get_active_session(self, obj):
        session = obj.work_sessions.filter(end_time__isnull=True).first()
        if session:
            return TaskWorkSessionSerializer(session).data
        return None

    @extend_schema_field(serializers.FloatField())
    def get_total_tracked_minutes(self, obj):
        sessions = obj.work_sessions.filter(end_time__isnull=False)
        total = 0
        for s in sessions:
            delta = s.end_time - s.start_time
            total += delta.total_seconds() / 60
        return round(total, 1)
