import { useTranslation } from "react-i18next";
import { normalizePhotoUrl } from "../lib/api";
import CrudResource from "./CrudResource";
import { Badge, PhotoThumb } from "./ui";
import { useAuth } from "../context/AuthContext";

export const ASSET_TYPES = [
  { value: "MACHINERY", label: "Machinery" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "VEHICLE", label: "Vehicle" },
  { value: "TOOL", label: "Tool" },
  { value: "IRRIGATION", label: "Irrigation" },
  { value: "INFRASTRUCTURE", label: "Infrastructure" },
  { value: "OTHER", label: "Other" },
];

export const ASSET_STATUS = [
  { value: "ACTIVE", label: "Active" },
  { value: "IDLE", label: "Idle" },
  { value: "UNDER_REPAIR", label: "Under Repair" },
  { value: "RETIRED", label: "Retired" },
];

const statusColor = {
  ACTIVE: "green",
  IDLE: "blue",
  UNDER_REPAIR: "yellow",
  RETIRED: "gray",
};

const money = (v) =>
  v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`;

/** Reusable asset register. Pass listParams to scope the view (e.g. equipment only). */
export default function AssetRegister({ title, subtitle, listParams }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={title}
      subtitle={subtitle}
      path="assets/items"
      canWrite={canWrite}
      listParams={listParams}
      footerColumns={["purchase_cost", "current_value"]}
      columns={[
        { key: "name", header: t("workforce.name") },
        {
          key: "asset_type",
          header: t("assets.type"),
          render: (r) => <Badge color="blue">{r.asset_type_display || r.asset_type}</Badge>,
        },
        { key: "farm_name", header: t("assets.farm") },
        {
          key: "status",
          header: t("assets.status"),
          render: (r) => (
            <Badge color={statusColor[r.status] || "gray"}>
              {r.status_display || r.status}
            </Badge>
          ),
        },
        {
          key: "photo",
          header: t("header.photo"),
          render: (r) => <PhotoThumb url={normalizePhotoUrl(r.photo_url)} alt={r.name} size={48} />,
        },
        { key: "purchase_cost", header: t("assets.purchaseCost"), render: (r) => money(r.purchase_cost) },
        { key: "current_value", header: t("assets.currentValue"), render: (r) => money(r.current_value) },
        { key: "assigned_to_name", header: t("header.operator"), render: (r) => r.assigned_to_name || "—" },
      ]}
      fields={[
        { name: "name", label: t("workforce.name"), required: true },
        { name: "asset_type", label: t("assets.type"), type: "select", options: ASSET_TYPES, required: true },
        { name: "farm", label: t("assets.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "manufacturer", label: "Manufacturer" },
        { name: "model_number", label: "Model Number" },
        { name: "serial_number", label: "Serial Number" },
        { name: "purchase_date", label: t("assets.purchaseDate"), type: "date" },
        { name: "purchase_cost", label: "Purchase Cost (₹)", type: "number" },
        { name: "current_value", label: "Current Value (₹)", type: "number" },
        { name: "status", label: t("assets.status"), type: "select", options: ASSET_STATUS },
        {
          name: "assigned_to",
          label: "Assigned Operator",
          optionsFrom: { path: "workforce/employees", label: (e) => e.name },
        },
        { name: "photo", label: t("header.photo"), type: "file" },
        { name: "notes", label: t("assets.notes"), type: "textarea" },
      ]}
    />
  );
}
