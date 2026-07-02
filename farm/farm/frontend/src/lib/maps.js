/**
 * Shared map utilities for opening Google Maps with GPS coordinates.
 * Uses window.open so Flutter WebView can intercept via onCreateWindow,
 * with a fallback to window.location.href if the popup is blocked.
 */

/**
 * Open a valid Google Maps URL in a new tab / system browser.
 */
export function openMapUrl(lat, lng) {
  if (lat == null || lng == null) return;
  const url = buildMapsUrl(lat, lng);
  const win = window.open(url, '_blank');
  if (!win || win.closed || typeof win.closed === 'undefined') {
    window.location.href = url;
  }
}

/**
 * Build a Google Maps search URL from lat/lng coordinates.
 * Uses the official Google Maps URLs API format for deep linking.
 */
export function buildMapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/**
 * Validate that coordinates are usable for maps.
 */
export function hasValidCoords(lat, lng) {
  return lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng));
}
