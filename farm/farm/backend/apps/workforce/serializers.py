from django.conf import settings
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import (
    Employee,
    Shift,
    WorkforceAllocation,
    Attendance,
    Department,
    Skill,
    EmploymentHistory,
    PerformanceReview,
    Availability,
)


def build_absolute_photo_url(photo, request=None):
    if not photo:
        return None
    if request:
        return request.build_absolute_uri(photo.url)
    return f"{settings.BACKEND_URL}{photo.url}"


class DepartmentSerializer(serializers.ModelSerializer):
    employee_count = serializers.IntegerField(source="employees.count", read_only=True)
    employees = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = "__all__"

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_employees(self, obj):
        return [{"id": e.id, "name": e.name} for e in obj.employees.all()]


class SkillSerializer(serializers.ModelSerializer):
    employees = serializers.SerializerMethodField()

    class Meta:
        model = Skill
        fields = "__all__"

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_employees(self, obj):
        return [{"id": e.id, "name": e.name} for e in obj.employees.all()]


class EmployeeSerializer(serializers.ModelSerializer):
    name = serializers.CharField(required=False)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    assigned_farms = serializers.SerializerMethodField()
    department_name = serializers.CharField(source="department.name", read_only=True)
    skill_names = serializers.SerializerMethodField()
    skill_ids = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    skills = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Skill.objects.all(),
        required=False,
        allow_empty=True
    )

    class Meta:
        model = Employee
        fields = ["id", "name", "employee_code", "first_name", "last_name", "phone",
                  "employment_type", "designation", "farm", "farm_name", "assigned_farms", "department",
                  "department_name", "skills", "skill_names", "skill_ids", "address",
                  "photo", "photo_url", "is_active", "category", "user", "created_at", "updated_at",
                  "daily_wage", "monthly_salary", "date_of_joining"]
        extra_kwargs = {
            'first_name': {'required': False},
            'last_name': {'required': False},
            'phone': {'required': False},
            'skills': {'required': False},
        }

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_photo_url(self, obj):
        return build_absolute_photo_url(obj.photo, self.context.get('request'))

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_skill_names(self, obj):
        return [s.name for s in obj.skills.all()]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_assigned_farms(self, obj):
        if obj.user:
            return [farm.name for farm in obj.user.farms.all()]
        return []

    @extend_schema_field(serializers.ListField(child=serializers.IntegerField()))
    def get_skill_ids(self, obj):
        return [s.id for s in obj.skills.all()]

    def split_name(self, full_name):
        parts = full_name.strip().split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""
        return first_name, last_name

    def create(self, validated_data):
        name = validated_data.pop("name", None)
        if name:
            first_name, last_name = self.split_name(name)
            validated_data["first_name"] = first_name
            validated_data["last_name"] = last_name
        return super().create(validated_data)

    def update(self, instance, validated_data):
        name = validated_data.pop("name", None)
        if name:
            first_name, last_name = self.split_name(name)
            validated_data["first_name"] = first_name
            validated_data["last_name"] = last_name
        return super().update(instance, validated_data)


class ShiftSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)

    class Meta:
        model = Shift
        fields = "__all__"


class WorkforceAllocationSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    field_name = serializers.CharField(source="field.name", read_only=True)
    shift_name = serializers.CharField(source="shift.name", read_only=True)

    class Meta:
        model = WorkforceAllocation
        fields = "__all__"


class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True
    )
    location_name = serializers.SerializerMethodField()
    # NOTE: check_in_photo / check_out_photo are intentionally NOT declared
    # as SerializerMethodField. We let DRF auto-generate them as ImageFields
    # from the model so they can accept file uploads via multipart forms.
    # The to_representation override converts relative URLs to absolute.

    class Meta:
        model = Attendance
        fields = "__all__"
        # Approval is privileged: it must only be set via the approve/reject
        # actions (which check the manager role), never through a plain
        # create/update — otherwise an employee could self-approve their own
        # attendance and have it counted by payroll.
        read_only_fields = ["approval_status", "approved_by"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if data.get('check_in_photo'):
            data['check_in_photo'] = build_absolute_photo_url(instance.check_in_photo, request)
        if data.get('check_out_photo'):
            data['check_out_photo'] = build_absolute_photo_url(instance.check_out_photo, request)
        return data

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_location_name(self, obj):
        if obj.check_in_lat is None or obj.check_in_lng is None:
            return None
        from apps.gps.utils import reverse_geocode
        return reverse_geocode(float(obj.check_in_lat), float(obj.check_in_lng))


class EmploymentHistorySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    event_type_display = serializers.CharField(
        source="get_event_type_display", read_only=True
    )

    class Meta:
        model = EmploymentHistory
        fields = "__all__"


class PerformanceReviewSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    reviewer_name = serializers.CharField(
        source="reviewer.get_full_name", read_only=True
    )

    class Meta:
        model = PerformanceReview
        fields = "__all__"


class AvailabilitySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Availability
        fields = "__all__"
