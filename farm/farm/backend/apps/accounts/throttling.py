"""Rate throttles for the passwordless OTP endpoints.

Without these, ``send_otp``/``verify_otp`` (both AllowAny) let an attacker
request unlimited codes and brute-force the 6-digit OTP for any account — a
passwordless takeover. Throttling by identifier caps guesses per account well
below the 10^6 code space within the 10-minute OTP window.
"""
from rest_framework.throttling import SimpleRateThrottle


class _IdentifierThrottle(SimpleRateThrottle):
    """Throttle keyed by the target identifier (phone/email), falling back to
    the client IP when no identifier is supplied."""

    def get_cache_key(self, request, view):
        identifier = (request.data.get("identifier") or "").strip().lower()
        ident = identifier or self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class OtpSendThrottle(_IdentifierThrottle):
    scope = "otp_send"


class OtpVerifyThrottle(_IdentifierThrottle):
    scope = "otp_verify"
