"""Geospatial helpers for GPS activity tracking and shared broadcast utility."""
import math
from functools import lru_cache

import requests
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings


LOCATION_GROUP = "locations"


def broadcast_ping(instance, request=None):
    """Send a location ping to all connected WebSocket clients (best-effort).

    Call this after creating a LocationPing so that connected clients receive
    the update in real time.  This function is shared across the gps and
    workforce apps.

    Pass ``request`` so the serializer can build absolute photo URLs.
    """
    try:
        from .serializers import LocationPingSerializer
        ctx = {"request": request} if request else {}
        data = LocationPingSerializer(instance, context=ctx).data
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            LOCATION_GROUP,
            {"type": "location.ping", "data": data},
        )
    except Exception:
        pass


def broadcast_field_activity(instance):
    """Send a field activity update to all connected WebSocket clients (best-effort).

    Call this after creating a FieldActivity so that the GPS Location Map
    page receives the update in real time.
    """
    try:
        from .serializers import FieldActivitySerializer
        data = FieldActivitySerializer(instance).data
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            LOCATION_GROUP,
            {"type": "field_activity", "data": data},
        )
    except Exception:
        pass


def haversine_m(lat1, lng1, lat2, lng2):
    """Great-circle distance between two points in metres."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def point_in_polygon(lat, lng, polygon):
    """Ray-casting test. `polygon` is a list of [lat, lng] pairs."""
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        yi, xi = float(polygon[i][0]), float(polygon[i][1])
        yj, xj = float(polygon[j][0]), float(polygon[j][1])
        if ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


# ── Simple in-memory cache for reverse geocoding ────────────────────
# Keys are "lat,lng" strings, values are display_name strings.
# Using lru_cache so repeated lookups of the same coords hit memory.


def _locationiq_url(lat, lng):
    """Build the LocationIQ reverse-geocode URL for a lat/lng point."""
    key = getattr(settings, "LOCATIONIQ_API_KEY", "")
    if not key:
        return None
    return (
        f"https://us1.locationiq.com/v1/reverse"
        f"?key={key}&lat={lat}&lon={lng}&format=json&zoom=14"
    )


@lru_cache(maxsize=512)
def reverse_geocode(lat, lng):
    """Return a human-readable place name for a lat/lng point.

    Tries LocationIQ reverse-geocoding API first (requires API key).
    Falls back to OpenStreetMap Nominatim (free, no key required but
    rate-limited to ~1 req/s and must include a meaningful User-Agent).

    Results are cached in memory (LRU, max 512 entries) so repeated
    lookups of the same coordinates don't hit the network.

    Returns None if all geocoding attempts fail.
    """
    name = _try_locationiq(lat, lng)
    if name:
        return name
    return _try_nominatim(lat, lng)


def _try_locationiq(lat, lng):
    """Attempt reverse geocode via LocationIQ."""
    url = _locationiq_url(lat, lng)
    if url is None:
        return None
    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        return data.get("display_name", None) or None
    except Exception:
        return None


def _try_nominatim(lat, lng):
    """Attempt reverse geocode via OSM Nominatim (free tier).
    Not separately cached because the outer `reverse_geocode` is already
    LRU-cached, so each (lat, lng) pair is fetched at most once.
    """
    url = (
        f"https://nominatim.openstreetmap.org/reverse"
        f"?lat={lat}&lon={lng}&format=json&zoom=14&addressdetails=0"
    )
    try:
        resp = requests.get(
            url,
            timeout=5,
            headers={
                "User-Agent": "FarmERP/1.0 (gps-tracking)",
                "Accept-Language": "en",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("display_name", None) or None
    except Exception:
        return None


def location_inside_farm(farm, lat, lng):
    """Return True/False if a point is inside the farm's geofences, or None
    if the farm or coordinates are missing (verification not possible)."""
    if farm is None or lat is None or lng is None:
        return None
    lat, lng = float(lat), float(lng)
    has_fence = False

    for gf in farm.geofences.all():
        if gf.polygon and len(gf.polygon) >= 3:
            has_fence = True
            if point_in_polygon(lat, lng, gf.polygon):
                return True
        if gf.radius_m and gf.center_lat is not None and gf.center_lng is not None:
            has_fence = True
            if haversine_m(lat, lng, float(gf.center_lat), float(gf.center_lng)) <= gf.radius_m:
                return True

    if farm.geofence and len(farm.geofence) >= 3:
        has_fence = True
        if point_in_polygon(lat, lng, farm.geofence):
            return True

    return False if has_fence else None
