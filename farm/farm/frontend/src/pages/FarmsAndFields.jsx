import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Tractor, MapPin } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";

const geoRepo = resource("gps/geofences");

// Full-precision corner cell for the farms table.
const corner = (pts, i) => {
  const p = Array.isArray(pts) ? pts[i] : null;
  return p && p[0] != null && p[1] != null ? (
    <span className="whitespace-nowrap font-mono text-[11px]">{String(p[0])}, {String(p[1])}</span>
  ) : (
    <span className="text-gray-300">—</span>
  );
};

// After a farm is saved with its 4 corners + tolerance, mirror them onto a
// Geofence record so the same area shows up on the Geofences page.
const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;
const syncGeofence = async (farm) => {
  if (!farm?.id) return;
  const corners = Array.isArray(farm.geofence) ? farm.geofence : [];
  const tol = Number(farm.check_in_radius) || 0;
  const centroid = corners.length
    ? [round6(corners.reduce((s, p) => s + Number(p[0]), 0) / corners.length),
       round6(corners.reduce((s, p) => s + Number(p[1]), 0) / corners.length)]
    : [null, null];
  const payload = {
    farm: farm.id,
    name: `${farm.name || "Farm"} area`,
    polygon: corners,
    radius_m: tol,
    center_lat: centroid[0],
    center_lng: centroid[1],
  };
  try {
    const existing = await geoRepo.list({ farm: farm.id, page_size: 5 });
    const rows = (existing.results || existing).filter((g) => String(g.farm) === String(farm.id));
    if (rows.length) {
      await geoRepo.update(rows[0].id, payload);
    } else if (corners.length >= 3) {
      await geoRepo.create(payload);
    }
  } catch { /* mirror is best-effort; the farm itself already saved */ }
};

const TABS = [
  { key: "farms", label: "Farms", icon: Tractor },
  { key: "fields", label: "Plots / Fields", icon: MapPin },
];

export default function FarmsAndFields() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const [activeTab, setActiveTab] = useState("farms");

  return (
    <div>
      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 rounded-t-xl px-4 py-2.5 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-b-2 border-brand-600 bg-brand-50/40 text-brand-700"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Farms Tab */}
      {activeTab === "farms" && (
        <CrudResource
          title={t("farms.title")}
          subtitle={t("farms.subtitle")}
          path="farms"
          canWrite={canWrite}
          defaultValues={{ check_in_radius: 10 }}
          onSaved={syncGeofence}
          columns={[
            { key: "name", header: t("header.name") },
            { key: "location", header: t("header.location") },
            { key: "total_area", header: t("header.areaAc") },
            { key: "field_count", header: t("header.fields") },
            { key: "active_crop_count", header: t("header.activeCrops") },
            { key: "employee_count", header: t("header.employees") },
            { key: "asset_count", header: t("header.asset") },
            { key: "manager_name", header: t("header.manager") },
            {
              key: "latitude",
              header: "Center Lat / Lng",
              render: (r) =>
                r.latitude && r.longitude ? (
                  <span className="flex items-center gap-1 text-xs font-mono">
                    <MapPin size={11} className="text-brand-500" />
                    {Number(r.latitude).toFixed(6)}, {Number(r.longitude).toFixed(6)}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                ),
            },
            { key: "c1", header: "Corner 1 (Lat / Lng)", render: (r) => corner(r.geofence, 0) },
            { key: "c2", header: "Corner 2", render: (r) => corner(r.geofence, 1) },
            { key: "c3", header: "Corner 3", render: (r) => corner(r.geofence, 2) },
            { key: "c4", header: "Corner 4", render: (r) => corner(r.geofence, 3) },
            { key: "check_in_radius", header: "Tolerance (m)", render: (r) => (r.check_in_radius != null ? `${r.check_in_radius} m` : "—") },
            {
              key: "is_active",
              header: t("header.status"),
              render: (r) => <Badge color={r.is_active ? "green" : "gray"}>{r.is_active ? "Active" : "Inactive"}</Badge>,
            },
          ]}
          fields={[
            { name: "name", label: "Farm Name", required: true },
            { name: "location", label: "Location" },
            { name: "total_area", label: "Total Area (acres)", type: "number" },
            {
              name: "_coords",
              label: "Center Latitude, Longitude",
              type: "coords",
              placeholder: "e.g. 28.6139, 77.2090",
              targets: ["latitude", "longitude"],
            },
            {
              name: "geofence",
              label: "Farm Area — 4 Corner Lat/Lng",
              type: "geopolygon",
              corners: 4,
              cornerLabel: "Corner",
              required: true,
              hint: "Enter each corner as: latitude, longitude (full precision, e.g. 23.323234342423, 43.435453435343). Auto-added to the Geofences page.",
            },
            {
              name: "check_in_radius",
              label: "Geofence tolerance (meters)",
              type: "number",
              required: true,
            },
            { name: "established_date", label: "Established Date", type: "date" },
            { name: "notes", label: "Notes", type: "textarea" },
          ]}
          computedFields={[
            {
              dependsOn: ["name"],
              target: "code",
              compute: (form) => form.name ? form.name.toUpperCase().replace(/[^A-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 30) : "",
            },
          ]}
          rowActions={(row) => (
            <button
              onClick={() => navigate(`/farms/${row.id}`)}
              className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
              title={t("farms.viewDetail")}
            >
              <Eye size={15} />
            </button>
          )}
        />
      )}

      {/* Fields Tab */}
      {activeTab === "fields" && (
        <CrudResource
          title={t("fields.titlePg")}
          subtitle={t("fields.subtitlePg")}
          path="farms/fields"
          showFarmFilter
          canWrite={canWrite}
          columns={[
            { key: "name", header: t("header.name") },
            { key: "block_name", header: t("header.block"), render: (r) => r.block_name || "—" },
            { key: "farm_name", header: t("header.farm") },
            { key: "area", header: t("header.areaAcres") },
            { key: "soil_type", header: t("header.soilType") },
          ]}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "block_name", label: "Block" },
            { name: "farm", label: "Farm", optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
            { name: "area", label: "Area (acres)", type: "number" },
            { name: "soil_type", label: "Soil Type" },
          ]}
        />
      )}
    </div>
  );
}
