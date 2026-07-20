"""Tenant boundary for farm-scoped data.

Every account — super admins included — sees only the farms it belongs to
(``user.farms``). Each super admin registers through ``/auth/register/``,
which creates that admin's own farm, and then creates managers and employees
under it, so two super admins never see each other's workforce, agronomy,
finance or reports.

``GLOBAL_ROLES`` is the list of roles that bypass that boundary. It is empty:
no application role is cross-tenant. It stays as a named, importable constant
so every farm-scoping site keeps a single source of truth — adding a role here
would open the boundary everywhere at once, rather than in one view that
silently drifts from the rest.
"""

GLOBAL_ROLES = frozenset()
