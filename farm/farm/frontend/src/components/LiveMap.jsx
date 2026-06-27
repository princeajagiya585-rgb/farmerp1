import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MAPTILER_TILE_URL,
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from "../config/maps";

// Fix default Leaflet marker icon paths (bundlers strip them otherwise).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Fit the viewport to whatever points are on the map.
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 15);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    }
  }, [map, points]);
  return null;
}

// Leaflet renders a grey/blank map when it mounts inside a container that
// sizes after the map (cards, tabs, flex). Recompute size once mounted and
// whenever the window resizes so tiles always paint.
function Resizer() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const t1 = setTimeout(fix, 100);
    const t2 = setTimeout(fix, 400);
    window.addEventListener("resize", fix);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", fix);
    };
  }, [map]);
  return null;
}

/**
 * Interactive GPS-tracking map.
 *  - markers: [{ id, lat, lng, label?, sublabel? }]
 *  - path:    [[lat,lng], ...] to draw a route line
 * Uses the configured MapTiler key and falls back to OpenStreetMap tiles if
 * the key is absent or the tiles fail to load — so it never renders blank.
 */
export default function LiveMap({ markers = [], path = [], height = 420 }) {
  const [useOsm, setUseOsm] = useState(true);

  const points = useMemo(() => {
    const pts = markers
      .filter((m) => m.lat != null && m.lng != null)
      .map((m) => [Number(m.lat), Number(m.lng)]);
    path.forEach((p) => p && p[0] != null && pts.push([Number(p[0]), Number(p[1])]));
    return pts;
  }, [markers, path]);

  const center = points[0] || DEFAULT_CENTER;

  return (
    <div className="relative z-0 overflow-hidden rounded-xl">
      <MapContainer
        center={center}
        zoom={points.length ? 13 : DEFAULT_ZOOM}
        style={{ height, width: "100%", borderRadius: 12 }}
        scrollWheelZoom
      >
        <TileLayer
          attribution={OSM_ATTRIBUTION}
          url={useOsm ? OSM_TILE_URL : MAPTILER_TILE_URL}
          eventHandlers={{ tileerror: () => !useOsm && setUseOsm(true) }}
        />

        {path.length > 1 && (
          <Polyline positions={path} pathOptions={{ color: "#15803d", weight: 4, opacity: 0.8 }} />
        )}

        {markers
          .filter((m) => m.lat != null && m.lng != null)
          .map((m) => (
            <Marker key={m.id} position={[Number(m.lat), Number(m.lng)]}>
              <Popup>
                <div className="font-semibold text-gray-800">{m.label || "Location"}</div>
                {m.sublabel && <div className="text-xs text-gray-500">{m.sublabel}</div>}
              </Popup>
            </Marker>
          ))}

        <FitBounds points={points} />
        <Resizer />
      </MapContainer>

      {markers.length > 0 && (
        <div className="pointer-events-none absolute right-3 top-3 z-[400] rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-soft backdrop-blur">
          {markers.length} point{markers.length !== 1 ? "s" : ""} on map
        </div>
      )}
    </div>
  );
}
