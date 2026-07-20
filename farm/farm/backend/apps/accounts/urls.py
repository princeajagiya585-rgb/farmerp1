from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    LoginView,
    NoThrottleTokenBlacklistView,
    NoThrottleTokenRefreshView,
    UserViewSet,
    forgot_password,
    phone_login,
    register_super_admin,
    reset_password,
    reset_super_admin,
    send_otp,
    verify_otp,
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("register/", register_super_admin, name="register-super-admin"),
    path("login/phone/", phone_login, name="phone-login"),
    path("login/send-otp/", send_otp, name="send-otp"),
    path("login/verify-otp/", verify_otp, name="verify-otp"),
    path("refresh/", NoThrottleTokenRefreshView.as_view(), name="token_refresh"),
    path("forgot-password/", forgot_password, name="forgot-password"),
    path("reset-password/", reset_password, name="reset-password"),
    path("logout/", NoThrottleTokenBlacklistView.as_view(), name="logout"),
    path("reset-super-admin/", reset_super_admin, name="reset-super-admin"),
    path("", include(router.urls)),
]
