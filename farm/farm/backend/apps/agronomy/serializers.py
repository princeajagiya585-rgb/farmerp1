from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.utils import build_absolute_photo_url

from .models import (
    Crop,
    GrowthRecord,
    HarvestRecord,
    InputApplication,
    Observation,
    PlantationRecord,
)


class CropSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    field_name = serializers.CharField(source="field.name", read_only=True)
    block_name = serializers.CharField(source="field.block_name", read_only=True)

    class Meta:
        model = Crop
        fields = "__all__"


class PlantationRecordSerializer(serializers.ModelSerializer):
    crop_name = serializers.CharField(source="crop.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)

    class Meta:
        model = PlantationRecord
        fields = "__all__"


class ObservationSerializer(serializers.ModelSerializer):
    crop_name = serializers.CharField(source="crop.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Observation
        fields = "__all__"
        extra_kwargs = {"photo": {"write_only": True}}

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_photo_url(self, obj):
        return build_absolute_photo_url(obj.photo, self.context.get('request'))


class InputApplicationSerializer(serializers.ModelSerializer):
    crop_name = serializers.CharField(source="crop.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    inventory_item_name = serializers.CharField(
        source="inventory_item.name", read_only=True
    )

    class Meta:
        model = InputApplication
        fields = "__all__"


class GrowthRecordSerializer(serializers.ModelSerializer):
    crop_name = serializers.CharField(source="crop.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)

    class Meta:
        model = GrowthRecord
        fields = "__all__"


class HarvestRecordSerializer(serializers.ModelSerializer):
    crop_name = serializers.CharField(source="crop.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)

    class Meta:
        model = HarvestRecord
        fields = "__all__"
