import calendar
from datetime import date, timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.core.mixins import BaseModelViewSet
from apps.farms.views import FarmScopedQuerysetMixin

from .models import Task, TaskUpdate, TaskWorkSession
from .serializers import TaskSerializer, TaskUpdateSerializer, TaskWorkSessionSerializer


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

    def get_permissions(self):
        # Any authenticated user (incl. EMPLOYEE/LABOUR) may create their own
        # tasks, start/stop their work timer, and mark their task complete.
        if self.action in ("mark_complete", "create", "start_work", "stop_work"):
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
        qs = super().get_queryset()
        user = self.request.user
        # Employees see only tasks assigned to them
        if user.role == Role.EMPLOYEE:
            qs = qs.filter(
                Q(assigned_to=user) | Q(assigned_employee__user=user)
            )
        # Admin users can optionally filter to only their tasks via ?my_tasks=true
        elif self.request.query_params.get("my_tasks") == "true":
            qs = qs.filter(
                Q(assigned_to=user) | Q(assigned_employee__user=user)
            )
        return qs

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        task = self.get_object()
        task.status = Task.Status.SUBMITTED
        task.progress = 100
        task.save(update_fields=["status", "progress", "updated_at"])
        return Response(self.get_serializer(task).data)

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        task = self.get_object()
        task.status = Task.Status.VERIFIED
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
        if task.status in [Task.Status.COMPLETED, Task.Status.VERIFIED, Task.Status.CANCELLED]:
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
        closed = [Task.Status.COMPLETED, Task.Status.VERIFIED, Task.Status.CANCELLED]
        delayed = qs.filter(due_date__lt=today).exclude(status__in=closed)
        return Response(
            {
                "pending": qs.filter(status=Task.Status.TODO).count(),
                "active": qs.filter(
                    status__in=[
                        Task.Status.IN_PROGRESS,
                        Task.Status.SUBMITTED,
                        Task.Status.VERIFIED,
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
        task.progress = int(request.data.get("progress", task.progress))
        task.status = Task.Status.IN_PROGRESS
        task.save(update_fields=["progress", "status", "updated_at"])
        return Response(self.get_serializer(task).data)

    @action(detail=True, methods=["post"])
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

    @action(detail=True, methods=["post"])
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
        # Employees see only their own sessions; admins/managers see all
        if user.role == Role.EMPLOYEE:
            qs = qs.filter(user=user)
        return qs

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
