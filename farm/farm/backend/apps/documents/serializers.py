from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.utils import build_absolute_photo_url

from .models import Document, DocumentVersion


class DocumentSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    uploaded_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True
    )
    version_count = serializers.IntegerField(source="versions.count", read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = "__all__"
        extra_kwargs = {"file": {"write_only": True}}

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_file_url(self, obj):
        return build_absolute_photo_url(obj.file, self.context.get('request'))


class DocumentVersionSerializer(serializers.ModelSerializer):
    document_title = serializers.CharField(source="document.title", read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = DocumentVersion
        fields = "__all__"
        extra_kwargs = {"file": {"write_only": True}}

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_file_url(self, obj):
        return build_absolute_photo_url(obj.file, self.context.get('request'))
