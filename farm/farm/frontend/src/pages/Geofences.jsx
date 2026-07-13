import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { MapPin } from "lucide-react";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const farmRepo = resource("farms");

// Full-precision coordinate (no rounding) — whatever was entered is kept.
const coord = (v) => (v == null || v === "" ? "" : String(v));

export default function Geofences() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  // Keep the farm's own geofence in sync when a geofence is edited here, so
  // attendance check-in (which reads farm.geofence / check_in_radius) uses the
  // same 4 corners + tolerance shown on the Farms & Fields page.
  const syncFarm = async (record) => {
    if (!record?.farm) return;
    await farmRepo.update(record.farm, {
      geofence: Array.isArray(record.polygon) ? record.polygon : [],
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
          key: "polygon",
          header: "Corners (Lat / Lng)",
          render: (r) => {
            const pts = Array.isArray(r.polygon) ? r.polygon : [];
            if (!pts.length) return <span className="text-gray-300">—</span>;
            return (
              <div className="flex flex-col gap-0.5">
                {pts.map((p, i) => (
                  <span key={i} className="flex items-center gap-1 font-mono text-[11px] whitespace-nowrap">
                    {i === 0 ? <MapPin size={11} className="text-brand-500" /> : <span className="w-[11px]" />}
                    <span className="text-gray-400">{i + 1}.</span> {cornerCell(pts, i)}
                  </span>
                ))}
              </div>
            );
          },
        },
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
          label: "Farm Area — Corner Lat/Lng",
          type: "geopolygon",
          corners: 4,
          cornerLabel: "Corner",
          required: true,
          hint: "Enter each corner as: latitude, longitude. Use “+ Corner Lat/Lng” to add as many corners as your farm shape needs.",
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
