from rest_framework import mixins, viewsets

from apps.core.models import AuditLog
from apps.core.permissions import IsSuperAdmin
from apps.core.serializers import AuditLogSerializer


class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = AuditLog.objects.select_related("user").all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsSuperAdmin]
    filterset_fields = ["action", "user", "model_name"]
    search_fields = ["path", "model_name", "object_id"]

    def get_queryset(self):
        """Only entries written by users inside the caller's own tenant.

        The role gate alone let every super admin read the whole platform's
        audit trail. AuditLog has no farm column, so the tenant is taken from
        the acting user's farms — the same boundary every other list uses.
        Entries with no user (anonymous/system writes) belong to no tenant and
        are shown to nobody.
        """
        farm_ids = self.request.user.farms.values_list("id", flat=True)
        return super().get_queryset().filter(user__farms__in=farm_ids).distinct()
