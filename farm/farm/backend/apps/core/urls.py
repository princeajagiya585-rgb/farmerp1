from django.urls import path
from . import views

urlpatterns = [
    path("audit/", views.AuditLogViewSet.as_view({"get": "list"}), name="audit-list"),
    path("audit/<uuid:pk>/", views.AuditLogViewSet.as_view({"get": "retrieve"}), name="audit-detail"),
]
