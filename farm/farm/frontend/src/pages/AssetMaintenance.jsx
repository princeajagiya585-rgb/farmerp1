import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const TYPES = [
  { value: "SERVICE", label: "Service" },
  { value: "REPAIR", label: "Repair" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "OTHER", label: "Other" },
];

const typeColor = { SERVICE: "blue", REPAIR: "yellow", INSPECTION: "green", OTHER: "gray" };
const money = (v) => (v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);

export default function AssetMaintenance() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("maintenance.titlePg")}
      subtitle={t("maintenance.subtitlePg")}
      path="assets/maintenance"
      canWrite={canWrite}
      footerColumns={["cost"]}
      columns={[
        { key: "asset_name", header: t("header.asset") },
        { key: "farm_name", header: t("header.farm") },
        {
          key: "maintenance_type",
          header: t("header.type"),
          render: (r) => (
            <Badge color={typeColor[r.maintenance_type] || "gray"}>
              {r.maintenance_type_display || r.maintenance_type}
            </Badge>
          ),
        },
        { key: "date", header: t("header.date") },
        { key: "description", header: t("header.description") },
        { key: "cost", header: t("header.cost"), render: (r) => money(r.cost) },
        { key: "performed_by", header: t("header.performedBy"), render: (r) => r.performed_by || "—" },
        { key: "next_due_date", header: t("header.nextDue"), render: (r) => r.next_due_date || "—" },
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
      ]}
      fields={[
        { name: "asset", label: "Asset", optionsFrom: { path: "assets/items", label: (a) => a.name }, required: true },
        { name: "date", label: "Date", type: "date", required: true },
        { name: "maintenance_type", label: "Type", type: "select", options: TYPES },
        { name: "description", label: "Description", type: "textarea", required: true },
        { name: "cost", label: "Cost (₹)", type: "number" },
        { name: "performed_by", label: "Performed By" },
        { name: "next_due_date", label: "Next Due Date", type: "date" },
      ]}
    />
  );
}
