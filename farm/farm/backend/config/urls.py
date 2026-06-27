from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.static import serve as static_serve
from django.views.generic import TemplateView
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)


# Root URL view - returns API info
def api_root(request):
    from django.http import JsonResponse
    return JsonResponse({
        "name": "FarmERP Pro API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/api/docs/",
        "schema": "/api/schema/",
    })

api_v1 = [
    path("auth/", include("apps.accounts.urls")),
    path("farms/", include("apps.farms.urls")),
    path("workforce/", include("apps.workforce.urls")),
    path("payroll/", include("apps.payroll.urls")),
    path("tasks/", include("apps.tasks.urls")),
    path("agronomy/", include("apps.agronomy.urls")),
    path("inventory/", include("apps.inventory.urls")),
    path("documents/", include("apps.documents.urls")),
    path("finance/", include("apps.finance.urls")),
    path("gps/", include("apps.gps.urls")),
    path("notifications/", include("apps.notifications.urls")),
    path("reporting/", include("apps.reporting.urls")),
    path("breakdowns/", include("apps.breakdowns.urls")),
    path("assets/", include("apps.assets.urls")),
    path("core/", include("apps.core.urls")),
]

urlpatterns = [
    path("", api_root, name="api-root"),  # Root URL - API info
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]

# Serve media files in both dev and production
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    # In production (DEBUG=False), Django doesn't serve media automatically.
    # WhiteNoise serves static files but not media uploads, so add an explicit
    # route so uploaded photos (attendance, field-activity, etc.) are accessible.
    urlpatterns += [
        path("media/<path:path>", static_serve, {"document_root": settings.MEDIA_ROOT}),
    ]
