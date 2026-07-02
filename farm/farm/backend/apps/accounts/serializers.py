from django.conf import settings
from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


def build_absolute_photo_url(photo, request=None):
    """
    Convert a photo field to an absolute URL.
    When using S3 storage, photo.url already returns a full absolute URL
    (e.g. https://bucket.s3.amazonaws.com/media/photo.jpg), so we must
    NOT wrap it with build_absolute_uri again.
    """
    if not photo:
        return None
    url = photo.url
    if url.startswith(("http://", "https://")):
        return url
    if request:
        return request.build_absolute_uri(url)
    return f"{settings.BACKEND_URL}{url}"


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    farms = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    farm_names = serializers.SerializerMethodField()
    farm_ids = serializers.SerializerMethodField()
    aadhaar_photo_url = serializers.SerializerMethodField()
    aadhaar_submitted = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "first_name", "last_name", "full_name",
            "role", "preferred_language", "avatar", "is_active",
            "farms", "farm_names", "farm_ids", "fcm_token", "date_joined",
            "aadhaar_number", "aadhaar_photo", "aadhaar_photo_url", "aadhaar_submitted",
        ]
        read_only_fields = ["id", "date_joined", "role"]
        extra_kwargs = {
            "aadhaar_photo": {"required": False},
            "aadhaar_number": {"required": False},
            "fcm_token": {"write_only": True, "required": False},
        }

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_farm_names(self, instance):
        return [farm.name for farm in instance.farms.all()]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_farm_ids(self, instance):
        return [str(farm.id) for farm in instance.farms.all()]

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_aadhaar_photo_url(self, instance):
        return build_absolute_photo_url(instance.aadhaar_photo, self.context.get("request"))

    @extend_schema_field(serializers.BooleanField())
    def get_aadhaar_submitted(self, instance):
        return bool(instance.aadhaar_number or instance.aadhaar_photo)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Only include email and phone for SUPER_ADMIN
        if instance.role == "SUPER_ADMIN":
            data["email"] = instance.email
            data["phone"] = instance.phone
        return data


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    password2 = serializers.CharField(write_only=True, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    farms = serializers.PrimaryKeyRelatedField(
        many=True, queryset=__import__("apps.farms.models", fromlist=["Farm"]).Farm.objects.all(),
        required=False,
    )

    def to_internal_value(self, data):
        # Normalise `farms` into a clean list of ids regardless of how it was
        # sent: JSON array, multipart multi-value, or a comma-separated string.
        def _split(values):
            ids = []
            for v in values:
                if isinstance(v, str) and "," in v:
                    ids.extend(x.strip() for x in v.split(",") if x.strip())
                elif v not in (None, ""):
                    ids.append(v)
            return ids

        if hasattr(data, "getlist"):
            # QueryDict (multipart / FormData)
            data = data.copy()
            if "farms" in data:
                data.setlist("farms", _split(data.getlist("farms")))
        else:
            data = dict(data)
            if "farms" in data:
                raw = data["farms"]
                data["farms"] = _split(raw if isinstance(raw, list) else [raw])
        return super().to_internal_value(data)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "password", "password2", "first_name", "last_name",
            "role", "phone", "preferred_language", "farms",
            "aadhaar_number", "aadhaar_photo",
        ]
        extra_kwargs = {
            "aadhaar_number": {"required": False},
            "aadhaar_photo": {"required": False},
        }

    def validate(self, attrs):
        password = attrs.get("password")
        password2 = attrs.get("password2")
        if password and password != password2:
            raise serializers.ValidationError({"password2": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("password2", None)
        farms = validated_data.pop("farms", [])
        password = validated_data.pop("password")
        # Set default email and phone if not provided
        if not validated_data.get("email"):
            validated_data["email"] = f"{validated_data['username']}@example.com"
        if not validated_data.get("phone"):
            validated_data["phone"] = ""
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        if farms:
            user.farms.set(farms)
        return user

    def update(self, instance, validated_data):
        validated_data.pop("password2", None)
        password = validated_data.pop("password", None)
        farms = validated_data.pop("farms", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        if farms is not None:
            instance.farms.set(farms)
        instance.save()
        return instance


class FarmTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds role + profile to the JWT response. Accepts username, email, or phone."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["full_name"] = user.get_full_name()
        return token

    def validate(self, attrs):
        # Allow login with username, email, or phone as the identifier
        identifier = attrs.get(self.username_field)
        password = attrs.get("password")

        if identifier and password:
            # Try to find user by username, then email, then phone
            user = (
                User.objects.filter(username=identifier).first()
                or User.objects.filter(email=identifier).first()
                or User.objects.filter(phone=identifier).first()
            )
            if user is not None:
                # Override with the actual username so authenticate() works
                attrs[self.username_field] = user.username

        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user, context=self.context).data
        return data


class OtpSendSerializer(serializers.Serializer):
    identifier = serializers.CharField(required=True, help_text="Phone number or email to send OTP to")


class OtpVerifySerializer(serializers.Serializer):
    identifier = serializers.CharField(required=True)
    otp = serializers.CharField(required=True, min_length=6, max_length=6)


class PhoneLoginSerializer(serializers.Serializer):
    """Accepts phone number OR username OR email as the identifier."""
    phone = serializers.CharField(required=True, help_text="Phone number or username or email")
    password = serializers.CharField(required=True, write_only=True)


class OtpLoginSerializer(serializers.Serializer):
    phone = serializers.CharField(required=True)
    otp = serializers.CharField(required=True, min_length=6, max_length=6)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=6)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    otp = serializers.CharField(required=True, min_length=6, max_length=6)
    new_password = serializers.CharField(required=True, min_length=6)
