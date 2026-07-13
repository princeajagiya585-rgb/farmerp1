import { MapContainer, TileLayer, Polygon, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, Fragment } from "react";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "../config/maps";

// Fix default Leaflet marker icon path (same as FarmMap).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const COLORS = ["#16a34a", "#2563eb", "#d97706", "#db2777", "#7c3aed", "#0891b2"];

// A small numbered dot marker for a corner (1..4).
const cornerIcon = (n, color) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;width:18px;height:18px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${n}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 18 });
    }
  }, [map, points]);
  return null;
}

// areas: [{ id, name, corners: [[lat,lng], ...] }]
export default function GeofencePreviewMap({ areas = [], height = 360 }) {
  const valid = areas.filter((a) => Array.isArray(a.corners) && a.corners.length >= 3);
  const allPoints = valid.flatMap((a) => a.corners);
  const center = allPoints.length ? allPoints[0] : DEFAULT_CENTER;

  return (
    <div className="relative z-0">
      <MapContainer center={center} zoom={DEFAULT_ZOOM} style={{ height, width: "100%", borderRadius: 12 }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {valid.map((a, ai) => {
          const color = COLORS[ai % COLORS.length];
          return (
            <Fragment key={a.id ?? ai}>
              <Polygon positions={a.corners} pathOptions={{ color, weight: 2, fillOpacity: 0.15 }}>
                <Tooltip sticky>{a.name}</Tooltip>
              </Polygon>
              {a.corners.map((c, i) => (
                <Marker key={`${a.id ?? ai}-${i}`} position={c} icon={cornerIcon(i + 1, color)}>
                  <Popup>
                    <div className="font-semibold text-gray-800">{a.name}</div>
                    <div className="text-xs text-gray-500">Corner {i + 1}</div>
                    <div className="font-mono text-xs">{String(c[0])}, {String(c[1])}</div>
                  </Popup>
                </Marker>
              ))}
            </Fragment>
          );
        })}
        <FitBounds points={allPoints} />
      </MapContainer>
    </div>
  );
}
