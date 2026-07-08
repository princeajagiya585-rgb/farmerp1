import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { useAuth } from "../context/AuthContext";

export default function AgronomyPlantation() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("agronomyPlantation.titlePg")}
      subtitle={t("agronomyPlantation.subtitlePg")}
      path="agronomy/plantation-records"
      canWrite={canWrite}
      showFarmFilter
      showEmployeeFilter
      showUserFilter
      columns={[
        { key: "crop_name", header: t("header.crop") },
        { key: "farm_name", header: t("header.farm") },
        { key: "date", header: t("header.date") },
        { key: "spacing", header: t("header.spacing"), render: (r) => r.spacing || "—" },
        { key: "plant_count", header: t("header.plants") },
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
      ]}
      fields={[
        { name: "crop", label: t("agronomyPlantation.fieldCrop"), optionsFrom: { path: "agronomy/crops", label: (c) => `${c.name} ${c.variety || ""}`.trim() }, required: true },
        { name: "farm", label: t("agronomyPlantation.fieldFarm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "date", label: t("agronomyPlantation.fieldDate"), type: "date", required: true },
        { name: "spacing", label: t("agronomyPlantation.fieldSpacing") },
        { name: "plant_count", label: t("agronomyPlantation.fieldPlantCount"), type: "number" },
        { name: "notes", label: t("agronomyPlantation.fieldNotes"), type: "textarea" },
      ]}
    />
  );
}
