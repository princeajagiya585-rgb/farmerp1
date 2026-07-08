import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Tractor, MapPin } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";

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
