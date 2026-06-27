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
