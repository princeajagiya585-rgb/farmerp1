"""WebSocket consumer for live GPS location updates."""

import json
from datetime import timedelta

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from .utils import farm_group

User = get_user_model()


class LocationConsumer(AsyncWebsocketConsumer):
    """Broadcasts new location pings to all connected clients in real time.

    Clients authenticate by passing ``?token=<JWT_ACCESS_TOKEN>`` in the
    WebSocket URL.  Unauthenticated connections are rejected.
    """

    async def connect(self):
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

        # ── Join only the groups this user is allowed to see ──────────
        # Every account, super admins included, subscribes to its own farm
        # groups only. Super admins used to join LOCATION_GROUP — the firehose
        # every ping is also sent to — which streamed one tenant's live pings
        # and field activities straight into another tenant's Location Map and
        # Route Tracking, even though the REST list behind those pages is
        # farm-scoped. No role is in TENANT_GLOBAL_ROLES; nobody gets the
        # firehose.
        farm_ids = await self._user_farm_ids(user)
        self.groups_joined = [farm_group(fid) for fid in farm_ids]

        for group in self.groups_joined:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()

    @database_sync_to_async
    def _user_farm_ids(self, user):
        return list(user.farms.values_list("id", flat=True))

    async def disconnect(self, close_code):
        for group in getattr(self, "groups_joined", []):
            await self.channel_layer.group_discard(group, self.channel_name)

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
