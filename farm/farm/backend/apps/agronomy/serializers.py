from rest_framework import serializers

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

    class Meta:
        model = Observation
        fields = "__all__"


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
