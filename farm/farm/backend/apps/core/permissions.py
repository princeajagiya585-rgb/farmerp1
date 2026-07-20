from rest_framework.permissions import BasePermission, SAFE_METHODS

from apps.core.tenancy import GLOBAL_ROLES as TENANT_GLOBAL_ROLES

# Role constants (mirror apps.accounts.models.Role)
SUPER_ADMIN = "SUPER_ADMIN"
FARM_MANAGER = "FARM_MANAGER"
EMPLOYEE = "EMPLOYEE"


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == SUPER_ADMIN)


class IsManagerOrAdmin(BasePermission):
    """Reports & analytics are management functions — never for plain employees."""

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.role in (SUPER_ADMIN, FARM_MANAGER))


class RoleAllowed(BasePermission):
    """Generic role gate. Set `allowed_roles` on the view.

    Optionally set `readonly_roles` for roles that may only read (SAFE_METHODS).
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.role == SUPER_ADMIN:
            return True
        # Only super admins may delete — managers can create/edit but not delete.
        if request.method == "DELETE":
            return False
        allowed = set(getattr(view, "allowed_roles", []))
        readonly = set(getattr(view, "readonly_roles", []))
        if user.role in allowed:
            return True
        if request.method in SAFE_METHODS and user.role in readonly:
            return True
        return False


class IsFarmMember(BasePermission):
    """Object-level: restricts access to objects belonging to the user's farms.

    The object (or its related chain) must expose a `farm_id`. No role bypasses
    the farm boundary — see apps.core.tenancy.
    """

    GLOBAL_ROLES = TENANT_GLOBAL_ROLES

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role in self.GLOBAL_ROLES:
            return True
        farm_id = getattr(obj, "farm_id", None)
        if farm_id is None:
            return True
        return user.farms.filter(id=farm_id).exists()
