import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Eye, LayoutDashboard } from "lucide-react";

export default function Farms() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  const rowActions = (row, reload) => (
    <>
      <button
        onClick={() => navigate(`/farms/${row.id}`)}
        className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
        title={t("common.viewDetail")}
      >
        <Eye size={15} />
      </button>
    </>
  );

  return (
    <CrudResource
      title={t("farms.title")}
      subtitle={t("farms.subtitle")}
      path="farms"
      canWrite={canWrite}
      columns={[
        { key: "name", header: t("farms.farmName") },
        { key: "location", header: t("farms.location") },
        { key: "total_area", header: t("farms.totalArea") },
        { key: "field_count", header: t("farms.fields") },
        { key: "active_crop_count", header: t("dashboard.activeCrops") },
        { key: "employee_count", header: t("layout.employees") },
        { key: "asset_count", header: t("assets.title") },
        { key: "manager_name", header: t("farmDetail.manager") },
        {
          key: "is_active",
          header: t("farmDetail.status"),
          render: (r) => <Badge color={r.is_active ? "green" : "gray"}>{r.is_active ? t("farmDetail.active") : t("farmDetail.inactive")}</Badge>,
        },
      ]}
      fields={[
        { name: "name", label: "Farm Name", required: true },
        { name: "location", label: "Location" },
        { name: "total_area", label: "Total Area (acres)", type: "number" },
        { name: "latitude", label: "Latitude", type: "number" },
        { name: "longitude", label: "Longitude", type: "number" },
        { name: "soil_type", label: "Soil Type" },
        { name: "climate_zone", label: "Climate Zone" },
        { name: "irrigation_type", label: "Irrigation Type" },
        { name: "established_date", label: "Established Date", type: "date" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      rowActions={rowActions}
    />
  );
}

