import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const catColor = {
  FERTILIZER: "green", PESTICIDE: "red", SEED: "blue",
  CONSUMABLE: "gray",  SPARE_PART: "orange",
};

export default function InventoryAlerts() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("inventoryAlerts.title")}
      subtitle={t("inventoryAlerts.subtitle")}
      path="inventory/items"
      canWrite={canWrite}
      showFarmFilter
      showUserFilter
      footerColumns={["current_stock", "reorder_level"]}
      rowClassName={(r) =>
        Number(r.current_stock) <= Number(r.reorder_level)
          ? "bg-red-50"
          : ""
      }
      columns={[
        {
          key: "name",
          header: t("header.item"),
          render: (r) => (
            <span className="flex items-center gap-2">
              {Number(r.current_stock) <= Number(r.reorder_level) && (
                <AlertTriangle size={14} className="shrink-0 text-red-500" />
              )}
              {r.name}
            </span>
          ),
        },
        { key: "farm_name", header: t("header.farm") },
        {
          key: "category",
          header: t("header.category"),
          render: (r) => <Badge color={catColor[r.category] || "gray"}>{r.category}</Badge>,
        },
        { key: "sku",           header: "SKU" },
        { key: "current_stock", header: t("header.stock"),     render: (r) => `${r.current_stock} ${r.unit || ""}`.trim() },
        { key: "reorder_level", header: t("header.reorderAt") },
        { key: "unit_cost",     header: "Unit Cost",           render: (r) => `₹${r.unit_cost}` },
        { key: "supplier",      header: t("header.supplier"),  render: (r) => r.supplier || "—" },
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
      ]}
      fields={[
        { name: "name",          label: t("header.item"),      required: true },
        { name: "sku",           label: "SKU",                 required: true },
        {
          name: "category",
          label: t("header.category"),
          type: "select",
          options: ["FERTILIZER", "PESTICIDE", "SEED", "CONSUMABLE", "SPARE_PART"],
        },
        { name: "farm",          label: t("header.farm"),      optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "unit",          label: "Unit",                placeholder: "kg / L / pcs" },
        { name: "current_stock", label: t("header.stock"),     type: "number" },
        { name: "reorder_level", label: t("header.reorderAt"), type: "number" },
        { name: "unit_cost",     label: "Unit Cost (₹)",       type: "number" },
        { name: "supplier",      label: t("header.supplier") },
        { name: "description",   label: "Description",         type: "textarea" },
      ]}
    />
  );
}
