"""ASGI root — routes HTTP and WebSocket connections."""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Initialize the Django app registry FIRST. get_asgi_application() runs
# django.setup(); the WebSocket routing (which imports models/simplejwt) must
# only be imported afterwards, or Django raises AppRegistryNotReady at startup.
django_asgi_app = get_asgi_application()

from apps.gps.routing import websocket_urlpatterns as gps_patterns  # noqa: E402
from apps.notifications.routing import websocket_urlpatterns as notif_patterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        # JWT authentication is handled inside the consumer.
        "websocket": URLRouter(gps_patterns + notif_patterns),
    }
)
