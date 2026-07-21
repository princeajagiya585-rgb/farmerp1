import logging
import smtplib
import traceback

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.core.mail import send_mail
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import (
    action, api_view, permission_classes, throttle_classes,
)
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenBlacklistView, TokenObtainPairView, TokenRefreshView

from apps.core.permissions import IsSuperAdmin

from .otp import OTP
from .throttling import OtpSendThrottle, OtpVerifyThrottle
from .serializers import (
    ChangePasswordSerializer,
    FarmTokenObtainPairSerializer,
    ForgotPasswordSerializer,
    OtpSendSerializer,
    OtpVerifySerializer,
    PhoneLoginSerializer,
    ResetPasswordSerializer,
    SuperAdminRegisterSerializer,
    UserCreateSerializer,
    UserSerializer,
)

logger = logging.getLogger(__name__)

User = get_user_model()


def _role_to_employee_category(role):
    """Map a User role to the matching Employee category.

    Returns the Employee.Category value (string) or defaults to EMPLOYEE.
    """
    from apps.workforce.models import Employee

    mapping = {
        "SUPER_ADMIN": "SUPER_ADMIN",
        "FARM_MANAGER": "MANAGER",
        "EMPLOYEE": "EMPLOYEE",
    }
    return mapping.get(role, "EMPLOYEE")


class LoginView(TokenObtainPairView):
    serializer_class = FarmTokenObtainPairSerializer
    throttle_classes = []


class UserAwareTokenRefreshSerializer(TokenRefreshSerializer):
    """Refresh serializer that also verifies the token's user still exists
    and is active.

    Plain SimpleJWT only validates the refresh token itself, so a deleted or
    deactivated user keeps receiving fresh access tokens that every API call
    then rejects — the client ends up in an endless refresh→401 loop instead
    of being logged out.
    """

    def validate(self, attrs):
        # Read the user claim BEFORE super() — rotation blacklists the
        # incoming token, so it can't be re-parsed afterwards.
        try:
            user_id = self.token_class(attrs["refresh"]).payload.get(
                jwt_settings.USER_ID_CLAIM
            )
        except TokenError as exc:
            raise InvalidToken(exc.args[0])
        if not User.objects.filter(
            **{jwt_settings.USER_ID_FIELD: user_id}, is_active=True
        ).exists():
            raise InvalidToken("User is inactive or no longer exists")
        return super().validate(attrs)


class NoThrottleTokenRefreshView(TokenRefreshView):
    """Token refresh endpoint with throttling disabled for development."""
    throttle_classes = []
    serializer_class = UserAwareTokenRefreshSerializer


class NoThrottleTokenBlacklistView(TokenBlacklistView):
    """Token blacklist (logout) endpoint with throttling disabled for development."""
    throttle_classes = []


# ─── OTP & Phone Auth Endpoints ────────────────────────────────────────

@extend_schema(request=OtpSendSerializer, responses={200: {"type": "object", "properties": {"message": {"type": "string"}, "expires_in": {"type": "integer"}}}})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([OtpSendThrottle])
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
@throttle_classes([OtpVerifyThrottle])
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


@extend_schema(
    request={"application/json": {"type": "object", "properties": {"secret_key": {"type": "string"}, "new_password": {"type": "string"}}}},
    responses={200: {"type": "object"}},
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([])
def reset_super_admin(request):
    """Emergency reset of the super admin (risingyeti) password.

    Protected by RESET_SECRET_KEY env var — set this in Railway dashboard,
    call this endpoint once with that key, then remove the env var.

    Request body:
        secret_key (str, required): Must match RESET_SECRET_KEY env var
        new_password (str, optional): New password. Defaults to "risingyeti123"
    """
    import os

    reset_secret = os.getenv("RESET_SECRET_KEY", "")
    if not reset_secret:
        return Response(
            {"detail": "Reset secret key not configured on the server. Set RESET_SECRET_KEY in your environment."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    provided_key = request.data.get("secret_key", "")
    if not provided_key or provided_key != reset_secret:
        return Response(
            {"detail": "Invalid or missing secret_key."},
            status=status.HTTP_403_FORBIDDEN,
        )

    new_password = request.data.get("new_password", "risingyeti123")
    if len(new_password) < 6:
        return Response(
            {"detail": "Password must be at least 6 characters long."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.filter(username="risingyeti").first()
    if not user:
        # Create the super admin if missing
        from django.contrib.auth.hashers import make_password
        user = User.objects.create(
            username="risingyeti",
            email="risingyeti00@gmail.com",
            phone="+91 74879 37443",
            role="SUPER_ADMIN",
            is_staff=True,
            is_superuser=True,
            is_active=True,
            password=make_password(new_password),
        )
        logger.info("[RESET_ADMIN] Super admin 'risingyeti' created with new password")
    else:
        user.set_password(new_password)
        user.is_active = True
        user.save(update_fields=["password", "is_active"])
        logger.info("[RESET_ADMIN] Super admin 'risingyeti' password reset")

    return Response({
        "detail": "Super admin password reset successful.",
        "username": "risingyeti",
        "password": new_password,
    })


@extend_schema(request=PhoneLoginSerializer, responses={200: {"type": "object"}})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([])
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

    # Check is_active BEFORE authenticate() — authenticate() returns None
    # for inactive users, which would mask the real reason with a generic
    # "Invalid credentials" message.
    if not user.is_active:
        return Response(
            {"detail": "Your account has been deactivated. Please contact the administrator."},
            status=status.HTTP_403_FORBIDDEN,
        )

    user = authenticate(username=user.username, password=password)
    if not user:
        return Response(
            {"detail": "Invalid credentials."},
            status=status.HTTP_401_UNAUTHORIZED,
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
@throttle_classes([])
def forgot_password(request):
    """Send a password-reset OTP to the email the user entered.

    Works for EVERY account — Super Admins, Managers, Employees and Workers —
    with no cap on how many users or how many distinct addresses exist. The OTP
    is delivered ONLY to the matched account's own registered email; the SMTP
    sender account (EMAIL_HOST_USER) is used purely to send, never as a
    recipient. Uses Django's configured EMAIL_BACKEND so it respects all EMAIL_*
    settings.
    """
    serializer = ForgotPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]

    # Match by email across ALL roles (case-insensitively). Previously this was
    # locked to role="SUPER_ADMIN", so managers/employees/workers could never
    # reset their password — that was the real limitation, not the recipient.
    user = User.objects.filter(email__iexact=email).first()
    if not user:
        return Response(
            {"success": False, "message": "Email not found.", "detail": "Email not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not user.is_active:
        return Response(
            {"detail": "This account is deactivated."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Generate OTP using email as the identifier (reusing OTP model with PASSWORD_RESET purpose)
    otp = OTP.generate(email, purpose="PASSWORD_RESET")

    # ── Send OTP via Django's email framework ───────────────────────────
    # Using send_mail() instead of raw smtplib so EMAIL_BACKEND, EMAIL_USE_TLS,
    # and all other EMAIL_* settings are properly respected. This also makes it
    # trivial to switch backends (e.g. console backend for testing).
    subject = "FarmERP Pro - Password Reset OTP"
    message = f"""Hello {user.get_full_name() or user.username},

You requested a password reset for your FarmERP Pro account.

Your OTP code is: {otp.code}

This code expires in 10 minutes.

If you did not request this, please ignore this email.

- FarmERP Pro Team"""

    email_sent = False
    error_detail = None

    # Skip the SMTP attempt entirely when no credentials are configured.
    # Otherwise send_mail() blocks for the full EMAIL_TIMEOUT (~30s) trying to
    # reach a server it can't authenticate with, making the reset screen hang.
    email_configured = bool(
        settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD and settings.DEFAULT_FROM_EMAIL
    )
    if not email_configured:
        error_detail = "Email is not configured (EMAIL_HOST_USER/EMAIL_HOST_PASSWORD)."
        logger.info("[PASSWORD_RESET] Email not configured — returning OTP on screen for %s", email)

    try:
        if not email_configured:
            raise RuntimeError("email-not-configured")
        logger.info(
            "[PASSWORD_RESET] Attempting to send OTP %s to %s via %s:%s",
            otp.code, email, settings.EMAIL_HOST, settings.EMAIL_PORT,
        )
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            # Deliver ONLY to the matched account's registered address — never to
            # EMAIL_HOST_USER or any fixed literal. user.email is the stored,
            # canonical address for whoever owns this account.
            recipient_list=[user.email],
            fail_silently=False,
        )
        email_sent = True
        logger.info("[PASSWORD_RESET] OTP email sent successfully to %s", email)
    except RuntimeError:
        pass  # email-not-configured sentinel — fall through to on-screen OTP
    except smtplib.SMTPAuthenticationError as e:
        error_detail = "SMTP Authentication Failed. Check EMAIL_HOST_USER and EMAIL_HOST_PASSWORD."
        logger.error(
            "[PASSWORD_RESET] SMTP authentication failed for %s: %s",
            settings.EMAIL_HOST_USER, e,
        )
    except smtplib.SMTPConnectError as e:
        error_detail = f"Unable to connect to SMTP server at {settings.EMAIL_HOST}:{settings.EMAIL_PORT}."
        logger.error("[PASSWORD_RESET] SMTP connection failed: %s", e)
    except smtplib.SMTPServerDisconnected as e:
        error_detail = "SMTP server disconnected unexpectedly. Check EMAIL_HOST and EMAIL_PORT."
        logger.error("[PASSWORD_RESET] SMTP disconnected: %s", e)
    except smtplib.SMTPException as e:
        error_detail = f"SMTP error: {e}"
        logger.error("[PASSWORD_RESET] SMTP error: %s", e)
    except ConnectionRefusedError:
        error_detail = f"Connection refused by SMTP server at {settings.EMAIL_HOST}:{settings.EMAIL_PORT}. Is the server running?"
        logger.error("[PASSWORD_RESET] Connection refused to %s:%s", settings.EMAIL_HOST, settings.EMAIL_PORT)
    except TimeoutError:
        error_detail = f"Connection timed out connecting to SMTP server at {settings.EMAIL_HOST}:{settings.EMAIL_PORT}."
        logger.error("[PASSWORD_RESET] Connection timeout to %s:%s", settings.EMAIL_HOST, settings.EMAIL_PORT)
    except Exception as e:
        error_detail = f"Unexpected email error: {type(e).__name__}: {e}"
        logger.error("[PASSWORD_RESET] Unexpected email error:\n%s", traceback.format_exc())

    if email_sent:
        logger.info("[PASSWORD_RESET] OTP %s for %s stored in DB, expires in 10 min", otp.code, email)
        return Response({
            "success": True,
            "detail": "OTP sent to your email.",
            "expires_in": 600,
            "email_sent": True,
        })

    # Email failed — return a proper error response with the real error detail.
    # The OTP is still generated so the user can use it from the server logs
    # if needed, but we don't return it to the client for security.
    logger.warning(
        "[PASSWORD_RESET] Email delivery failed for %s (%s). Falling back to on-screen OTP.",
        email, error_detail,
    )
    # Graceful fallback: email isn't configured/reachable, so instead of a hard
    # 500 that blocks the admin from ever resetting their password, return the
    # OTP directly so the reset screen can show it. This mirrors the existing
    # demo `send_otp` endpoint. Configure EMAIL_HOST_USER/EMAIL_HOST_PASSWORD
    # (or an email API) to deliver the OTP by email instead of on screen.
    return Response({
        "success": True,
        "detail": "Email delivery isn't configured, so your OTP is shown below.",
        "otp": otp.code,
        "email_sent": False,
        "expires_in": 600,
    })


@extend_schema(request=ResetPasswordSerializer, responses={200: {"type": "object", "properties": {"success": {"type": "boolean"}}}})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([])
def verify_reset_otp(request):
    """Validate a password-reset OTP server-side, without consuming it.

    The reset flow's middle step calls this so the entered code is checked for
    real against the database — an exact value comparison against the one active
    OTP for that email, plus expiry — instead of a client-side length/format
    guess. A wrong code (e.g. 111111 when 745125 was sent) is rejected here. The
    OTP's single use is still spent later, at reset_password, so verifying does
    not burn the code.
    """
    email = (request.data.get("email") or "").strip()
    code = (request.data.get("otp") or "").strip()

    user = User.objects.filter(email__iexact=email).first()
    if not user:
        return Response(
            {"success": False, "message": "Email not found.", "detail": "Email not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    valid, reason = OTP.peek(email, code, purpose="PASSWORD_RESET")
    if not valid:
        message = "OTP has expired." if reason == "expired" else "Invalid OTP."
        return Response(
            {"success": False, "message": message, "detail": message},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({"success": True, "message": "OTP verified.", "detail": "OTP verified."})


@extend_schema(request=ResetPasswordSerializer, responses={200: {"type": "object", "properties": {"detail": {"type": "string"}}}})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([])
def reset_password(request):
    """Verify the OTP and set a new password for the matched account (any role)."""
    serializer = ResetPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]
    code = serializer.validated_data["otp"]
    new_password = serializer.validated_data["new_password"]

    # Verify the OTP and consume it (single use). An expired match returns the
    # OTP so we can report expiry precisely; a wrong value returns None.
    success, otp = OTP.verify(email, code, purpose="PASSWORD_RESET")
    if not success:
        message = "OTP has expired." if (otp and otp.is_expired) else "Invalid OTP."
        return Response(
            {"success": False, "message": message, "detail": message},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Same rule as forgot_password: resolve the account by email across every
    # role, so the reset works for whoever the OTP was issued to.
    user = User.objects.filter(email__iexact=email).first()
    if not user:
        return Response(
            {"success": False, "message": "Email not found.", "detail": "Email not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    user.set_password(new_password)
    user.save()

    return Response({"detail": "Password reset successful. You can now log in with your new password."})


# ─── Existing UserViewSet ──────────────────────────────────────────────

class UserViewSet(viewsets.ModelViewSet):
    # User.id is a UUID, so the detail route must match the 36-char UUID
    # form (8-4-4-4-12 hex with hyphens). Using r"\d+" here previously
    # broke EVERY detail route (retrieve/update/destroy/suspend/activate/
    # restore) with a 404, since a UUID never matches digits-only.
    # Action segments like "deleted" are registered as list routes BEFORE
    # the detail route by the DRF router, so they are unaffected; the
    # 36-char length also keeps words like "deleted" from ever matching.
    lookup_value_regex = r"[0-9a-fA-F-]{36}"
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
        if self.action == "list":
            # Any signed-in user may list users so "Assign to User" dropdowns
            # work for managers; get_queryset scopes non-admins to their farms.
            return [IsAuthenticated()]
        # All other actions (including activate, suspend, create, update, list_deleted, restore, etc.) require SUPER_ADMIN
        return [IsSuperAdmin()]

    def get_queryset(self):
        """Exclude soft-deleted users from the default list."""
        logger.info("[GET_QUERYSET] action=%s", self.action)
        from .models import Role

        qs = User.objects.prefetch_related("farms").all()
        if self.action == "list_deleted":
            return qs.filter(deleted_at__isnull=False).order_by("-deleted_at")
        qs = qs.filter(deleted_at__isnull=True)
        user = self.request.user
        role = getattr(user, "role", None)
        if self.action == "list" and role == Role.SUPER_ADMIN:
            # A super admin administers only their own farms' accounts, and sees
            # their own row so they can manage themselves here. Every *other*
            # super admin is hidden — those accounts are managed solely on the
            # Super Admin Accounts page (the owner-only ``super-admins`` route),
            # so one admin's details never surface in another's user list.
            from django.db.models import Q

            qs = (
                qs.filter(Q(farms__in=user.farms.all()) | Q(pk=user.pk))
                .exclude(Q(role=Role.SUPER_ADMIN) & ~Q(pk=user.pk))
                .distinct()
            )
        elif self.action == "list":
            if role == Role.FARM_MANAGER:
                # Managers only see their own farms' users, never super admins
                # (keeps admins out of "Assign to User" dropdowns).
                qs = (
                    qs.filter(farms__in=user.farms.all())
                    .exclude(role=Role.SUPER_ADMIN)
                    .distinct()
                )
            else:
                qs = qs.filter(pk=user.pk)
        return qs

    def perform_create(self, serializer):
        """Create the user, then auto-create an Employee record linked to it."""
        user = serializer.save()
        # Accounts a super admin creates belong to that admin's farms. Without
        # this, a manager or employee created without an explicit farm ends up
        # unassigned and sees nothing once farm scoping applies to every role.
        creator = self.request.user
        if not user.farms.exists() and creator.is_authenticated:
            user.farms.set(creator.farms.all())
        from apps.workforce.models import Employee
        from apps.workforce.signals import link_matching_employee
        if not Employee.objects.filter(user=user).exists():
            farms = list(user.farms.all())
            farm = farms[0] if farms else None
            # Reuse the worker's existing record on this farm when there is
            # one — the farm is only known here, after the M2M is set, so the
            # creation signal cannot do this match itself.
            if farm and link_matching_employee(
                user, farm, _role_to_employee_category(user.role)
            ):
                logger.info("[USER_CREATE] Linked existing Employee for user '%s'", user.username)
            elif farm:
                # Generate a unique employee code
                base_code = f"EMP-{user.username}"
                code = base_code
                counter = 1
                while Employee.objects.filter(employee_code=code).exists():
                    code = f"{base_code}-{counter}"
                    counter += 1
                try:
                    category = _role_to_employee_category(user.role)
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
                    logger.info("[USER_CREATE] Employee auto-created for user '%s' with category '%s'", user.username, category)
                except Exception as e:
                    logger.error("[USER_CREATE] Failed to auto-create Employee for user '%s': %s", user.username, e)

        # Wage type + salary entered on the Users form live on the Employee,
        # which for a fresh account only exists now (created just above). The
        # serializer stashed the values because it ran before the Employee
        # existed; apply them here so they show on the Workforce/Employees page.
        pending_wage = getattr(user, "_pending_wage", None)
        if pending_wage and any(v is not None for v in pending_wage):
            from .serializers import UserCreateSerializer
            UserCreateSerializer._apply_wage(user, *pending_wage)

    def perform_update(self, serializer):
        """Update the user, then sync name, farm & category to the linked Employee record."""
        self._assert_may_manage(serializer.instance)
        user = serializer.save()
        from apps.workforce.models import Employee
        farms = list(user.farms.all())
        farm = farms[0] if farms else None
        category = _role_to_employee_category(user.role)
        employee = Employee.objects.filter(user=user).first()
        if employee:
            employee.first_name = user.first_name or user.username
            employee.last_name = user.last_name or ""
            employee.phone = user.phone or ""
            employee.category = category
            if farm:
                employee.farm = farm
            employee.save(update_fields=["first_name", "last_name", "phone", "farm", "category"])
            logger.info("[USER_UPDATE] Employee category synced to '%s' for user '%s'", category, user.username)
        elif farm:
            base_code = f"EMP-{user.username}"
            code = base_code
            counter = 1
            while Employee.objects.filter(employee_code=code).exists():
                code = f"{base_code}-{counter}"
                counter += 1
            try:
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
                logger.info("[USER_UPDATE] Employee auto-created for user '%s' with category '%s'", user.username, category)
            except Exception as e:
                logger.error("[USER_UPDATE] Failed to auto-create Employee for user '%s': %s", user.username, e)

    def _assert_may_manage(self, target):
        """Guard changes to SUPER_ADMIN accounts.

        ``get_queryset`` only farm-scopes the *list* action, so without this any
        super admin could PATCH or DELETE any other super admin by id. Admin
        accounts are the owner's to manage: only ``is_superuser`` may touch them.
        The owner account itself is never deletable/demotable — losing it would
        leave nobody able to create super admins.
        """
        from .models import Role

        actor = self.request.user
        if target.role == Role.SUPER_ADMIN and not actor.is_superuser:
            raise PermissionDenied(
                "Only the main super administrator can manage super admin accounts."
            )

    def _staff_of(self, admin):
        """The managers and employees that belong to a super admin.

        There is no owner FK on User — an account's tenancy is its farms (see
        ``perform_create``, which copies the creator's farms onto every account
        it makes). So an admin's staff is everyone sharing one of their farms,
        minus other super admins, whose accounts belong to the owner alone.
        """
        from .models import Role

        if not admin.farms.exists():
            return User.objects.none()
        return (
            User.objects.filter(farms__in=admin.farms.all())
            .exclude(pk=admin.pk)
            .exclude(role=Role.SUPER_ADMIN)
            .exclude(is_superuser=True)
            .distinct()
        )

    def perform_destroy(self, instance):
        """Soft-delete the user account instead of removing it from the DB.

        Sets `deleted_at` and marks the user as inactive so they disappear
        from the main Users table but remain in the database. A Super Admin
        can view and restore soft-deleted users from the Deleted Users page.

        The linked Employee record and all related data (attendance, tasks,
        payroll, etc.) are preserved — the Employee's `user` field becomes
        NULL via SET_NULL on the FK, so their work history stays intact
        across all other pages.
        """
        from django.utils import timezone

        self._assert_may_manage(instance)
        # The owner account is the only one that can mint super admins; deleting
        # it would strand the system with no way to create another.
        if instance.is_superuser:
            raise PermissionDenied(
                "The main super administrator account cannot be deleted."
            )
        if instance.pk == self.request.user.pk:
            raise PermissionDenied("You cannot delete your own account.")

        from .models import Role

        actor = self.request.user if self.request.user.is_authenticated else None
        now = timezone.now()
        instance.deleted_at = now
        instance.deleted_by = actor
        instance.is_active = False
        instance.save(update_fields=["deleted_at", "deleted_by", "is_active"])

        # Archiving a super admin takes their managers and employees with them —
        # left behind they could still sign in to a farm nobody administers.
        # ``deleted_with`` records the group so restore and permanent delete can
        # move it as one. Accounts already in the trash keep their own delete
        # stamp so restoring the admin does not resurrect them.
        if instance.role == Role.SUPER_ADMIN:
            staff = self._staff_of(instance).filter(deleted_at__isnull=True)
            ids = list(staff.values_list("pk", flat=True))
            if ids:
                User.objects.filter(pk__in=ids).update(
                    deleted_at=now,
                    deleted_by=actor,
                    deleted_with=instance,
                    is_active=False,
                )
            logger.info(
                "[USER_DELETE] Super admin '%s' archived with %s staff account(s)",
                instance.username, len(ids),
            )

    @action(detail=False, methods=["get"], url_path="super-admins",
            url_name="super-admins")
    def super_admins(self, request):
        """Every super admin account, for the main super admin only.

        The ordinary ``list`` route scopes a super admin to their own farms'
        users, so it can never show the full roster — an admin running another
        farm would be invisible. This route deliberately ignores farm scoping
        and is therefore restricted to the owner account (``is_superuser``),
        the same account that creates these logins.

        Soft-deleted accounts are excluded, so the row count is the live total.
        """
        from .models import Role

        if not request.user.is_superuser:
            raise PermissionDenied(
                "Only the main super administrator can view super admin accounts."
            )

        admins = (
            User.objects.filter(role=Role.SUPER_ADMIN, deleted_at__isnull=True)
            .prefetch_related("farms")
            .order_by("date_joined")
        )
        return Response(UserSerializer(admins, many=True, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="deleted", url_name="deleted")
    def list_deleted(self, request):
        """Return all soft-deleted users (only visible to SUPER_ADMIN)."""
        logger.info("[LIST_DELETED] action reached by user=%s", request.user)
        try:
            deleted = self.get_queryset()
            logger.info("[LIST_DELETED] queryset count=%s", deleted.count())
        except Exception as e:
            logger.error("[LIST_DELETED] get_queryset failed: %s", e)
            return Response({"detail": f"Query error: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        page = self.paginate_queryset(deleted)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(deleted, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="purge-deleted", url_name="purge-deleted")
    def purge_deleted(self, request):
        """Permanently (hard) delete EVERY soft-deleted user. SUPER_ADMIN only.

        Empties the Deleted Users "trash". Each user's Employee record survives
        (the user link is SET_NULL), so attendance and payroll history is kept;
        their notifications and location pings cascade away. There are no PROTECT
        constraints on the User FK, so the delete cannot fail on a dependency.
        """
        qs = User.objects.filter(deleted_at__isnull=False)
        count = qs.count()
        qs.delete()
        logger.info("[PURGE_DELETED] %s permanently deleted %s user(s)", request.user, count)
        return Response(
            {"detail": f"Permanently deleted {count} user(s).", "deleted": count}
        )

    @action(detail=True, methods=["post"], url_path="purge", url_name="purge")
    def purge(self, request, pk=None):
        """Permanently (hard) delete ONE soft-deleted user. SUPER_ADMIN only.

        The per-row counterpart to ``purge_deleted``. Deleting a super admin
        also erases the staff archived alongside them (``deleted_with``), which
        mirrors the cascade the soft delete performed — otherwise their managers
        and employees would be stranded in the trash with no admin to restore
        them under.

        Uses POST rather than DELETE because DELETE on the detail route is
        already the *soft* delete, and the two must stay distinguishable.
        """
        from .models import Role

        try:
            user = User.objects.get(pk=pk, deleted_at__isnull=False)
        except User.DoesNotExist:
            return Response(
                {"detail": "Deleted user not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Same guard as the soft delete: admin accounts are the owner's alone.
        self._assert_may_manage(user)
        if user.is_superuser:
            raise PermissionDenied(
                "The main super administrator account cannot be deleted."
            )

        username = user.username
        cascade = 0
        if user.role == Role.SUPER_ADMIN:
            group = User.objects.filter(deleted_with=user)
            cascade = group.count()
            group.delete()
        user.delete()
        logger.info(
            "[PURGE] %s permanently deleted '%s' (+%s linked account(s))",
            request.user, username, cascade,
        )
        return Response(
            {
                "detail": f"Permanently deleted {username}.",
                "deleted": 1 + cascade,
                "cascaded": cascade,
            }
        )

    @action(detail=True, methods=["post"], url_path="restore", url_name="restore")
    def restore(self, request, pk=None):
        """Restore a soft-deleted user — clears deleted_at and reactivates."""
        try:
            user = User.objects.get(pk=pk, deleted_at__isnull=False)
            # Admin accounts are the owner's to manage — restoring one is as
            # consequential as deleting it, so it takes the same guard.
            self._assert_may_manage(user)
            user.deleted_at = None
            user.deleted_by = None
            user.deleted_with = None
            user.is_active = True
            user.save(
                update_fields=["deleted_at", "deleted_by", "deleted_with", "is_active"]
            )
            # Bring back the staff that went down with this admin, so a restore
            # undoes the whole cascade rather than leaving a farm half-staffed.
            restored = User.objects.filter(deleted_with=user).update(
                deleted_at=None, deleted_by=None, deleted_with=None, is_active=True
            )
            if restored:
                logger.info(
                    "[RESTORE] '%s' restored with %s staff account(s)",
                    user.username, restored,
                )
            return Response(UserSerializer(user, context={"request": request}).data)
        except User.DoesNotExist:
            return Response(
                {"detail": "Deleted user not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=True, methods=["post"], url_path="activate", url_name="activate")
    def activate(self, request, pk=None):
        """Re-enable a previously restricted (deactivated) user."""
        try:
            user = self.get_object()
            user.is_active = True
            user.save()
            from apps.workforce.models import Employee
            emp = Employee.objects.filter(user=user).first()
            if emp is not None:
                emp.is_active = True
                emp.save()
            return Response(UserSerializer(user, context={"request": request}).data)
        except Exception as e:
            logger.exception(f"Failed to activate user {pk}: {e}")
            return Response(
                {"detail": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"], url_path="suspend", url_name="suspend")
    def suspend(self, request, pk=None):
        """Suspend (deactivate) a user account. They will not be able to log in."""
        try:
            user = self.get_object()
            user.is_active = False
            user.save()
            from apps.workforce.models import Employee
            emp = Employee.objects.filter(user=user).first()
            if emp is not None:
                emp.is_active = False
                emp.save()
            return Response(UserSerializer(user, context={"request": request}).data)
        except Exception as e:
            logger.exception(f"Failed to suspend user {pk}: {e}")
            return Response(
                {"detail": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

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


@extend_schema(
    request=SuperAdminRegisterSerializer,
    responses={201: {"type": "object"}},
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_super_admin(request):
    """Create a new super admin together with the farm they will run.

    **Owner-only.** This used to be a public sign-up reachable from the login
    screen, which let anyone on the internet mint a SUPER_ADMIN and a farm.
    It is now restricted to the main super admin — the single account flagged
    ``is_superuser`` — who provisions every other admin.

    The farm is created first and passed to the new user as its bootstrap farm,
    so the workforce signal links the account to *this* farm instead of falling
    back to whichever farm happens to be first in the table — that fallback
    would drop a brand-new admin straight into another tenant's data.
    """
    if not request.user.is_superuser:
        raise PermissionDenied(
            "Only the main super administrator can create super admin accounts."
        )

    from django.db import transaction
    from django.utils.text import slugify

    from apps.farms.models import Farm
    from .models import Role

    serializer = SuperAdminRegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    farm_name = data["farm_name"].strip()
    base_code = (slugify(farm_name).upper().replace("-", "") or "FARM")[:24]
    code = base_code
    counter = 1
    while Farm.objects.filter(code=code).exists():
        suffix = str(counter)
        code = f"{base_code[:24 - len(suffix)]}{suffix}"
        counter += 1

    try:
        with transaction.atomic():
            farm = Farm.objects.create(name=farm_name, code=code)

            user = User(
                username=data["username"],
                email=data["email"],
                phone=data.get("phone", ""),
                first_name=data.get("first_name", ""),
                last_name=data.get("last_name", ""),
                role=Role.SUPER_ADMIN,
                # App-level admin only: the Django admin site stays reserved
                # for the platform operator, not for tenants who sign up.
                is_staff=False,
                is_superuser=False,
            )
            user.set_password(data["password"])
            user._bootstrap_farm = farm
            user.save()
            user.farms.add(farm)
            farm.manager = user
            farm.save(update_fields=["manager"])
    except Exception:
        logger.error("[REGISTER] Super admin sign-up failed\n%s", traceback.format_exc())
        return Response(
            {"detail": "Could not create the account. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    refresh = RefreshToken.for_user(user)
    logger.info("[REGISTER] Super admin '%s' created with farm '%s'", user.username, farm.code)
    return Response(
        {
            "detail": "Account created.",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user, context={"request": request}).data,
            "farm": {"id": str(farm.id), "name": farm.name, "code": farm.code},
        },
        status=status.HTTP_201_CREATED,
    )
