"""WebSocket consumer for real-time in-app notifications."""

import asyncio
import json

from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth import get_user_model
from django.core.serializers.json import DjangoJSONEncoder
from rest_framework_simplejwt.tokens import AccessToken

from .services import register_event_loop

User = get_user_model()


class NotificationConsumer(AsyncWebsocketConsumer):
    """Sends new notifications to the individual user in real time.

    Each user gets a personal group ``notifications_{user_id}`` so that
    only the intended recipient receives the push.

    Clients authenticate by passing ``?token=<JWT_ACCESS_TOKEN>`` in the
    WebSocket URL.
    """

    async def connect(self):
        # ── Authenticate via JWT query parameter ──────────────────────
        token = self.scope.get("query_string", b"").decode()
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
        self.group_name = f"notifications_{user.id}"

        # ── Join the user's personal notification group ───────────────
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        # Remember this (the ASGI server) event loop so notify() — usually called
        # from a sync worker thread — can deliver onto it via the in-memory layer.
        register_event_loop(asyncio.get_running_loop())
        await self.accept()

    async def disconnect(self, close_code):
        # group_name only exists after a successful, authenticated connect();
        # rejected connections (close 4001) disconnect without ever joining.
        group_name = getattr(self, "group_name", None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    # ── Handler for messages sent by the channel layer ────────────────
    async def notify(self, event):
        """Forward a new notification payload to the client."""
        # DjangoJSONEncoder handles UUIDs, datetimes and Decimals in the payload.
        await self.send(text_data=json.dumps(event["data"], cls=DjangoJSONEncoder))
