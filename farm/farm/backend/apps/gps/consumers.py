"""WebSocket consumer for live GPS location updates."""

import json
from datetime import timedelta

from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()


class LocationConsumer(AsyncWebsocketConsumer):
    """Broadcasts new location pings to all connected clients in real time.

    Clients authenticate by passing ``?token=<JWT_ACCESS_TOKEN>`` in the
    WebSocket URL.  Unauthenticated connections are rejected.
    """

    async def connect(self):
        self.group_name = "locations"

        # ── Authenticate via JWT query parameter ──────────────────────
        token = self.scope.get("query_string", b"").decode()
        # Parse query string manually (simple key=value, no library needed)
        params = dict(p.split("=", 1) for p in token.split("&") if "=" in p)
        raw_token = params.get("token", "")

        user = None
        if raw_token:
            try:
                access = AccessToken(raw_token)
                user = await User.objects.aget(id=access["user_id"])
            except Exception:
                user = None

        if user is None or not user.is_active:
            await self.close(code=4001)
            return

        self.user = user

        # ── Join the global broadcast group ──────────────────────────
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # ── Handlers for messages sent by the channel layer ───────────────
    async def location_ping(self, event):
        """Forward a new location ping payload to the client."""
        await self.send(text_data=json.dumps({
            "_type": "location_ping",
            **event["data"],
        }))

    async def field_activity(self, event):
        """Forward a new field activity payload to the client."""
        await self.send(text_data=json.dumps({
            "_type": "field_activity",
            "activity": event["data"],
        }))
