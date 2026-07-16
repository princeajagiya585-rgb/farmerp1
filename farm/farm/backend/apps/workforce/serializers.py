import re

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.utils import build_absolute_photo_url

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


from rest_framework import serializers
from .models import Employee

class EmployeeSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="user.role", read_only=True)

    
        
    name = serializers.CharField(required=False)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    assigned_farms = serializers.SerializerMethodField()
    assigned_farm_details = serializers.SerializerMethodField()
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
        fields = [
    "id", "name", "employee_code", "first_name", "last_name", "phone",
    "role",                     # <-- ADD THIS
    "employment_type", "designation", "farm", "farm_name", "assigned_farms", "assigned_farm_details",
    "department", "department_name", "skills", "skill_names", "skill_ids",
    "address", "photo", "photo_url", "is_active", "category", "user",
    "created_at", "updated_at", "wage_type", "daily_wage", "monthly_salary",
    "hourly_wage", "date_of_joining"
]
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

    @extend_schema_field(serializers.ListField())
    def get_assigned_farm_details(self, obj):
        """Farms the worker can check into: their primary farm plus any farms
        assigned to their user account. Used by the check-in farm picker."""
        seen = {}
        if obj.farm_id and obj.farm:
            seen[str(obj.farm_id)] = {"id": str(obj.farm_id), "name": obj.farm.name}
        if obj.user_id:
            for farm in obj.user.farms.all():
                seen[str(farm.id)] = {"id": str(farm.id), "name": farm.name}
        return list(seen.values())

    @extend_schema_field(serializers.ListField(child=serializers.IntegerField()))
    def get_skill_ids(self, obj):
        return [s.id for s in obj.skills.all()]

    def split_name(self, full_name):
        # Displayed names carry an " (M)" manager marker (Employee.name /
        # User.get_full_name). If a client echoes that display value back on
        # save, strip the marker so it never persists into first/last name.
        full_name = re.sub(r"\s*\(M\)\s*$", "", full_name.strip())
        parts = full_name.split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""
        return first_name, last_name

    def _auto_assign_category(self, validated_data, instance=None):
        """Auto-assign category from the linked User's role if a user is set.

        Mapping:
          User role SUPER_ADMIN   → Employee category SUPER_ADMIN
          User role FARM_MANAGER  → Employee category MANAGER
          User role EMPLOYEE      → Employee category EMPLOYEE

        This is only a DEFAULT: an explicitly submitted category always wins
        (including expanded categories like DRIVER/SECURITY/SUPERVISOR that
        have no matching login role), and an existing category is never
        clobbered on update.
        """
        # Respect an explicitly provided category.
        if "category" in validated_data:
            return validated_data
        # Don't overwrite a category that's already set on the instance.
        if instance is not None and getattr(instance, "category", None):
            return validated_data
        user = validated_data.get("user", getattr(instance, "user", None) if instance else None)
        if user:
            role_to_category = {
                "SUPER_ADMIN": "SUPER_ADMIN",
                "FARM_MANAGER": "MANAGER",
                "EMPLOYEE": "EMPLOYEE",
            }
            category = role_to_category.get(user.role)
            if category:
                validated_data["category"] = category
        return validated_data

    def create(self, validated_data):
        name = validated_data.pop("name", None)
        self._auto_assign_category(validated_data)
        if name:
            first_name, last_name = self.split_name(name)
            validated_data["first_name"] = first_name
            validated_data["last_name"] = last_name
        return super().create(validated_data)

    def update(self, instance, validated_data):
        name = validated_data.pop("name", None)
        self._auto_assign_category(validated_data, instance=instance)
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
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = WorkforceAllocation
        fields = "__all__"


class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True
    )
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)
    location_name = serializers.SerializerMethodField()
    check_in_photo_url = serializers.SerializerMethodField()
    check_out_photo_url = serializers.SerializerMethodField()
    # GPS coordinates (aliases for clarity)
    gps_in_latitude = serializers.DecimalField(source="check_in_lat", max_digits=9, decimal_places=6, read_only=True)
    gps_in_longitude = serializers.DecimalField(source="check_in_lng", max_digits=9, decimal_places=6, read_only=True)
    # Farm geofence data for frontend display
    farm_center_latitude = serializers.SerializerMethodField()
    farm_center_longitude = serializers.SerializerMethodField()
    geofence_radius = serializers.SerializerMethodField()
    # Geofence status: YES/NO based on check-in GPS vs farm center
    geofence_status_display = serializers.SerializerMethodField()
    # Check-out geofence status display
    check_out_geofence_status_display = serializers.SerializerMethodField()
    # Computed working hours fields for frontend display
    working_hours_formatted = serializers.SerializerMethodField()
    overtime_hours_formatted = serializers.SerializerMethodField()
    # NOTE: check_in_photo / check_out_photo remain as writable ImageFields
    # (auto-generated by DRF from the model) so they can accept file uploads
    # via multipart forms. The dedicated *_url fields below return absolute
    # URLs for the frontend, while the raw fields preserve writability.

    class Meta:
        model = Attendance
        fields = "__all__"
        # Approval is privileged: it must only be set via the approve/reject
        # actions (which check the manager role), never through a plain
        # create/update — otherwise an employee could self-approve their own
        # attendance and have it counted by payroll.
        read_only_fields = ["approval_status", "approved_by", "geofence_status", "working_seconds", "overtime_seconds"]

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_check_in_photo_url(self, obj):
        return build_absolute_photo_url(obj.check_in_photo, self.context.get('request'))

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_check_out_photo_url(self, obj):
        return build_absolute_photo_url(obj.check_out_photo, self.context.get('request'))

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_location_name(self, obj):
        # Prefer stored address over reverse geocoding
        if obj.check_in_address:
            return obj.check_in_address
        if obj.check_in_lat is None or obj.check_in_lng is None:
            return None
        from apps.gps.utils import reverse_geocode
        return reverse_geocode(float(obj.check_in_lat), float(obj.check_in_lng))

    @extend_schema_field(serializers.DecimalField(max_digits=9, decimal_places=6, allow_null=True))
    def get_farm_center_latitude(self, obj):
        """Return farm's center latitude for geofence calculation."""
        if obj.farm_id is None:
            return None
        return obj.farm.latitude

    @extend_schema_field(serializers.DecimalField(max_digits=9, decimal_places=6, allow_null=True))
    def get_farm_center_longitude(self, obj):
        """Return farm's center longitude for geofence calculation."""
        if obj.farm_id is None:
            return None
        return obj.farm.longitude

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_geofence_radius(self, obj):
        """Return farm's check-in radius for geofence validation."""
        if obj.farm_id is None:
            return None
        return getattr(obj.farm, 'check_in_radius', 100) or 100

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_geofence_status_display(self, obj):
        """Return YES/NO based on geofence_status field.

        This is the computed result from check-in GPS vs farm center.
        """
        if obj.geofence_status is None:
            return None
        return "YES" if obj.geofence_status else "NO"

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_check_out_geofence_status_display(self, obj):
        """Return YES/NO based on check_out_geofence_status field.

        This is the computed result from check-out GPS vs farm center.
        """
        if obj.check_out_geofence_status is None:
            return None
        return "YES" if obj.check_out_geofence_status else "NO"

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_working_hours_formatted(self, obj):
        """Return formatted working hours (e.g., '7h 30m')."""
        if not obj.working_seconds or obj.working_seconds == 0:
            return None
        hours = obj.working_seconds // 3600
        minutes = (obj.working_seconds % 3600) // 60
        if hours > 0:
            return f"{hours}h {minutes}m"
        return f"{minutes}m"

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_overtime_hours_formatted(self, obj):
        """Return formatted overtime hours (e.g., '1h 30m')."""
        if not obj.overtime_seconds or obj.overtime_seconds == 0:
            return None
        hours = obj.overtime_seconds // 3600
        minutes = (obj.overtime_seconds % 3600) // 60
        if hours > 0:
            return f"{hours}h {minutes}m"
        return f"{minutes}m"


class EmploymentHistorySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    farm_name = serializers.CharField(source="employee.farm.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    event_type_display = serializers.CharField(
        source="get_event_type_display", read_only=True
    )
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = EmploymentHistory
        fields = "__all__"


class PerformanceReviewSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    farm_name = serializers.CharField(source="employee.farm.name", read_only=True)
    reviewer_name = serializers.CharField(
        source="reviewer.get_full_name", read_only=True
    )
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = PerformanceReview
        fields = "__all__"


class AvailabilitySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    farm_name = serializers.CharField(source="employee.farm.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = Availability
        fields = "__all__"
