from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.utils import build_absolute_photo_url

from .models import Task, TaskUpdate, TaskWorkSession, TaskExecution, TaskBreakLog, TaskProgressLog, TaskActivity


class TaskActivitySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    task_title = serializers.CharField(source="task.title", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = TaskActivity
        fields = "__all__"

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_photo_url(self, obj):
        return build_absolute_photo_url(obj.photo, self.context.get('request'))


class TaskBreakLogSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = TaskBreakLog
        fields = "__all__"


class TaskProgressLogSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = TaskProgressLog
        fields = "__all__"

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_photo_url(self, obj):
        return build_absolute_photo_url(obj.photo, self.context.get('request'))


class TaskExecutionSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    task_title = serializers.CharField(source="task.title", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.get_full_name", read_only=True, default=None)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    # Photo URLs for new fields
    before_work_photo_url = serializers.SerializerMethodField()
    break_start_photo_url = serializers.SerializerMethodField()
    break_end_photo_url = serializers.SerializerMethodField()
    completion_photo_url = serializers.SerializerMethodField()

    # Computed fields
    current_duration_seconds = serializers.SerializerMethodField()
    current_timer_display = serializers.SerializerMethodField()
    total_break_duration_seconds = serializers.SerializerMethodField()
    break_logs_data = serializers.SerializerMethodField()
    progress_logs_data = serializers.SerializerMethodField()
    activities_data = serializers.SerializerMethodField()
    timer_data = serializers.SerializerMethodField()

    class Meta:
        model = TaskExecution
        fields = "__all__"
        read_only_fields = [
            "id", "created_at", "updated_at", "task", "employee", "status",
            "confirmed_at", "started_at", "completed_at", "approved_at", "returned_at",
            "working_seconds", "break_seconds", "created_by", "approved_by"
        ]

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_before_work_photo_url(self, obj):
        return build_absolute_photo_url(obj.before_work_photo, self.context.get('request'))

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_break_start_photo_url(self, obj):
        return build_absolute_photo_url(obj.break_start_photo, self.context.get('request'))

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_break_end_photo_url(self, obj):
        return build_absolute_photo_url(obj.break_end_photo, self.context.get('request'))

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_completion_photo_url(self, obj):
        return build_absolute_photo_url(obj.completion_photo, self.context.get('request'))

    @extend_schema_field(serializers.IntegerField())
    def get_current_duration_seconds(self, obj):
        """Calculate current working duration in seconds."""
        return obj.calculate_current_duration()

    @extend_schema_field(serializers.CharField())
    def get_current_timer_display(self, obj):
        """Get formatted timer display (HH:MM:SS)."""
        seconds = obj.calculate_current_duration()
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"

    @extend_schema_field(serializers.IntegerField())
    def get_total_break_duration_seconds(self, obj):
        """Get total break duration in seconds."""
        total = 0
        for log in obj.break_logs.all():
            if log.break_ended_at:
                total += log.break_duration_seconds
            elif obj.status == obj.Status.ON_BREAK and log.break_started_at:
                # Currently on break
                from django.utils import timezone
                total += int((timezone.now() - log.break_started_at).total_seconds())
        return total

    @extend_schema_field(serializers.ListField())
    def get_break_logs_data(self, obj):
        return TaskBreakLogSerializer(obj.break_logs.all(), many=True).data

    @extend_schema_field(serializers.ListField())
    def get_progress_logs_data(self, obj):
        return TaskProgressLogSerializer(obj.progress_logs.all(), many=True).data

    @extend_schema_field(serializers.ListField())
    def get_activities_data(self, obj):
        """Get all task activities for this execution."""
        return TaskActivitySerializer(obj.activities.all(), many=True, context=self.context).data

    @extend_schema_field(serializers.DictField())
    def get_timer_data(self, obj):
        """Get comprehensive timer data for the frontend."""
        from django.utils import timezone

        now = timezone.now()

        # Calculate working time
        working_seconds = obj.calculate_current_duration()

        # Calculate break time
        break_seconds = obj.total_break_seconds
        if obj.status == obj.Status.ON_BREAK and obj.break_start_time:
            current_break = int((now - obj.break_start_time).total_seconds())
            break_seconds += current_break

        # Net working time (total - break)
        net_work_seconds = max(0, working_seconds - break_seconds)

        # Timer display
        hours = working_seconds // 3600
        minutes = (working_seconds % 3600) // 60
        secs = working_seconds % 60

        return {
            "working_seconds": working_seconds,
            "break_seconds": break_seconds,
            "net_work_seconds": net_work_seconds,
            "timer_display": f"{hours:02d}:{minutes:02d}:{secs:02d}",
            "is_running": obj.status == obj.Status.IN_PROGRESS,
            "is_on_break": obj.status == obj.Status.ON_BREAK,
            "is_completed": obj.status in [obj.Status.COMPLETED, obj.Status.APPROVED, obj.Status.WAITING_APPROVAL],
            "started_at": obj.started_at,
            "before_work_time": obj.before_work_time,
            "break_start_time": obj.break_start_time,
            "completed_time": obj.completed_at,
        }


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
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

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
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)
    update_count = serializers.IntegerField(
        source="updates.count", read_only=True
    )
    is_overdue = serializers.BooleanField(read_only=True)
    active_session = serializers.SerializerMethodField()
    total_tracked_minutes = serializers.SerializerMethodField()
    work_phase = serializers.SerializerMethodField()
    during_work_count = serializers.SerializerMethodField()
    location_pings = serializers.SerializerMethodField()

    # Execution data for workflow
    my_execution = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = "__all__"

    @extend_schema_field(TaskExecutionSerializer(allow_null=True))
    def get_my_execution(self, obj):
        """Get the current user's execution for this task."""
        user = self.context.get('request').user if self.context.get('request') else None
        if not user or not user.is_authenticated:
            return None

        # Try to find execution by assigned_employee.user
        execution = None
        if obj.assigned_employee and obj.assigned_employee.user_id == user.id:
            execution = obj.executions.filter(employee=obj.assigned_employee).first()

        if execution:
            return TaskExecutionSerializer(execution, context=self.context).data
        return None

    @extend_schema_field(serializers.CharField())
    def get_work_phase(self, obj):
        """Determine the current work phase based on TaskActivity model.

        BEFORE      → no activities yet; show the "Before Work" button.
        IN_PROGRESS → BEFORE_WORK exists and latest activity is not BREAK_START.
                      Show "During Work", "Break", "Complete Work" buttons.
        ON_BREAK    → latest activity is BREAK_START (no BREAK_END after it).
                      Show "Resume" and "Complete Work" buttons.
        COMPLETED   → latest activity is COMPLETED; task is done.
        """
        # First check TaskActivity model
        activities = list(obj.activities.values_list("action_type", "timestamp").order_by("-timestamp"))
        if activities:
            latest = activities[0][0]
            if latest == TaskActivity.ActionType.COMPLETED:
                return "COMPLETED"
            if latest == TaskActivity.ActionType.BREAK_START:
                return "ON_BREAK"
            if latest in (TaskActivity.ActionType.BEFORE_WORK, TaskActivity.ActionType.DURING_WORK, TaskActivity.ActionType.BREAK_END):
                return "IN_PROGRESS"
            return "BEFORE"

        # Fallback: compute from location_pings (legacy)
        pings = list(obj.location_pings.values_list("activity", "recorded_at"))
        if not pings:
            return "BEFORE"
        # Sort by recorded_at descending to get the latest activity
        pings.sort(key=lambda x: x[1] or "", reverse=True)
        latest = pings[0][0]

        if latest == "CHECKOUT":
            return "COMPLETED"
        if latest == "BREAK":
            return "ON_BREAK"
        if latest in ("CHECKIN", "DURING_WORK", "RESUME"):
            return "IN_PROGRESS"
        return "BEFORE"

    @extend_schema_field(serializers.IntegerField())
    def get_during_work_count(self, obj):
        return obj.location_pings.filter(activity="DURING_WORK").count()

    @extend_schema_field(serializers.ListField())
    def get_location_pings(self, obj):
        """Serialize location pings for the frontend to compute display state."""
        from apps.gps.serializers import LocationPingSerializer
        pings = obj.location_pings.all()
        return LocationPingSerializer(pings, many=True, context=self.context).data

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
