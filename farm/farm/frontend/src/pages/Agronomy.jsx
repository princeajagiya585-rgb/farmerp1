import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const statusColor = { PLANNED: "gray", PLANTED: "blue", GROWING: "green", HARVESTED: "purple", FAILED: "red" };
const statusLabelMap = {
  PLANNED: "agronomy.statusPlanned",
  PLANTED: "agronomy.statusPlanted",
  GROWING: "agronomy.statusGrowing",
  HARVESTED: "agronomy.statusHarvested",
  FAILED: "agronomy.statusFailed",
};

export default function Agronomy() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("agronomy.titlePg")}
      subtitle={t("agronomy.subtitlePg")}
      path="agronomy/crops"
      canWrite={canWrite}
      showFarmFilter
      showEmployeeFilter
      showUserFilter
      rowActions={(row) => (
        <Link
          to={`/agronomy/${row.id}`}
          title={t("common.view")}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <Eye size={15} />
        </Link>
      )}
      columns={[
        { key: "name", header: t("agronomy.crop") },
        { key: "variety", header: t("agronomy.variety") },
        { key: "farm_name", header: t("agronomy.farm") },
        { key: "season", header: t("agronomy.season") },
        { key: "area", header: t("agronomy.areaAc") },
        { key: "growth_stage", header: t("agronomy.stage") },
        { key: "status", header: t("agronomy.status"), render: (r) => <Badge color={statusColor[r.status]}>{t(statusLabelMap[r.status] || r.status)}</Badge> },
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
      ]}
      fields={[
        { name: "name", label: t("agronomy.cropName"), required: true },
        { name: "variety", label: t("agronomy.variety") },
        { name: "farm", label: t("agronomy.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "season", label: t("agronomy.season") },
        {
          name: "status",
          label: t("agronomy.status"),
          type: "select",
          options: ["PLANNED", "PLANTED", "GROWING", "HARVESTED", "FAILED"],
        },
        { name: "growth_stage", label: t("agronomy.growthStage") },
        { name: "area", label: t("agronomy.areaAcres"), type: "number" },
        { name: "expected_yield", label: t("agronomy.expectedYield"), type: "number" },
        { name: "planting_date", label: t("agronomy.plantingDate"), type: "date" },
        { name: "expected_harvest_date", label: t("agronomy.expectedHarvestDate"), type: "date" },
        { name: "notes", label: t("agronomy.notes"), type: "textarea" },
      ]}
    />
  );
}
