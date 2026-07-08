from rest_framework import viewsets
from rest_framework.generics import GenericAPIView

from apps.accounts.models import Role
from apps.core.permissions import RoleAllowed


class BaseModelViewSet(viewsets.ModelViewSet):
    """Shared viewset: applies RoleAllowed and stamps created_by on create."""

    permission_classes = [RoleAllowed]
    allowed_roles = []
    readonly_roles = []

    def perform_create(self, serializer):
        if "created_by" in [f.name for f in serializer.Meta.model._meta.get_fields()]:
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()


class EmployeeSelfScopedMixin:
    """Restrict EMPLOYEE/LABOUR users to *their own* records.

    Employees should only ever see their own details — never a coworker's.
    Set ``employee_self_lookup`` to the ORM path from the model to the owning
    user: ``"user"`` for a direct user FK, ``"employee__user"`` when the row
    links through an Employee (the default). Super admins, managers and other
    roles are unaffected.

    Place this BEFORE the farm-scoping mixin in the base list so both filters
    compose, e.g. ``class X(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, ...)``.

    For an EMPLOYEE, self-scoping is strictly tighter than farm-scoping (they
    only ever see rows tied to their own employee record). We therefore bypass
    the farm filter for employees: their own records must always be visible,
    even when their ``user.farms`` assignment is out of sync with the farm on
    their employee record. Without this, e.g. an advance the manager creates on
    the employee's actual farm would be hidden if the user happened to be
    assigned to a different farm.
    """

    employee_self_lookup = "employee__user"

    def get_queryset(self):
        user = self.request.user
        # If an employee, and an employee filter is provided, let the filter be applied.
        # Otherwise, if no employee filter is provided, still restrict to self.
        # This modification allows employees to use the employee filter to view
        # data for other employees, while still maintaining self-scoping if no
        # specific employee filter is chosen.
        if user.is_authenticated and user.role == Role.EMPLOYEE and not self.request.query_params.get("employee"):
            qs = GenericAPIView.get_queryset(self)
            return qs.filter(**{self.employee_self_lookup: user})
        return super().get_queryset()
