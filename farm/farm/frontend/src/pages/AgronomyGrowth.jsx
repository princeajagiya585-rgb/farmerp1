import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { useAuth } from "../context/AuthContext";

export default function AgronomyGrowth() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("agronomyGrowth.titlePg")}
      subtitle={t("agronomyGrowth.subtitlePg")}
      path="agronomy/growth-records"
      canWrite={canWrite}
      columns={[
        { key: "crop_name", header: t("header.crop") },
        { key: "date", header: t("header.date") },
        { key: "stage", header: t("header.stage"), render: (r) => r.stage || "—" },
        { key: "height_cm", header: t("header.height") },
        { key: "health_index", header: t("header.health"), render: (r) => `${r.health_index}/100` },
      ]}
      fields={[
        { name: "crop", label: t("agronomyGrowth.fieldCrop"), optionsFrom: { path: "agronomy/crops", label: (c) => `${c.name} ${c.variety || ""}`.trim() }, required: true },
        { name: "farm", label: t("agronomyGrowth.fieldFarm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "date", label: t("agronomyGrowth.fieldDate"), type: "date", required: true },
        { name: "stage", label: t("agronomyGrowth.fieldStage") },
        { name: "height_cm", label: t("agronomyGrowth.fieldHeight"), type: "number" },
        { name: "health_index", label: t("agronomyGrowth.fieldHealth"), type: "number" },
        { name: "notes", label: t("agronomyGrowth.fieldNotes"), type: "textarea" },
      ]}
    />
  );
}
