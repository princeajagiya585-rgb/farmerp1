from rest_framework import serializers

from .models import Document, DocumentVersion


class DocumentSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    uploaded_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True
    )
    version_count = serializers.IntegerField(source="versions.count", read_only=True)

    class Meta:
        model = Document
        fields = "__all__"


class DocumentVersionSerializer(serializers.ModelSerializer):
    document_title = serializers.CharField(source="document.title", read_only=True)

    class Meta:
        model = DocumentVersion
        fields = "__all__"
