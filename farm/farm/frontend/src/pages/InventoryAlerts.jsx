import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const catColor = {
  FERTILIZER: "green", PESTICIDE: "red", SEED: "blue",
  CONSUMABLE: "gray",  SPARE_PART: "orange",
};

export default function InventoryAlerts() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  // Employee names for the "Employee" dropdown — stored in the item's
  // supplier text field, so no backend change is needed.
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    resource("workforce/employees")
      .list({ page_size: 500 })
      .then((d) => setEmployees(Array.isArray(d) ? d : d.results || []))
      .catch(() => {});
  }, []);

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
          header: "Item",
          render: (r) => (
            <span className="flex items-center gap-2">
              {Number(r.current_stock) <= Number(r.reorder_level) && (
                <AlertTriangle size={14} className="shrink-0 text-red-500" />
              )}
              {r.name}
            </span>
          ),
        },
        { key: "sku", header: "Stock Keeping Unit" },
        {
          key: "category",
          header: "Category",
          render: (r) => <Badge color={catColor[r.category] || "gray"}>{r.category}</Badge>,
        },
        { key: "farm_name", header: "Farm" },
        {
          key: "current_stock",
          header: "Live Stock",
          render: (r) => (
            <span className={Number(r.current_stock) <= Number(r.reorder_level) ? "font-semibold text-red-600" : ""}>
              {`${r.current_stock} ${r.unit || ""}`.trim()}
            </span>
          ),
        },
        { key: "reorder_level", header: "Reorder Alert" },
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
        { key: "supplier",    header: "Employee",    render: (r) => r.supplier || "—" },
        { key: "description", header: "Description", render: (r) => r.description || "—" },
      ]}
      fields={[
        { name: "name",          label: "Item",               required: true },
        { name: "sku",           label: "Stock Keeping Unit", required: true, placeholder: "e.g. FERT-UREA-50 (item ka unique code)" },
        {
          name: "category",
          label: "Category",
          type: "select",
          options: ["FERTILIZER", "PESTICIDE", "SEED", "CONSUMABLE", "SPARE_PART"],
        },
        { name: "farm",          label: "Farm",               optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "current_stock", label: "Live Stock",         type: "number" },
        { name: "reorder_level", label: "Reorder Alert",      type: "number" },
        { name: "supplier",      label: "Employee", type: "select", options: employees.map((e) => e.name) },
        { name: "description",   label: "Description (optional)", type: "textarea" },
      ]}
    />
  );
}
