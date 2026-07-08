import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { useAuth } from "../context/AuthContext";

const money = (v) => (v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);

export default function AgronomyHarvest() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("agronomyHarvest.titlePg")}
      subtitle={t("agronomyHarvest.subtitlePg")}
      path="agronomy/harvest-records"
      canWrite={canWrite}
      showFarmFilter
      showEmployeeFilter
      showUserFilter
      footerColumns={["revenue"]}
      columns={[
        { key: "crop_name", header: t("header.crop") },
        { key: "farm_name", header: t("header.farm") },
        { key: "date", header: t("header.date") },
        { key: "quantity", header: t("header.quantity"), render: (r) => `${r.quantity} ${r.unit || ""}`.trim() },
        { key: "quality_grade", header: t("header.grade"), render: (r) => r.quality_grade || "—" },
        { key: "yield_per_acre", header: t("header.yieldPerAcre") },
        { key: "revenue", header: t("header.revenue"), render: (r) => money(r.revenue) },
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
      ]}
      fields={[
        { name: "crop", label: t("agronomyHarvest.fieldCrop"), optionsFrom: { path: "agronomy/crops", label: (c) => `${c.name} ${c.variety || ""}`.trim() }, required: true },
        { name: "farm", label: t("agronomyHarvest.fieldFarm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "date", label: t("agronomyHarvest.fieldDate"), type: "date", required: true },
        { name: "quantity", label: t("agronomyHarvest.fieldQuantity"), type: "number" },
        { name: "unit", label: t("agronomyHarvest.fieldUnit") },
        { name: "quality_grade", label: t("agronomyHarvest.fieldQualityGrade") },
        { name: "yield_per_acre", label: t("agronomyHarvest.fieldYieldPerAcre"), type: "number" },
        { name: "revenue", label: t("agronomyHarvest.fieldRevenue"), type: "number" },
        { name: "notes", label: t("agronomyHarvest.fieldNotes"), type: "textarea" },
      ]}
    />
  );
}
