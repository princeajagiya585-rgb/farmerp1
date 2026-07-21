import secrets
import string
from datetime import timedelta

from django.utils import timezone
from django.db import models


class OTP(models.Model):
    """Stores OTP codes for authentication (phone or email based)."""

    # Generic identifier field that can hold either phone number OR email
    identifier = models.CharField(max_length=255, db_index=True)
    code = models.CharField(max_length=6)
    purpose = models.CharField(max_length=20, default="LOGIN")  # LOGIN, PASSWORD_RESET
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"OTP {self.code} for {self.identifier} ({'used' if self.is_used else 'active'})"

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return not self.is_used and not self.is_expired

    @classmethod
    def generate(cls, identifier, purpose="LOGIN", expiry_minutes=10):
        """Generate a new OTP, invalidating previous unused ones."""
        # Invalidate previous unused OTPs for this identifier
        cls.objects.filter(identifier=identifier, purpose=purpose, is_used=False).update(is_used=True)

        code = "".join(secrets.choice(string.digits) for _ in range(6))
        now = timezone.now()
        otp = cls.objects.create(
            identifier=identifier,
            code=code,
            purpose=purpose,
            created_at=now,
            expires_at=now + timedelta(minutes=expiry_minutes),
        )
        return otp

    @classmethod
    def peek(cls, identifier, code, purpose="LOGIN"):
        """Validate an OTP WITHOUT consuming it. Returns (valid, reason).

        NB: named ``peek`` rather than ``check`` on purpose — Django's system
        check framework calls ``Model.check(**kwargs)``, so a classmethod named
        ``check`` here would shadow it and break ``manage.py check``/startup.

        Used by the standalone verify step so the code can be checked for real,
        server-side, before the user moves on — while the single actual use is
        still spent later by ``verify()`` at password reset. The match is an
        exact value comparison against the one active (unused) OTP for this
        identifier; a wrong value never matches, and length/format alone is
        never sufficient.

        reason is one of: None (valid), "invalid" (no such active code),
        "expired" (matched but past its 10-minute window).
        """
        otp = cls.objects.filter(
            identifier=identifier, code=code, purpose=purpose, is_used=False
        ).first()
        if otp is None:
            return False, "invalid"
        if otp.is_expired:
            return False, "expired"
        return True, None

    @classmethod
    def verify(cls, identifier, code, purpose="LOGIN"):
        """Verify an OTP and CONSUME it (single use). Returns (success, otp)."""
        otp = cls.objects.filter(
            identifier=identifier, code=code, purpose=purpose, is_used=False
        ).first()

        if otp is None:
            return False, None
        if otp.is_expired:
            return False, otp

        otp.is_used = True
        otp.save(update_fields=["is_used"])
        return True, otp
