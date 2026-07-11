import calendar
from datetime import date, timedelta
import uuid

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from rest_framework.generics import GenericAPIView

from apps.accounts.models import Role
from apps.core.mixins import BaseModelViewSet
from apps.farms.views import FarmScopedQuerysetMixin

from .models import Task, TaskUpdate, TaskWorkSession, TaskExecution, TaskBreakLog, TaskProgressLog, TaskActivity
from .serializers import (
    TaskSerializer, TaskUpdateSerializer, TaskWorkSessionSerializer,
    TaskExecutionSerializer, TaskBreakLogSerializer, TaskProgressLogSerializer,
    TaskActivitySerializer
)


def _add_period(d, recurrence):
    """Return the date one recurrence-step after `d`."""
    if d is None:
        return None
    if recurrence == Task.Recurrence.DAILY:
        return d + timedelta(days=1)
    if recurrence == Task.Recurrence.WEEKLY:
        return d + timedelta(days=7)
    if recurrence == Task.Recurrence.MONTHLY:
        m = d.month - 1 + 1
        y = d.year + m // 12
        m = m % 12 + 1
        return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))
    if recurrence == Task.Recurrence.ANNUAL:
        try:
            return d.replace(year=d.year + 1)
        except ValueError:  # Feb 29 -> Feb 28
            return d.replace(year=d.year + 1, day=28)
    return None


class TaskViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Task.objects.select_related(
        "farm", "field", "assigned_to", "assigned_employee", "verified_by"
    ).prefetch_related(
        "location_pings",
        "work_sessions",
        "executions",
        "activities",
    ).all()
    serializer_class = TaskSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = [
        "farm",
        "field",
        "status",
        "priority",
        "schedule_type",
        "assigned_to",
        "assigned_employee",
    ]
    search_fields = ["title", "description", "category"]
    # The "All Users" filter on the Tasks page should filter by assigned_to
    # (matching the "User" column in the table), not by created_by.
    user_filter_field = "assigned_to_id"

    def get_permissions(self):
        # Any authenticated user (incl. EMPLOYEE/LABOUR) may create their own
        # tasks, start/stop their work timer, submit, and mark their task complete.
        if self.action in ("mark_complete", "submit", "create", "start_work", "stop_work", "before_work", "complete_work", "during_work", "resume_work", "take_break", "get_history"):
            from rest_framework.permissions import IsAuthenticated
            return [IsAuthenticated()]
        return super().get_permissions()

    def perform_create(self, serializer):
        user = self.request.user
        # Employees can only create tasks for themselves — force the assignee to
        # the creator and ignore any attempt to assign the task to someone else.
        if user.role == Role.EMPLOYEE:
            serializer.save(created_by=user, assigned_to=user, assigned_employee=None)
        else:
            serializer.save(created_by=user)

    def get_queryset(self):
        user = self.request.user
        # If an employee, and an assigned_to or assigned_employee filter is provided,
        # let the filter be applied. Otherwise, if no filter is provided, still
        # restrict to self.
        if user.role == Role.EMPLOYEE and not (
            self.request.query_params.get("assigned_to") or
            self.request.query_params.get("assigned_employee")
        ):
            qs = GenericAPIView.get_queryset(self)
            return qs.filter(
                Q(assigned_to=user) | Q(assigned_employee__user=user)
            )
        # For all other cases (non-employees, or employees with a filter),
        # apply farm scoping and other filters.
        qs = super().get_queryset()
        # Admin users can optionally filter to only their tasks via ?my_tasks=true
        if self.request.query_params.get("my_tasks") == "true":
            qs = qs.filter(
                Q(assigned_to=user) | Q(assigned_employee__user=user)
            )
        # The frontend "All Employees" dropdown sends ?employee=<id>; Task has
        # no `employee` field, so map it to assigned_employee here.
        employee = self.request.query_params.get("employee")
        if employee:
            qs = qs.filter(assigned_employee_id=employee)
        return qs

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        task = self.get_object()
        task.status = Task.Status.SUBMITTED
        # Don't force progress=100 — this is now used as the worker's
        # "ready to work" acknowledgment after Before Work confirmation.
        task.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(task).data)

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        task = self.get_object()
        task.status = Task.Status.APPROVED
        task.verified_by = request.user
        task.verified_at = timezone.now()
        task.save(
            update_fields=["status", "verified_by", "verified_at", "updated_at"]
        )
        return Response(self.get_serializer(task).data)

    def _spawn_next(self, task, user):
        """Create the next occurrence of a recurring task."""
        if task.recurrence == Task.Recurrence.NONE:
            return None
        return Task.objects.create(
            created_by=user,
            title=task.title,
            description=task.description,
            farm=task.farm,
            field=task.field,
            assigned_to=task.assigned_to,
            assigned_employee=task.assigned_employee,
            priority=task.priority,
            status=Task.Status.TODO,
            schedule_type=task.schedule_type,
            recurrence=task.recurrence,
            category=task.category,
            start_date=_add_period(task.start_date, task.recurrence),
            due_date=_add_period(task.due_date, task.recurrence),
            parent_task=task.parent_task or task,
        )

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        task = self.get_object()
        task.status = Task.Status.COMPLETED
        task.save(update_fields=["status", "updated_at"])
        nxt = self._spawn_next(task, request.user)
        data = self.get_serializer(task).data
        if nxt:
            data["next_occurrence_id"] = str(nxt.id)
            data["next_due_date"] = nxt.due_date
        return Response(data)

    @action(detail=True, methods=["post"])
    def mark_complete(self, request, pk=None):
        """Any assigned user can mark their task as completed without verification."""
        task = self.get_object()
        user = request.user
        # Verify the user is assigned to this task
        is_assigned = (
            task.assigned_to == user or
            (task.assigned_employee and task.assigned_employee.user == user)
        )
        if not is_assigned and user.role not in [Role.SUPER_ADMIN, Role.FARM_MANAGER]:
            return Response(
                {"detail": "You are not assigned to this task."},
                status=403,
            )
        if task.status in [Task.Status.COMPLETED, Task.Status.APPROVED, Task.Status.CANCELLED]:
            return Response(
                {"detail": "Task is already closed."},
                status=400,
            )
        task.status = Task.Status.COMPLETED
        task.progress = 100
        task.save(update_fields=["status", "progress", "updated_at"])
        return Response(self.get_serializer(task).data)

    @action(detail=True, methods=["post"])
    def generate_next(self, request, pk=None):
        """Manually spawn the next occurrence of a recurring task."""
        task = self.get_object()
        nxt = self._spawn_next(task, request.user)
        if not nxt:
            return Response({"detail": "Task is not recurring."}, status=400)
        return Response(self.get_serializer(nxt).data, status=201)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Monitoring snapshot: pending / active / completed / delayed + breakdowns."""
        qs = self.filter_queryset(self.get_queryset())
        farm = request.query_params.get("farm")
        if farm:
            qs = qs.filter(farm_id=farm)
        today = timezone.now().date()
        closed = [Task.Status.COMPLETED, Task.Status.APPROVED, Task.Status.CANCELLED]
        delayed = qs.filter(due_date__lt=today).exclude(status__in=closed)
        return Response(
            {
                "pending": qs.filter(status=Task.Status.TODO).count(),
                "active": qs.filter(
                    status__in=[
                        Task.Status.IN_PROGRESS,
                        Task.Status.SUBMITTED,
                        Task.Status.APPROVED,
                    ]
                ).count(),
                "completed": qs.filter(status=Task.Status.COMPLETED).count(),
                "delayed": delayed.count(),
                "total": qs.count(),
                "by_priority": list(
                    qs.values("priority").annotate(count=Count("id")).order_by("-count")
                ),
                "by_schedule_type": list(
                    qs.values("schedule_type")
                    .annotate(count=Count("id"))
                    .order_by("-count")
                ),
            }
        )

    @action(detail=True, methods=["post"])
    def update_progress(self, request, pk=None):
        task = self.get_object()
        try:
            progress = int(request.data.get("progress", task.progress))
        except (TypeError, ValueError):
            return Response(
                {"progress": ["Must be an integer between 0 and 100."]},
                status=400,
            )
        task.progress = max(0, min(100, progress))
        task.status = Task.Status.IN_PROGRESS
        task.save(update_fields=["progress", "status", "updated_at"])
        return Response(self.get_serializer(task).data)

    @action(detail=True, methods=["post"], url_path="start-work")
    def start_work(self, request, pk=None):
        """Start a work session on this task."""
        task = self.get_object()
        # Check if there's already an active session for this user
        existing = TaskWorkSession.objects.filter(
            task=task, user=request.user, end_time__isnull=True
        ).first()
        if existing:
            return Response(
                {"detail": "You already have an active work session on this task."},
                status=400,
            )
        session = TaskWorkSession.objects.create(
            task=task,
            user=request.user,
            created_by=request.user,
            start_time=timezone.now(),
        )
        # Auto-set status to IN_PROGRESS
        if task.status in [Task.Status.TODO, ""]:
            task.status = Task.Status.IN_PROGRESS
            task.save(update_fields=["status", "updated_at"])
        return Response(TaskWorkSessionSerializer(session).data, status=201)

    @action(detail=True, methods=["post"], url_path="stop-work")
    def stop_work(self, request, pk=None):
        """Stop the active work session on this task."""
        task = self.get_object()
        session = TaskWorkSession.objects.filter(
            task=task, user=request.user, end_time__isnull=True
        ).first()
        if not session:
            return Response(
                {"detail": "No active work session found for this task."},
                status=400,
            )
        session.end_time = timezone.now()
        session.save(update_fields=["end_time", "updated_at"])
        return Response(TaskWorkSessionSerializer(session).data)

    @action(detail=True, methods=["post"], url_path="before-work")
    def before_work(self, request, pk=None):
        """Employee starts work on a task - Before Work action."""
        try:
            task = Task.objects.get(pk=pk)
        except Task.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        user = request.user

        # Get employee (optional — task may be assigned via assigned_to user)
        from apps.workforce.models import Employee
        employee = Employee.objects.filter(user=user).first()

        # Verify assignment — either via assigned_employee or assigned_to
        is_assigned = (
            task.assigned_to == user or
            (employee and task.assigned_employee_id == employee.id) or
            user.role in [Role.SUPER_ADMIN, Role.FARM_MANAGER]
        )
        if not is_assigned:
            # For employees with no profile, allow if task has no specific assignment
            if user.role == Role.EMPLOYEE and not task.assigned_to and not task.assigned_employee:
                is_assigned = True
        if not is_assigned:
            return Response(
                {"detail": "You are not assigned to this task."},
                status=403,
            )

        # Get or create execution (only if employee profile exists)
        execution = None
        if employee:
            execution = TaskExecution.objects.filter(task=task, employee=employee).first()
            if not execution:
                execution = TaskExecution.objects.create(
                    task=task,
                    employee=employee,
                    created_by=user,
                    status=TaskExecution.Status.IN_PROGRESS,
                )
            else:
                # Check if already started
                if execution.before_work_time:
                    return Response(
                        {"detail": "Work already started on this task."},
                        status=400,
                    )

        # Validate required fields
        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        if not lat or not lng:
            return Response(
                {"detail": "GPS location is required (latitude, longitude)."},
                status=400,
            )

        photo = request.FILES.get("photo")

        # Update task status (always)
        task.status = Task.Status.IN_PROGRESS

        if execution:
            # Update execution with before work data
            execution.before_work_latitude = lat
            execution.before_work_longitude = lng
            execution.before_work_address = request.data.get("address", "")
            execution.before_work_time = timezone.now()
            # Anchor the timer; started_at is the fallback anchor used by
            # calculate_current_duration and the legacy execution flow.
            if not execution.started_at:
                execution.started_at = execution.before_work_time
            execution.status = TaskExecution.Status.IN_PROGRESS

            if photo:
                execution.before_work_photo = photo

            execution.save(update_fields=[
                "before_work_latitude", "before_work_longitude", "before_work_address",
                "before_work_time", "started_at", "before_work_photo", "status", "updated_at"
            ])
            task.before_work_time = execution.before_work_time
        else:
            task.before_work_time = timezone.now()

        task.save(update_fields=["before_work_time", "status", "updated_at"])

        # Create TaskActivity record
        TaskActivity.objects.create(
            task=task,
            task_execution=execution,
            employee=employee,
            action_type=TaskActivity.ActionType.BEFORE_WORK,
            photo=photo,
            latitude=lat,
            longitude=lng,
            address=request.data.get("address", ""),
            notes=request.data.get("notes", ""),
            created_by=user,
        )

        if execution:
            return Response(TaskExecutionSerializer(execution, context={'request': request}).data)
        return Response({"detail": "Work started.", "status": "IN_PROGRESS"})

    @action(detail=True, methods=["post"], url_path="take-break")
    def take_break(self, request, pk=None):
        """Employee takes a break - Break action."""
        try:
            task = Task.objects.get(pk=pk)
        except Task.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        user = request.user

        # Get employee (optional — assigned_to user may not have an employee profile)
        from apps.workforce.models import Employee
        employee = Employee.objects.filter(user=user).first()

        # Get execution — try by employee first, then by assigned_to user
        execution = None
        if employee:
            execution = TaskExecution.objects.filter(task=task, employee=employee).first()
        if not execution:
            # Fallback: find any IN_PROGRESS execution for this task
            execution = TaskExecution.objects.filter(
                task=task, status=TaskExecution.Status.IN_PROGRESS
            ).first()
        if not execution:
            # Task is IN_PROGRESS but no execution record — update task status directly
            task.status = Task.Status.ON_BREAK
            task.save(update_fields=["status", "updated_at"])
            return Response({"detail": "Break started.", "status": "ON_BREAK"})

        # Validate not already on break
        if execution.status == TaskExecution.Status.ON_BREAK:
            # Task may already be on break — just update task status
            task.status = Task.Status.ON_BREAK
            task.save(update_fields=["status", "updated_at"])
            return Response({"detail": "Already on break.", "status": "ON_BREAK"})

        # Optional fields — accept empty/missing for quick one-click break
        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        reason = request.data.get("reason", "Break")

        photo = request.FILES.get("photo")

        # Update execution with break start data
        execution.break_start_lat = lat
        execution.break_start_lng = lng
        execution.break_start_reason = reason
        execution.break_start_time = timezone.now()
        execution.status = TaskExecution.Status.ON_BREAK

        if photo:
            execution.break_start_photo = photo

        execution.save(update_fields=[
            "break_start_lat", "break_start_lng", "break_start_reason",
            "break_start_time", "break_start_photo", "status", "updated_at"
        ])
        
        # Update task status
        task.status = Task.Status.ON_BREAK
        task.save(update_fields=["status", "updated_at"])

        # Create TaskActivity record
        TaskActivity.objects.create(
            task=task,
            task_execution=execution,
            employee=employee,
            action_type=TaskActivity.ActionType.BREAK_START,
            photo=photo,
            latitude=lat,
            longitude=lng,
            reason=reason,
            created_by=user,
        )

        return Response(TaskExecutionSerializer(execution, context={'request': request}).data)

    @action(detail=True, methods=["post"], url_path="resume-work")
    def resume_work(self, request, pk=None):
        """Employee resumes work after break - Resume action."""
        try:
            task = Task.objects.get(pk=pk)
        except Task.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        user = request.user

        # Get employee (optional)
        from apps.workforce.models import Employee
        employee = Employee.objects.filter(user=user).first()

        # Get execution — try by employee first, then any ON_BREAK execution
        execution = None
        if employee:
            execution = TaskExecution.objects.filter(task=task, employee=employee).first()
        if not execution:
            execution = TaskExecution.objects.filter(
                task=task, status=TaskExecution.Status.ON_BREAK
            ).first()
        if not execution:
            # No execution — just update task status directly
            task.status = Task.Status.IN_PROGRESS
            task.save(update_fields=["status", "updated_at"])
            return Response({"detail": "Work resumed.", "status": "IN_PROGRESS"})

        # If not on break, just update task status
        if execution.status != TaskExecution.Status.ON_BREAK:
            task.status = Task.Status.IN_PROGRESS
            task.save(update_fields=["status", "updated_at"])
            return Response({"detail": "Work resumed.", "status": "IN_PROGRESS"})

        # Optional fields — accept empty/missing for one-click resume
        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        photo = request.FILES.get("photo")

        # Calculate break duration
        if execution.break_start_time:
            break_duration = (timezone.now() - execution.break_start_time).total_seconds()
            execution.total_break_seconds += int(break_duration)

        # Update execution with break end data
        execution.break_end_lat = lat
        execution.break_end_lng = lng
        execution.break_end_time = timezone.now()
        execution.status = TaskExecution.Status.IN_PROGRESS

        if photo:
            execution.break_end_photo = photo

        execution.save(update_fields=[
            "break_end_lat", "break_end_lng", "break_end_time",
            "break_end_photo", "total_break_seconds", "status", "updated_at"
        ])
        
        # Update task status back to IN_PROGRESS
        task.status = Task.Status.IN_PROGRESS
        task.save(update_fields=["status", "updated_at"])

        # Create TaskActivity record
        TaskActivity.objects.create(
            task=task,
            task_execution=execution,
            employee=employee,
            action_type=TaskActivity.ActionType.BREAK_END,
            photo=photo,
            latitude=lat,
            longitude=lng,
            created_by=user,
        )

        return Response(TaskExecutionSerializer(execution, context={'request': request}).data)

    @action(detail=True, methods=["post"], url_path="during-work")
    def during_work(self, request, pk=None):
        """Employee provides progress update - During Work action."""
        try:
            task = Task.objects.get(pk=pk)
        except Task.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        user = request.user

        # Get employee (optional)
        from apps.workforce.models import Employee
        employee = Employee.objects.filter(user=user).first()

        # Get execution (optional)
        execution = None
        if employee:
            execution = TaskExecution.objects.filter(task=task, employee=employee).first()

        if execution and execution.status in [TaskExecution.Status.COMPLETED, TaskExecution.Status.APPROVED, TaskExecution.Status.WAITING_APPROVAL]:
            return Response(
                {"detail": "Task is already completed."},
                status=400,
            )

        # Optional fields — all fields are optional for During Work
        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        photo = request.FILES.get("photo")
        notes = request.data.get("notes", "")

        # Create TaskActivity record (progress is stored in activity)
        activity = TaskActivity.objects.create(
            task=task,
            task_execution=execution,
            employee=employee,
            action_type=TaskActivity.ActionType.DURING_WORK,
            photo=photo,
            latitude=lat,
            longitude=lng,
            notes=notes,
            created_by=user,
        )

        # Also create TaskProgressLog for backward compatibility (only if execution exists)
        if execution:
            TaskProgressLog.objects.create(
                task_execution=execution,
                progress_percentage=request.data.get("progress_percentage", 0),
                remarks=notes,
                photo=photo,
                gps_lat=lat,
                gps_lng=lng,
                created_by=user,
            )

        return Response(TaskActivitySerializer(activity, context={'request': request}).data)

    @action(detail=True, methods=["post"], url_path="complete-work")
    def complete_work(self, request, pk=None):
        """Employee completes the task - Complete Work action."""
        try:
            task = Task.objects.get(pk=pk)
        except Task.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        user = request.user

        # Get employee (optional)
        from apps.workforce.models import Employee
        employee = Employee.objects.filter(user=user).first()

        # Get execution (optional)
        execution = None
        if employee:
            execution = TaskExecution.objects.filter(task=task, employee=employee).first()

        # Validate not already completed
        if execution and execution.status in [TaskExecution.Status.COMPLETED, TaskExecution.Status.APPROVED, TaskExecution.Status.WAITING_APPROVAL]:
            return Response(
                {"detail": "Task is already completed."},
                status=400,
            )

        # If on break, end the break first
        if execution and execution.status == TaskExecution.Status.ON_BREAK:
            if execution.break_start_time:
                break_duration = (timezone.now() - execution.break_start_time).total_seconds()
                execution.total_break_seconds += int(break_duration)
            execution.break_end_time = timezone.now()

        # Validate required fields
        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        completion_notes = request.data.get("completion_notes", "")
        if not lat or not lng:
            return Response(
                {"detail": "GPS location is required (latitude, longitude)."},
                status=400,
            )
        if not completion_notes:
            return Response(
                {"detail": "Completion notes are required."},
                status=400,
            )

        photo = request.FILES.get("photo")

        if execution:
            # Calculate final working time
            if execution.before_work_time:
                total_work = (timezone.now() - execution.before_work_time).total_seconds()
                execution.total_work_seconds = int(total_work - execution.total_break_seconds)

            # Update execution with completion data
            execution.completion_lat = lat
            execution.completion_lng = lng
            execution.completion_notes = completion_notes
            execution.completion_time = timezone.now()
            execution.completed_at = timezone.now()
            execution.status = TaskExecution.Status.WAITING_APPROVAL

            if photo:
                execution.completion_photo = photo

            execution.save(update_fields=[
                "completion_lat", "completion_lng", "completion_notes",
                "completion_time", "completed_at", "total_work_seconds",
                "total_break_seconds", "completion_photo", "status", "updated_at"
            ])

        # Update task
        task.completed_time = timezone.now()
        task.status = Task.Status.WAITING_APPROVAL
        task.save(update_fields=["completed_time", "status", "updated_at"])

        # Create TaskActivity record
        TaskActivity.objects.create(
            task=task,
            task_execution=execution,
            employee=employee,
            action_type=TaskActivity.ActionType.COMPLETED,
            photo=photo,
            latitude=lat,
            longitude=lng,
            notes=completion_notes,
            created_by=user,
        )

        if execution:
            return Response(TaskExecutionSerializer(execution, context={'request': request}).data)
        return Response({"detail": "Work completed.", "status": "WAITING_APPROVAL"})

    @action(detail=True, methods=["get"], url_path="get-timer")
    def get_timer(self, request, pk=None):
        """Get current timer status for a task."""
        task = self.get_object()
        user = request.user

        # Get employee
        from apps.workforce.models import Employee
        employee = Employee.objects.filter(user=user).first()
        if not employee:
            return Response(
                {"detail": "Employee profile not found."},
                status=400,
            )

        # Get execution
        execution = TaskExecution.objects.filter(task=task, employee=employee).first()
        if not execution:
            return Response({
                "working_seconds": 0,
                "break_seconds": 0,
                "net_work_seconds": 0,
                "timer_display": "00:00:00",
                "is_running": False,
                "is_on_break": False,
                "is_completed": False,
                "started_at": None,
            })

        # Get timer data from serializer
        timer_data = TaskExecutionSerializer(execution, context={'request': request}).data.get('timer_data', {})

        return Response(timer_data)

    @action(detail=True, methods=["get"], url_path="get-history")
    def get_history(self, request, pk=None):
        """Get activity history for a task."""
        task = self.get_object()
        user = request.user

        # Get employee
        from apps.workforce.models import Employee
        employee = Employee.objects.filter(user=user).first()
        if not employee:
            return Response(
                {"detail": "Employee profile not found."},
                status=400,
            )

        # Get execution
        execution = TaskExecution.objects.filter(task=task, employee=employee).first()
        if not execution:
            return Response([])

        # Get activities
        activities = TaskActivity.objects.filter(
            task=task,
            task_execution=execution
        ).order_by("-timestamp")

        return Response(TaskActivitySerializer(activities, many=True, context={'request': request}).data)


class TaskWorkSessionViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    """View and filter work sessions. Admin can see all, others see their own."""

    queryset = TaskWorkSession.objects.select_related(
        "task", "user", "created_by"
    ).all()
    serializer_class = TaskWorkSessionSerializer
    farm_lookup = "task__farm_id"
    allowed_roles = [
        Role.SUPER_ADMIN,
        Role.FARM_MANAGER,
        Role.EMPLOYEE,
    ]
    readonly_roles = []
    filterset_fields = ["task", "user", "task__farm"]
    search_fields = ["task__title", "user__username", "note"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        # Employees see only their own sessions unless a specific user filter is provided.
        if user.role == Role.EMPLOYEE and not self.request.query_params.get("user"):
            qs = qs.filter(user=user)
        return qs

    def perform_create(self, serializer):
        # Always attribute a manually-created session to the caller; "user" is
        # read-only on the serializer so it cannot be spoofed to a coworker.
        serializer.save(user=self.request.user, created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def force_stop(self, request, pk=None):
        """Admin-only: stop any user's active work session by session ID."""
        if request.user.role not in [Role.SUPER_ADMIN, Role.FARM_MANAGER]:
            return Response(
                {"detail": "Only admins can force-stop sessions."},
                status=403,
            )
        session = self.get_object()
        if session.end_time is not None:
            return Response(
                {"detail": "Session is already stopped."},
                status=400,
            )
        session.end_time = timezone.now()
        session.save(update_fields=["end_time", "updated_at"])
        return Response(TaskWorkSessionSerializer(session).data)


class TaskUpdateViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = TaskUpdate.objects.select_related("task", "task__farm").all()
    serializer_class = TaskUpdateSerializer
    farm_lookup = "task__farm_id"
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["task"]
    search_fields = ["note", "task__title"]


class TaskExecutionViewSet(BaseModelViewSet):
    """ViewSet for managing task execution workflow."""

    queryset = TaskExecution.objects.select_related(
        "task", "task__farm", "employee", "employee__user", "approved_by"
    ).prefetch_related(
        "break_logs", "progress_logs"
    ).all()
    serializer_class = TaskExecutionSerializer
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["task", "employee", "status"]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()

        # Employees see only their own executions
        if user.role == Role.EMPLOYEE:
            from apps.workforce.models import Employee
            employee = Employee.objects.filter(user=user).first()
            if employee:
                qs = qs.filter(employee=employee)
            else:
                qs = qs.none()

        # Filter by task
        task_id = self.request.query_params.get("task")
        if task_id:
            qs = qs.filter(task_id=task_id)

        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def _get_execution(self, pk):
        """Get execution object and verify permissions."""
        return self.get_object()

    def _get_or_create_execution(self, task, employee, user):
        """Get existing execution or create new one."""
        execution = TaskExecution.objects.filter(task=task, employee=employee).first()
        if not execution:
            execution = TaskExecution.objects.create(
                task=task,
                employee=employee,
                created_by=user,
                status=TaskExecution.Status.ASSIGNED,
            )
        return execution

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        """Employee confirms the task (moves from ASSIGNED to CONFIRMED)."""
        execution = self.get_object()

        # Verify the user is the assigned employee
        if execution.employee.user_id != request.user.id:
            return Response({"detail": "You are not assigned to this task."}, status=403)

        if execution.status != TaskExecution.Status.ASSIGNED:
            return Response(
                {"detail": f"Task is already {execution.status}. Cannot confirm."},
                status=400
            )

        execution.status = TaskExecution.Status.CONFIRMED
        execution.confirmed_at = timezone.now()
        execution.save(update_fields=["status", "confirmed_at", "updated_at"])

        return Response(TaskExecutionSerializer(execution, context={'request': request}).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Employee starts working on the task (moves from CONFIRMED to IN_PROGRESS)."""
        execution = self.get_object()

        # Verify the user is the assigned employee
        if execution.employee.user_id != request.user.id:
            return Response({"detail": "You are not assigned to this task."}, status=403)

        if execution.status != TaskExecution.Status.CONFIRMED:
            return Response(
                {"detail": f"Cannot start. Task must be CONFIRMED first (current: {execution.status})."},
                status=400
            )

        # Start the timer
        execution.status = TaskExecution.Status.IN_PROGRESS
        execution.started_at = timezone.now()
        execution.current_timer_started_at = timezone.now()

        # Save GPS if provided
        lat = request.data.get("gps_lat")
        lng = request.data.get("gps_lng")
        if lat and lng:
            execution.gps_start_lat = lat
            execution.gps_start_lng = lng

        execution.save(update_fields=[
            "status", "started_at", "current_timer_started_at",
            "gps_start_lat", "gps_start_lng", "updated_at"
        ])

        return Response(TaskExecutionSerializer(execution, context={'request': request}).data)

    @action(detail=True, methods=["post"])
    def break_work(self, request, pk=None):
        """Employee takes a break (pauses timer)."""
        execution = self.get_object()

        # Verify the user is the assigned employee
        if execution.employee.user_id != request.user.id:
            return Response({"detail": "You are not assigned to this task."}, status=403)

        if execution.status != TaskExecution.Status.IN_PROGRESS:
            return Response(
                {"detail": f"Cannot take break. Task must be IN_PROGRESS (current: {execution.status})."},
                status=400
            )

        # Calculate working seconds so far
        if execution.started_at:
            elapsed = (timezone.now() - execution.started_at).total_seconds()
            execution.working_seconds = int(elapsed)

        # Create break log
        lat = request.data.get("gps_lat")
        lng = request.data.get("gps_lng")
        break_log = TaskBreakLog.objects.create(
            task_execution=execution,
            break_started_at=timezone.now(),
            created_by=request.user,
            gps_lat=lat,
            gps_lng=lng,
        )

        execution.status = TaskExecution.Status.ON_BREAK
        execution.current_break_started_at = timezone.now()
        execution.save(update_fields=["status", "current_break_started_at", "working_seconds", "updated_at"])

        return Response(TaskExecutionSerializer(execution, context={'request': request}).data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        """Employee resumes work after break (continues timer)."""
        execution = self.get_object()

        # Verify the user is the assigned employee
        if execution.employee.user_id != request.user.id:
            return Response({"detail": "You are not assigned to this task."}, status=403)

        if execution.status != TaskExecution.Status.ON_BREAK:
            return Response(
                {"detail": f"Cannot resume. Task must be ON_BREAK (current: {execution.status})."},
                status=400
            )

        # End the current break
        break_log = execution.break_logs.filter(break_ended_at__isnull=True).first()
        if break_log:
            break_log.break_ended_at = timezone.now()
            break_log.save()

            # Add break duration to total
            execution.break_seconds += break_log.break_duration_seconds

        execution.status = TaskExecution.Status.IN_PROGRESS
        execution.current_break_started_at = None

        # Continue timer from where it left off
        # working_seconds already has time before break
        # Timer continues from current moment

        execution.save(update_fields=["status", "current_break_started_at", "break_seconds", "updated_at"])

        return Response(TaskExecutionSerializer(execution, context={'request': request}).data)

    @action(detail=True, methods=["post"])
    def progress(self, request, pk=None):
        """Employee updates progress during work (During Work button)."""
        execution = self.get_object()

        # Verify the user is the assigned employee
        if execution.employee.user_id != request.user.id:
            return Response({"detail": "You are not assigned to this task."}, status=403)

        if execution.status not in [TaskExecution.Status.IN_PROGRESS, TaskExecution.Status.ON_BREAK]:
            return Response(
                {"detail": f"Cannot update progress. Task must be IN_PROGRESS or ON_BREAK (current: {execution.status})."},
                status=400
            )

        # Get progress data
        progress_percentage = request.data.get("progress_percentage")
        remarks = request.data.get("remarks", "")
        lat = request.data.get("gps_lat")
        lng = request.data.get("gps_lng")

        if progress_percentage is not None:
            try:
                progress_percentage = int(progress_percentage)
                progress_percentage = max(0, min(100, progress_percentage))
                execution.progress_percentage = progress_percentage
            except (ValueError, TypeError):
                pass

        # Create progress log
        progress_log = TaskProgressLog.objects.create(
            task_execution=execution,
            progress_percentage=progress_percentage or execution.progress_percentage,
            remarks=remarks,
            created_by=request.user,
            gps_lat=lat,
            gps_lng=lng,
        )

        # Handle photo upload
        photo = request.FILES.get("photo")
        if photo:
            progress_log.photo = photo
            progress_log.save()

        execution.save(update_fields=["progress_percentage", "updated_at"])

        return Response(TaskProgressLogSerializer(progress_log, context={'request': request}).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Employee completes the task (moves to WAITING_APPROVAL)."""
        execution = self.get_object()

        # Verify the user is the assigned employee
        if execution.employee.user_id != request.user.id:
            return Response({"detail": "You are not assigned to this task."}, status=403)

        if execution.status not in [TaskExecution.Status.IN_PROGRESS, TaskExecution.Status.ON_BREAK]:
            return Response(
                {"detail": f"Cannot complete. Task must be IN_PROGRESS or ON_BREAK (current: {execution.status})."},
                status=400
            )

        # If on break, end the break first
        if execution.status == TaskExecution.Status.ON_BREAK:
            break_log = execution.break_logs.filter(break_ended_at__isnull=True).first()
            if break_log:
                break_log.break_ended_at = timezone.now()
                break_log.save()
                execution.break_seconds += break_log.break_duration_seconds

        # Calculate final working seconds
        if execution.started_at:
            elapsed = (timezone.now() - execution.started_at).total_seconds()
            execution.working_seconds = int(elapsed) - execution.break_seconds

        # Save completion details
        execution.status = TaskExecution.Status.WAITING_APPROVAL
        execution.completed_at = timezone.now()

        lat = request.data.get("gps_lat")
        lng = request.data.get("gps_lng")
        if lat and lng:
            execution.gps_complete_lat = lat
            execution.gps_complete_lng = lng

        execution.completion_notes = request.data.get("completion_notes", "")

        # Handle completion photo
        photo = request.FILES.get("completion_photo")
        if photo:
            execution.completion_photo = photo

        execution.save(update_fields=[
            "status", "completed_at", "working_seconds", "break_seconds",
            "gps_complete_lat", "gps_complete_lng", "completion_notes",
            "completion_photo", "updated_at"
        ])

        return Response(TaskExecutionSerializer(execution, context={'request': request}).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Manager approves the completed task."""
        if request.user.role not in [Role.SUPER_ADMIN, Role.FARM_MANAGER]:
            return Response({"detail": "Only managers can approve tasks."}, status=403)

        execution = self.get_object()

        if execution.status != TaskExecution.Status.WAITING_APPROVAL:
            return Response(
                {"detail": f"Cannot approve. Task must be WAITING_APPROVAL (current: {execution.status})."},
                status=400
            )

        execution.status = TaskExecution.Status.APPROVED
        execution.approved_at = timezone.now()
        execution.approved_by = request.user
        execution.save(update_fields=["status", "approved_at", "approved_by", "updated_at"])

        # Also update the main Task status
        execution.task.status = Task.Status.APPROVED
        execution.task.progress = 100
        execution.task.verified_by = request.user
        execution.task.verified_at = timezone.now()
        execution.task.save(update_fields=["status", "progress", "verified_by", "verified_at", "updated_at"])

        return Response(TaskExecutionSerializer(execution, context={'request': request}).data)

    @action(detail=True, methods=["post"])
    def return_task(self, request, pk=None):
        """Manager returns the task for revision."""
        if request.user.role not in [Role.SUPER_ADMIN, Role.FARM_MANAGER]:
            return Response({"detail": "Only managers can return tasks."}, status=403)

        execution = self.get_object()

        if execution.status != TaskExecution.Status.WAITING_APPROVAL:
            return Response(
                {"detail": f"Cannot return. Task must be WAITING_APPROVAL (current: {execution.status})."},
                status=400
            )

        execution.status = TaskExecution.Status.RETURNED
        execution.returned_at = timezone.now()
        execution.save(update_fields=["status", "returned_at", "updated_at"])

        return Response(TaskExecutionSerializer(execution, context={'request': request}).data)

    @action(detail=True, methods=["post"])
    def reject_work(self, request, pk=None):
        """Employee rejects the assigned task."""
        execution = self.get_object()

        # Verify the user is the assigned employee
        if execution.employee.user_id != request.user.id:
            return Response({"detail": "You are not assigned to this task."}, status=403)

        if execution.status != TaskExecution.Status.ASSIGNED:
            return Response(
                {"detail": f"Cannot reject. Task must be ASSIGNED (current: {execution.status})."},
                status=400
            )

        execution.status = TaskExecution.Status.REJECTED
        execution.save(update_fields=["status", "updated_at"])

        return Response(TaskExecutionSerializer(execution, context={'request': request}).data)
