from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.core.mixins import BaseModelViewSet
from apps.farms.views import FarmScopedQuerysetMixin

from .models import Document, DocumentVersion
from .serializers import DocumentSerializer, DocumentVersionSerializer


class DocumentViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Document.objects.select_related("farm", "created_by").all()
    serializer_class = DocumentSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm", "category"]
    search_fields = ["title", "description", "tags"]

    @action(detail=True, methods=["post"])
    def add_version(self, request, pk=None):
        """Upload a new version: archives the prior file and bumps the version."""
        document = self.get_object()
        new_file = request.FILES.get("file")
        if not new_file:
            return Response({"detail": "A file is required."}, status=400)
        # Archive the current file as a version snapshot.
        if document.file:
            DocumentVersion.objects.create(
                created_by=request.user,
                document=document,
                file=document.file,
                version=document.version,
                notes=request.data.get("notes", ""),
            )
        document.version += 1
        document.file = new_file
        document.save(update_fields=["file", "version", "updated_at"])
        return Response(self.get_serializer(document).data)


class DocumentVersionViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = DocumentVersion.objects.select_related("document").all()
    serializer_class = DocumentVersionSerializer
    farm_lookup = "document__farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["document"]
