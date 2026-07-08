import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const money = (v) => (v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);

export default function AgronomyInputs() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  const TYPES = [
    { value: "FERTILIZER", label: t("agronomyInputs.typeFertilizer") },
    { value: "PESTICIDE", label: t("agronomyInputs.typePesticide") },
    { value: "HERBICIDE", label: t("agronomyInputs.typeHerbicide") },
    { value: "BIOLOGICAL", label: t("agronomyInputs.typeBiological") },
    { value: "IRRIGATION", label: t("agronomyInputs.typeIrrigation") },
  ];

  const typeLabelMap = {
    FERTILIZER: "agronomyInputs.typeFertilizer",
    PESTICIDE: "agronomyInputs.typePesticide",
    HERBICIDE: "agronomyInputs.typeHerbicide",
    BIOLOGICAL: "agronomyInputs.typeBiological",
    IRRIGATION: "agronomyInputs.typeIrrigation",
  };

  return (
    <CrudResource
      title={t("agronomyInputs.titlePg")}
      subtitle={t("agronomyInputs.subtitlePg")}
      path="agronomy/input-applications"
      canWrite={canWrite}
      showFarmFilter
      showEmployeeFilter
      showUserFilter
      footerColumns={["quantity", "cost"]}
      columns={[
        { key: "product_name", header: t("header.product") },
        { key: "farm_name", header: t("header.farm") },
        { key: "crop_name", header: t("header.crop") },
        { key: "input_type", header: t("header.type"), render: (r) => <Badge color="blue">{t(typeLabelMap[r.input_type] || r.input_type)}</Badge> },
        { key: "quantity", header: t("header.qty"), render: (r) => `${r.quantity} ${r.unit || ""}`.trim() },
        { key: "applied_on", header: t("header.applied"), render: (r) => r.applied_on || "—" },
        { key: "cost", header: t("header.cost"), render: (r) => money(r.cost) },
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
      ]}
      fields={[
        { name: "crop", label: t("header.crop"), optionsFrom: { path: "agronomy/crops", label: (c) => `${c.name} ${c.variety || ""}`.trim() }, required: true },
        { name: "farm", label: t("header.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "input_type", label: t("agronomyInputs.fieldInputType"), type: "select", options: TYPES, required: true },
        { name: "product_name", label: t("agronomyInputs.fieldProductName"), required: true },
        { name: "inventory_item", label: t("agronomyInputs.fieldInventoryItem"), optionsFrom: { path: "inventory/items", label: (i) => i.name } },
        { name: "quantity", label: t("agronomyInputs.fieldQuantity"), type: "number" },
        { name: "unit", label: t("agronomyInputs.fieldUnit") },
        { name: "dosage", label: t("agronomyInputs.fieldDosage") },
        { name: "cost", label: t("agronomyInputs.fieldCost"), type: "number" },
        { name: "applied_on", label: t("agronomyInputs.fieldAppliedOn"), type: "date" },
        { name: "notes", label: t("agronomyInputs.fieldNotes"), type: "textarea" },
      ]}
    />
  );
}
