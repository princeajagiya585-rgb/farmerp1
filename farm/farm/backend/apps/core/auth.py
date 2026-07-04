from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed


class ActiveJWTAuthentication(JWTAuthentication):
    """JWT authentication that rejects deactivated users on every request.

    The standard ``JWTAuthentication`` only validates the token signature
    and expiry — it does **not** check ``user.is_active`` on every request.
    This means a deactivated user can still use their existing JWT tokens
    until they expire (24 h by default).

    By overriding ``get_user()`` we add an active-status check so that
    as soon as an admin deactivates a user, **all** their tokens are
    immediately rejected (401) and they can no longer access any API
    endpoint — no need to wait for token expiry.
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not user.is_active:
            raise AuthenticationFailed(
                {
                    "detail": "Your account has been deactivated. "
                              "Please contact the administrator.",
                },
                code="user_deactivated",
            )
        return user
