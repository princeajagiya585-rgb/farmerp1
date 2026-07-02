import smtplib
import ssl
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.core.mail import send_mail
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import (
    action, api_view, permission_classes, throttle_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.core.permissions import IsSuperAdmin

from .otp import OTP
from .serializers import (
    ChangePasswordSerializer,
    FarmTokenObtainPairSerializer,
    ForgotPasswordSerializer,
    OtpSendSerializer,
    OtpVerifySerializer,
    PhoneLoginSerializer,
    ResetPasswordSerializer,
    UserCreateSerializer,
    UserSerializer,
)

User = get_user_model()


class LoginView(TokenObtainPairView):
    serializer_class = FarmTokenObtainPairSerializer


# ─── OTP & Phone Auth Endpoints ────────────────────────────────────────

@extend_schema(request=OtpSendSerializer, responses={200: {"type": "object", "properties": {"message": {"type": "string"}, "expires_in": {"type": "integer"}}}})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([])
def send_otp(request):
    """Send OTP to a phone number OR email. For demo, returns the OTP in response."""
    serializer = OtpSendSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    identifier = serializer.validated_data["identifier"]

    otp = OTP.generate(identifier)

    print(f"[OTP] {identifier} -> {otp.code}")

    payload = {
        "message": "OTP sent successfully.",
        "otp": otp.code,
        "expires_in": 600,
    }
    return Response(payload)


@extend_schema(request=OtpVerifySerializer, responses={200: {"type": "object"}})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([])
def verify_otp(request):
    """Verify an OTP and return JWT tokens on success."""
    serializer = OtpVerifySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    identifier = serializer.validated_data["identifier"]
    code = serializer.validated_data["otp"]

    success, otp = OTP.verify(identifier, code)
    if not success:
        reason = "Invalid or expired OTP."
        if otp and otp.is_expired:
            reason = "OTP has expired. Please request a new one."
        return Response({"detail": reason}, status=status.HTTP_400_BAD_REQUEST)

    # Find user by phone OR email
    user = User.objects.filter(phone=identifier).first()
    if not user:
        user = User.objects.filter(email=identifier).first()

    if not user:
        return Response(
            {"detail": "No account found with this phone number or email."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not user.is_active:
        return Response(
            {"detail": "This account is deactivated."},
            status=status.HTTP_403_FORBIDDEN,
        )

    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    refresh["full_name"] = user.get_full_name()

    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
    })


@extend_schema(request=PhoneLoginSerializer, responses={200: {"type": "object"}})
@api_view(["POST"])
@permission_classes([AllowAny])
def phone_login(request):
    """Login with phone + password, username + password, OR email + password."""
    serializer = PhoneLoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    identifier = serializer.validated_data["phone"]  # can be phone, username, or email
    password = serializer.validated_data["password"]

    # Try to find user by phone, then username, then email
    user = User.objects.filter(phone=identifier).first()
    if not user:
        user = User.objects.filter(username=identifier).first()
    if not user:
        user = User.objects.filter(email=identifier).first()

    if not user:
        return Response(
            {"detail": "No account found with this phone number, username, or email."},
            status=status.HTTP_404_NOT_FOUND,
        )

    user = authenticate(username=user.username, password=password)
    if not user:
        return Response(
            {"detail": "Invalid credentials."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.is_active:
        return Response(
            {"detail": "This account is deactivated."},
            status=status.HTTP_403_FORBIDDEN,
        )

    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    refresh["full_name"] = user.get_full_name()

    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
    })


# ─── Forgot / Reset Password ────────────────────────────────────────────

@extend_schema(request=ForgotPasswordSerializer, responses={200: {"type": "object", "properties": {"message": {"type": "string"}, "expires_in": {"type": "integer"}}}})
@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    """Send OTP to the Super Admin's email for password reset."""
    serializer = ForgotPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]

    user = User.objects.filter(email=email, role="SUPER_ADMIN").first()
    if not user:
        return Response(
            {"detail": "No Super Administrator account found with this email."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not user.is_active:
        return Response(
            {"detail": "This account is deactivated."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Generate OTP using email as the identifier (reusing OTP model with PASSWORD_RESET purpose)
    otp = OTP.generate(email, purpose="PASSWORD_RESET")

    # Send OTP via email
    subject = "FarmERP Pro - Password Reset OTP"
    message = f"""Hello {user.get_full_name() or user.username},

You requested a password reset for your FarmERP Pro Super Administrator account.

Your OTP code is: {otp.code}

This code expires in 10 minutes.

If you did not request this, please ignore this email.

- FarmERP Pro Team"""

    # Send OTP via email
    email_sent = False
    try:
        print(f"[EMAIL_LOG] Attempting to send OTP {otp.code} to {email}")
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

        with smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD)
            email_message = f"Subject: {subject}\n\n{message}"
            server.sendmail(settings.DEFAULT_FROM_EMAIL, [email], email_message)
            email_sent = True
    except Exception as e:
        print(f"[EMAIL_LOG] OTP email failed (SMTP not configured?): {e}")
        # Always return the OTP in the response so the user can still reset password
        # even when email/SMTP is not configured.

    payload = {
        "detail": "OTP sent to your email." if email_sent else "OTP generated (email delivery unavailable — use the OTP below).",
        "otp": otp.code,
        "expires_in": 600,
    }
    return Response(payload)


@extend_schema(request=ResetPasswordSerializer, responses={200: {"type": "object", "properties": {"detail": {"type": "string"}}}})
@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password(request):
    """Verify OTP and set a new password for the Super Admin."""
    serializer = ResetPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]
    code = serializer.validated_data["otp"]
    new_password = serializer.validated_data["new_password"]

    # Verify OTP
    success, otp = OTP.verify(email, code, purpose="PASSWORD_RESET")
    if not success:
        reason = "Invalid or expired OTP."
        if otp and otp.is_expired:
            reason = "OTP has expired. Please request a new one."
        return Response({"detail": reason}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(email=email, role="SUPER_ADMIN").first()
    if not user:
        return Response(
            {"detail": "No Super Administrator account found with this email."},
            status=status.HTTP_404_NOT_FOUND,
        )

    user.set_password(new_password)
    user.save()

    return Response({"detail": "Password reset successful. You can now log in with your new password."})


# ─── Existing UserViewSet ──────────────────────────────────────────────

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.prefetch_related("farms").all()
    filterset_fields = ["role", "is_active", "farms"]
    search_fields = ["username", "email", "first_name", "last_name", "phone"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return UserCreateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action in ("me", "change_password", "update_fcm"):
            return [IsAuthenticated()]
        return [IsSuperAdmin()]

    def perform_create(self, serializer):
        """Create the user, then auto-create an Employee record linked to it."""
        user = serializer.save()
        from apps.workforce.models import Employee
        if not Employee.objects.filter(user=user).exists():
            farms = list(user.farms.all())
            farm = farms[0] if farms else None
            if farm:
                # Generate a unique employee code
                base_code = f"EMP-{user.username}"
                code = base_code
                counter = 1
                while Employee.objects.filter(employee_code=code).exists():
                    code = f"{base_code}-{counter}"
                    counter += 1
                try:
                    category = Employee.Category.MANAGER if user.role == 'FARM_MANAGER' else Employee.Category.EMPLOYEE
                    Employee.objects.create(
                        user=user,
                        employee_code=code,
                        first_name=user.first_name or user.username,
                        last_name=user.last_name or "",
                        category=category,
                        employment_type=Employee.EmploymentType.PERMANENT,
                        farm=farm,
                        phone=user.phone or "",
                    )
                except Exception:
                    pass

    def perform_update(self, serializer):
        """Update the user, then sync name, farm & category to the linked Employee record."""
        user = serializer.save()
        from apps.workforce.models import Employee
        farms = list(user.farms.all())
        farm = farms[0] if farms else None
        employee = Employee.objects.filter(user=user).first()
        if employee:
            employee.first_name = user.first_name or user.username
            employee.last_name = user.last_name or ""
            employee.phone = user.phone or ""
            employee.category = Employee.Category.MANAGER if user.role == 'FARM_MANAGER' else Employee.Category.EMPLOYEE
            if farm:
                employee.farm = farm
            employee.save(update_fields=["first_name", "last_name", "phone", "farm", "category"])
        elif farm:
            base_code = f"EMP-{user.username}"
            code = base_code
            counter = 1
            while Employee.objects.filter(employee_code=code).exists():
                code = f"{base_code}-{counter}"
                counter += 1
            try:
                category = Employee.Category.MANAGER if user.role == 'FARM_MANAGER' else Employee.Category.EMPLOYEE
                Employee.objects.create(
                    user=user,
                    employee_code=code,
                    first_name=user.first_name or user.username,
                    last_name=user.last_name or "",
                    category=category,
                    employment_type=Employee.EmploymentType.PERMANENT,
                    farm=farm,
                    phone=user.phone or "",
                )
            except Exception:
                pass

    def perform_destroy(self, instance):
        """Permanently delete the user and their linked Employee record."""
        from apps.workforce.models import Employee
        Employee.objects.filter(user=instance).delete()
        instance.delete()

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """Re-enable a previously restricted (deactivated) user."""
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=["is_active"])
        from apps.workforce.models import Employee
        emp = Employee.objects.filter(user=user).first()
        if emp is not None and hasattr(emp, "is_active"):
            emp.is_active = True
            emp.save(update_fields=["is_active"])
        return Response(UserSerializer(user, context={"request": request}).data)

    @action(detail=False, methods=["get", "patch"])
    def me(self, request):
        if request.method == "PATCH":
            data = request.data.copy()
            # Nobody may change their own role / active status via /me/, nor
            # their username — it's the identity key for phone/OTP login lookups,
            # so self-service renames could enable impersonation or lockout.
            for f in ("role", "is_active", "username"):
                data.pop(f, None)
            # Regular users may only view their identity — super admins can edit
            # their own profile (name, contact, language, Aadhaar) from here.
            if request.user.role != "SUPER_ADMIN":
                for f in (
                    "aadhaar_number", "aadhaar_photo", "preferred_language",
                    "first_name", "last_name", "email", "phone",
                ):
                    data.pop(f, None)
            # Use UserCreateSerializer for PATCH since it has to_internal_value for FormData
            serializer = UserCreateSerializer(
                request.user, data=data, partial=True,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            user = serializer.save()
            return Response(UserSerializer(user, context={"request": request}).data)
        return Response(UserSerializer(request.user, context={"request": request}).data)

    @action(detail=False, methods=["post"])
    def change_password(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["old_password"]):
            return Response({"old_password": "Wrong password."}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        return Response({"detail": "Password updated."})

    @action(detail=False, methods=["post"])
    def update_fcm(self, request):
        request.user.fcm_token = request.data.get("fcm_token", "")
        request.user.save(update_fields=["fcm_token"])
        return Response({"detail": "FCM token updated."})
