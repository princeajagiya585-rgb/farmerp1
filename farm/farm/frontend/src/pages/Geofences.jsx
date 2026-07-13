import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { MapPin } from "lucide-react";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const farmRepo = resource("farms");

// Full-precision coordinate (no rounding) — whatever the user typed is kept.
const coord = (v) => (v == null || v === "" ? "" : String(v));

// Expand a polygon outward from its centroid by `meters` so a worker within
// that many metres of the marked area still counts as inside (GPS tolerance).
// Returns a list of [lat, lng] with full precision.
const bufferPolygon = (corners, meters) => {
  const pts = (Array.isArray(corners) ? corners : [])
    .map((c) => [Number(c[0]), Number(c[1])])
    .filter((c) => !Number.isNaN(c[0]) && !Number.isNaN(c[1]));
  const m = Number(meters) || 0;
  if (pts.length < 3 || m <= 0) return pts;
  const cLat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cLng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((cLat * Math.PI) / 180) || 1e-9;
  return pts.map(([lat, lng]) => {
    const dym = (lat - cLat) * mPerDegLat;
    const dxm = (lng - cLng) * mPerDegLng;
    const len = Math.hypot(dxm, dym) || 1e-9;
    const scale = (len + m) / len;
    return [cLat + (lat - cLat) * scale, cLng + (lng - cLng) * scale];
  });
};

export default function Geofences() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  // After a geofence is saved, push the buffered polygon + tolerance onto the
  // farm itself so attendance check-in (which reads farm.geofence /
  // check_in_radius) marks anyone inside the area (± tolerance) as Present.
  const syncFarm = async (record) => {
    if (!record?.farm) return;
    const buffered = bufferPolygon(record.polygon, record.radius_m);
    await farmRepo.update(record.farm, {
      geofence: buffered,
      check_in_radius: Number(record.radius_m) || 0,
    });
  };

  const cornerCell = (pts, i) => {
    const p = Array.isArray(pts) ? pts[i] : null;
    return p && p[0] != null && p[1] != null ? (
      <span className="font-mono text-[11px]">{coord(p[0])}, {coord(p[1])}</span>
    ) : (
      <span className="text-gray-300">—</span>
    );
  };

  return (
    <CrudResource
      title={t("geofences.title")}
      subtitle={t("geofences.subtitle")}
      path="gps/geofences"
      showFarmFilter
      canWrite={canWrite}
      defaultValues={{ name: "Farm area", radius_m: 10 }}
      onSaved={syncFarm}
      columns={[
        { key: "farm_name", header: t("header.farm") },
        {
          key: "c1",
          header: "Corner 1 (Lat / Lng)",
          render: (r) => (
            <span className="flex items-center gap-1">
              <MapPin size={11} className="text-brand-500" />
              {cornerCell(r.polygon, 0)}
            </span>
          ),
        },
        { key: "c2", header: "Corner 2", render: (r) => cornerCell(r.polygon, 1) },
        { key: "c3", header: "Corner 3", render: (r) => cornerCell(r.polygon, 2) },
        { key: "c4", header: "Corner 4", render: (r) => cornerCell(r.polygon, 3) },
        {
          key: "radius_m",
          header: "Tolerance (m)",
          render: (r) => (r.radius_m != null ? `${r.radius_m} m` : "—"),
        },
      ]}
      fields={[
        { name: "farm", label: t("geofences.fieldFarm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "name", label: "Label", required: true },
        {
          name: "polygon",
          label: "Farm Area — 4 Corner Lat/Lng",
          type: "geopolygon",
          corners: 4,
          cornerLabel: "Corner",
          required: true,
          hint: "Enter each corner as: latitude, longitude (full precision, e.g. 23.323234342423, 43.435453435343).",
        },
        {
          name: "radius_m",
          label: "Geofence tolerance (meters)",
          type: "number",
          required: true,
        },
      ]}
    />
  );
}
