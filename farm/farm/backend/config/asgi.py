"""ASGI root — routes HTTP and WebSocket connections."""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Import WebSocket URL patterns AFTER Django is fully loaded.
from apps.gps.routing import websocket_urlpatterns as gps_patterns  # noqa: E402
from apps.notifications.routing import websocket_urlpatterns as notif_patterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        # JWT authentication is handled inside the consumer.
        "websocket": URLRouter(gps_patterns + notif_patterns),
    }
)
