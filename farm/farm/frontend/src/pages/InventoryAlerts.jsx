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
      footerColumns={["current_stock"]}
      rowClassName={(r) =>
        Number(r.current_stock) <= Number(r.reorder_level)
          ? "bg-red-50"
          : ""
      }
      sortRows={(a, b) => {
        // Alerts (low-stock items) float to the top, most-short first.
        const needA = Math.max(Number(a.reorder_level || 0) - Number(a.current_stock || 0), 0);
        const needB = Math.max(Number(b.reorder_level || 0) - Number(b.current_stock || 0), 0);
        const lowA = Number(a.current_stock) <= Number(a.reorder_level) ? 1 : 0;
        const lowB = Number(b.current_stock) <= Number(b.reorder_level) ? 1 : 0;
        return lowB - lowA || needB - needA;
      }}
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
        {
          key: "current_stock",
          header: "Available (Kitni Hai)",
          render: (r) => (
            <span className={Number(r.current_stock) <= Number(r.reorder_level) ? "font-semibold text-red-600" : ""}>
              {`${r.current_stock} ${r.unit || ""}`.trim()}
            </span>
          ),
        },
        {
          key: "required",
          header: "Required (Kitni Chahiye)",
          render: (r) => {
            const need = Math.max(Number(r.reorder_level || 0) - Number(r.current_stock || 0), 0);
            return need > 0
              ? <span className="font-semibold text-amber-600">{`${need} ${r.unit || ""}`.trim()}</span>
              : "—";
          },
        },
        { key: "reorder_level", header: t("header.reorderAt") },
        { key: "supplier",      header: t("header.supplier"),  render: (r) => r.supplier || "—" },
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
