from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView

from .views import LoginView, UserViewSet, forgot_password, reset_password, send_otp, verify_otp, phone_login

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("login/phone/", phone_login, name="phone-login"),
    path("login/send-otp/", send_otp, name="send-otp"),
    path("login/verify-otp/", verify_otp, name="verify-otp"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("forgot-password/", forgot_password, name="forgot-password"),
    path("reset-password/", reset_password, name="reset-password"),
    path("logout/", TokenBlacklistView.as_view(), name="logout"),
    path("", include(router.urls)),
]
