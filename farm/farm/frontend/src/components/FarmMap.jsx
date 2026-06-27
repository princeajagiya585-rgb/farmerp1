import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "../config/maps";

// Fix default Leaflet marker icon path
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Component to fit map bounds to markers
function FitBounds({ markers }) {
  const map = useMap();
  
  useEffect(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, markers]);

  return null;
}

export default function FarmMap({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  height = 420,
  markers = [],
}) {
  return (
    <div className="relative z-0">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height, width: "100%", borderRadius: 12 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map((marker) => (
          <Marker key={marker.id} position={[marker.lat, marker.lng]}>
            <Popup>
              <div className="font-semibold text-gray-800">{marker.label}</div>
              {marker.sublabel && <div className="text-xs text-gray-500">{marker.sublabel}</div>}
            </Popup>
          </Marker>
        ))}
        <FitBounds markers={markers} />
      </MapContainer>
    </div>
  );
}
