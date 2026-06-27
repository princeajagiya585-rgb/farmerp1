"""WebSocket URL patterns for the GPS app."""

from django.urls import re_path

from .consumers import LocationConsumer

websocket_urlpatterns = [
    re_path(r"^ws/gps/live/$", LocationConsumer.as_asgi()),
]
