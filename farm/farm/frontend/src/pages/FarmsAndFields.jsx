import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
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
    <span className="whitespace-nowrap font-mono text-[10px]">{String(p[0])}, {String(p[1])}</span>
  ) : (
    <span className="text-gray-300">—</span>
  );
};

// After a farm is saved with its corners (4 or more) + tolerance, mirror them
// onto a Geofence record so the same area shows up on the Geofences page.
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
  // The farm LIST endpoint omits geofence/check_in_radius, so read the corners
  // & tolerance from the mirrored Geofence records (keyed by farm id) instead.
  const [geoByFarm, setGeoByFarm] = useState({});
  const loadGeofences = () => {
    geoRepo.list({ page_size: 500 }).then((d) => {
      const rows = d.results || d;
      const map = {};
      rows.forEach((g) => { map[String(g.farm)] = { polygon: g.polygon, radius_m: g.radius_m }; });
      setGeoByFarm(map);
    }).catch(() => {});
  };
  useEffect(loadGeofences, []);

  // Corners/tolerance for a farm row: farm fields first (if the API ever
  // includes them), else the mirrored geofence record.
  const farmCorners = (r) => (Array.isArray(r.geofence) && r.geofence.length ? r.geofence : geoByFarm[String(r.id)]?.polygon);
  const farmTolerance = (r) => (r.check_in_radius != null ? r.check_in_radius : geoByFarm[String(r.id)]?.radius_m);

  const onFarmSaved = async (farm) => {
    await syncGeofence(farm);
    loadGeofences();
  };

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
          onSaved={onFarmSaved}
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
            {
              key: "corners",
              header: "Corners (Lat / Lng)",
              render: (r) => {
                const pts = farmCorners(r);
                const list = Array.isArray(pts) ? pts : [];
                if (!list.length) return <span className="text-gray-300">—</span>;
                return (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-gray-600">
                    {list.map((_, i) => (
                      <span key={i} className="whitespace-nowrap">
                        <span className="text-gray-400">{i + 1}.</span> {corner(list, i)}
                      </span>
                    ))}
                  </div>
                );
              },
            },
            { key: "check_in_radius", header: "Tolerance (m)", render: (r) => { const tol = farmTolerance(r); return tol != null ? `${tol} m` : "—"; } },
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
              label: "Farm Area — Corner Lat/Lng",
              type: "geopolygon",
              corners: 4,
              cornerLabel: "Corner",
              required: true,
              hint: "Enter each corner as: latitude, longitude. Use “+ Corner Lat/Lng” to add as many corners as your farm shape needs. Auto-added to the Geofences page.",
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
