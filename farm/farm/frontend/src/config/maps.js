// Central map / GPS-tracking configuration.
// The tracking key lives in frontend/.env as VITE_LOCATION_TRACKING_API_KEY.
export const MAPS_API_KEY = import.meta.env.VITE_LOCATION_TRACKING_API_KEY || "";

if (!MAPS_API_KEY) {
  console.warn(
    "[MAPS] VITE_LOCATION_TRACKING_API_KEY is not set. " +
    "Map tiles will fall back to OpenStreetMap (no API key needed, but rate-limited). " +
    "For better map rendering, get a free key at https://cloud.maptiler.com/account/keys/"
  );
}

// MapTiler raster tiles (used when a key is configured). If the key is missing
// or the tiles fail to load, the map automatically falls back to OpenStreetMap
// so it always renders without errors.
export const MAPTILER_TILE_URL = MAPS_API_KEY
  ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${MAPS_API_KEY}`
  : "";

export const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Default map center (India) used when there are no points to show.
export const DEFAULT_CENTER = [19.6901, 61.0245];
export const DEFAULT_ZOOM = 5;
