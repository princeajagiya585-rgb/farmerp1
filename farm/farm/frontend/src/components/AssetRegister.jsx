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

// "3.0" → "3 yr", "1.5" → "1.5 yr"
const years = (v) => {
  const n = Number(v);
  if (!n || Number.isNaN(n)) return "";
  return `${n} yr`;
};

const PERIOD_LABEL = { DAY: "day", MONTH: "month", YEAR: "year" };

// Straight-line depreciation: each period (day/month/year) since the purchase
// date subtracts `percent`% of the purchase cost. Mirrors the backend so the
// live form preview matches the saved value. e.g. ₹13,000 at 2%/day → ₹260/day.
function computeCurrentValue(form) {
  const cost = Number(form.purchase_cost) || 0;
  const pct = Number(form.depreciation_percent) || 0;
  const period = form.depreciation_period;
  const pd = form.purchase_date;
  if (!cost || !pct || !period || !pd) return cost || "";
  const start = new Date(pd);
  const now = new Date();
  if (Number.isNaN(start.getTime()) || now <= start) return cost;
  let periods = 0;
  if (period === "DAY") {
    periods = Math.floor((now - start) / 86400000);
  } else if (period === "MONTH") {
    periods = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) periods -= 1;
  } else if (period === "YEAR") {
    periods = now.getFullYear() - start.getFullYear();
    const beforeAnniv = now.getMonth() < start.getMonth() || (now.getMonth() === start.getMonth() && now.getDate() < start.getDate());
    if (beforeAnniv) periods -= 1;
  }
  periods = Math.max(0, periods);
  const value = cost - (cost * pct / 100) * periods;
  return value > 0 ? Math.round(value * 100) / 100 : 0;
}

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
        { key: "purchase_date", header: t("assets.purchaseDate"), render: (r) => r.purchase_date || "—" },
        {
          key: "warranty_type",
          header: "Guaranty / Warranty",
          render: (r) => {
            if (!r.warranty_type) return "—";
            const label = r.warranty_type === "GUARANTY" ? "Guaranty" : "Warranty";
            const y = years(r.warranty_years);
            return y ? `${label} · ${y}` : label;
          },
        },
        { key: "purchase_cost", header: t("assets.purchaseCost"), render: (r) => money(r.purchase_cost) },
        {
          key: "depreciation_period",
          header: "Depreciation",
          render: (r) =>
            r.depreciation_period
              ? `${Number(r.depreciation_percent) || 0}% / ${PERIOD_LABEL[r.depreciation_period] || r.depreciation_period}`
              : "—",
        },
        { key: "current_value", header: t("assets.currentValue"), render: (r) => money(r.current_value) },
        { key: "assigned_to_name", header: t("header.operator"), render: (r) => r.assigned_to_name || "—" },
      ]}
      fields={[
        { name: "name", label: t("workforce.name"), required: true },
        { name: "asset_type", label: t("assets.type"), type: "select", options: ASSET_TYPES, required: true },
        { name: "farm", label: t("assets.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "model_number", label: "Model Number" },
        { name: "serial_number", label: "Serial Number" },
        {
          name: "warranty_type",
          label: "Guaranty / Warranty",
          type: "select",
          options: [
            { value: "GUARANTY", label: "Guaranty" },
            { value: "WARRANTY", label: "Warranty" },
          ],
        },
        // How many years the guaranty/warranty runs — appears once a type is set.
        {
          name: "warranty_years",
          label: "Guaranty / Warranty (years)",
          type: "number",
          hidden: (form) => !form.warranty_type,
        },
        { name: "purchase_date", label: t("assets.purchaseDate"), type: "date" },
        { name: "purchase_cost", label: "Purchase Cost (₹)", type: "number" },
        {
          name: "depreciation_period",
          label: "Depreciation",
          type: "select",
          options: [
            { value: "DAY", label: "Per Day" },
            { value: "MONTH", label: "Per Month" },
            { value: "YEAR", label: "Per Year" },
          ],
        },
        // Percentage box appears only once a depreciation period is chosen.
        {
          name: "depreciation_percent",
          label: "Depreciation (%)",
          type: "number",
          hidden: (form) => !form.depreciation_period,
        },
        // Auto-computed from cost + depreciation; not editable.
        { name: "current_value", label: "Current Value (₹) — auto", type: "number", readonly: true },
        {
          name: "assigned_to",
          label: "Assigned Operator",
          optionsFrom: { path: "workforce/employees", label: (e) => e.name },
        },
        { name: "photo", label: t("header.photo"), type: "file" },
        { name: "notes", label: t("assets.notes"), type: "textarea" },
      ]}
      computedFields={[
        {
          dependsOn: ["purchase_cost", "depreciation_percent", "depreciation_period", "purchase_date"],
          target: "current_value",
          compute: computeCurrentValue,
        },
      ]}
    />
  );
}
