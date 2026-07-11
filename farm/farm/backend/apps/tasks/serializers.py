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

        # working_seconds is already net of breaks (see calculate_current_duration).
        net_work_seconds = working_seconds

        # Timer display
        hours = working_seconds // 3600
        minutes = (working_seconds % 3600) // 60
        secs = working_seconds % 60

        # Anchor + raw components so the frontend can tick the timer live
        # (compute elapsed from start_time client-side) instead of showing a
        # value frozen at fetch time.
        anchor = obj.before_work_time or obj.started_at

        return {
            "working_seconds": working_seconds,
            "break_seconds": break_seconds,
            "net_work_seconds": net_work_seconds,
            "timer_display": f"{hours:02d}:{minutes:02d}:{secs:02d}",
            "is_running": obj.status == obj.Status.IN_PROGRESS,
            "is_on_break": obj.status == obj.Status.ON_BREAK,
            "is_completed": obj.status in [obj.Status.COMPLETED, obj.Status.APPROVED, obj.Status.WAITING_APPROVAL],
            # Live-timer inputs (ISO strings; break accumulator excludes the
            # in-progress break so the client can add it live).
            "start_time": anchor.isoformat() if anchor else None,
            "accumulated_break_seconds": obj.total_break_seconds or 0,
            "break_start_time": obj.break_start_time.isoformat() if obj.break_start_time else None,
            "final_work_seconds": working_seconds,
            "started_at": obj.started_at,
            "before_work_time": obj.before_work_time,
            "completed_time": obj.completion_time or obj.completed_at,
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
    update_count = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)
    active_session = serializers.SerializerMethodField()
    total_tracked_minutes = serializers.SerializerMethodField()
    work_phase = serializers.SerializerMethodField()
    work_timer = serializers.SerializerMethodField()
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

        # Resolve the caller's Employee profile once per request (cached on the
        # shared serializer context to avoid an N+1 across the task list).
        if 'user_employee' not in self.context:
            from apps.workforce.models import Employee
            self.context['user_employee'] = Employee.objects.filter(user=user).first()
        employee = self.context['user_employee']

        # Find the caller's execution by their own Employee profile — the Before
        # Work flow creates the execution keyed on that, regardless of whether
        # the task was assigned via assigned_to (user) or assigned_employee.
        execution = None
        if employee:
            execution = next(
                (e for e in obj.executions.all() if e.employee_id == employee.id),
                None,
            )
        # Fallback: task assigned directly to an employee that is this user.
        if not execution and obj.assigned_employee and obj.assigned_employee.user_id == user.id:
            execution = next(
                (e for e in obj.executions.all() if e.employee_id == obj.assigned_employee_id),
                None,
            )

        if execution:
            return TaskExecutionSerializer(execution, context=self.context).data
        return None

    @extend_schema_field(serializers.CharField())
    def get_work_phase(self, obj):
        """Current work phase that drives the action buttons.

        Derived from task.status, which every work action updates (even for
        callers without a TaskExecution), so the buttons stay consistent for
        ALL users:
        BEFORE      → not started → "Before Work" button.
        IN_PROGRESS → working → "During Work" / "Break" / "Complete Work".
        ON_BREAK    → paused → "Start Work" button.
        COMPLETED   → done/closed → "Work Done".
        """
        status = obj.status
        if status in (
            Task.Status.WAITING_APPROVAL, Task.Status.COMPLETED,
            Task.Status.APPROVED, Task.Status.CANCELLED,
        ):
            return "COMPLETED"
        if status == Task.Status.ON_BREAK:
            return "ON_BREAK"
        if status == Task.Status.IN_PROGRESS:
            return "IN_PROGRESS"
        return "BEFORE"

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_work_timer(self, obj):
        """Timer derived from TaskActivity records so it works for EVERY user,
        including those with no Employee profile / TaskExecution. Returns the
        anchors the frontend needs to tick the timer live (start_time,
        accumulated break seconds, current break start, and completion)."""
        from django.utils import timezone
        A = TaskActivity.ActionType
        acts = sorted(obj.activities.all(), key=lambda a: a.timestamp)
        start = None
        break_seconds = 0.0
        on_break_since = None
        completed_at = None
        for a in acts:
            ts = a.timestamp
            if a.action_type == A.BEFORE_WORK and start is None:
                start = ts
            elif a.action_type == A.BREAK_START:
                on_break_since = ts
            elif a.action_type == A.BREAK_END:
                if on_break_since:
                    break_seconds += (ts - on_break_since).total_seconds()
                    on_break_since = None
            elif a.action_type == A.COMPLETED:
                completed_at = ts
        if start is None:
            return None
        is_completed = completed_at is not None
        is_on_break = (on_break_since is not None) and not is_completed
        if is_completed:
            end = completed_at
        elif is_on_break:
            end = on_break_since  # freeze the timer at the moment the break began
        else:
            end = timezone.now()
        net = max(0, int((end - start).total_seconds() - break_seconds))
        return {
            "start_time": start.isoformat(),
            "accumulated_break_seconds": int(break_seconds),
            "break_start_time": on_break_since.isoformat() if is_on_break else None,
            "is_running": (not is_on_break and not is_completed),
            "is_on_break": is_on_break,
            "is_completed": is_completed,
            "completion_time": completed_at.isoformat() if completed_at else None,
            "final_work_seconds": net,
            "working_seconds": net,
            "net_work_seconds": net,
        }

    @extend_schema_field(serializers.IntegerField())
    def get_update_count(self, obj):
        # Uses the prefetched `updates` (len of the cached list) instead of
        # `updates.count`, which would run one COUNT query per row.
        return len(obj.updates.all())

    @extend_schema_field(serializers.IntegerField())
    def get_during_work_count(self, obj):
        # Use the prefetched location_pings (obj.location_pings.all()) and count
        # in Python. Calling .filter().count() here would ignore the prefetch
        # cache and fire one extra query per task row (N+1) across the list.
        return sum(1 for p in obj.location_pings.all() if p.activity == "DURING_WORK")

    @extend_schema_field(serializers.ListField())
    def get_location_pings(self, obj):
        """Serialize location pings for the frontend to compute display state."""
        from apps.gps.serializers import LocationPingSerializer
        pings = obj.location_pings.all()
        return LocationPingSerializer(pings, many=True, context=self.context).data

    @extend_schema_field(TaskWorkSessionSerializer(allow_null=True))
    def get_active_session(self, obj):
        # Read from the prefetched work_sessions instead of .filter().first(),
        # which would re-query per row (N+1) across the task list.
        session = next(
            (s for s in obj.work_sessions.all() if s.end_time is None), None
        )
        if session:
            return TaskWorkSessionSerializer(session).data
        return None

    @extend_schema_field(serializers.FloatField())
    def get_total_tracked_minutes(self, obj):
        # Iterate the prefetched work_sessions (no per-row query).
        total = 0
        for s in obj.work_sessions.all():
            if s.end_time is not None:
                total += (s.end_time - s.start_time).total_seconds() / 60
        return round(total, 1)


class TaskListSerializer(TaskSerializer):
    """Lighter serializer for the task LIST endpoint.

    Drops the per-task ``location_pings`` array: it can hold hundreds of GPS
    points per task, the list UI (web + mobile) never reads it, and serializing
    it for every row bloats the response and makes the Tasks page slow to load
    — especially on mobile data. The detail endpoint still returns the full
    TaskSerializer with location_pings.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop("location_pings", None)
