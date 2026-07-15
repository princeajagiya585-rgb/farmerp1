import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const catColor = {
  FERTILIZER: "green", PESTICIDE: "red", SEED: "blue",
  CONSUMABLE: "gray",  SPARE_PART: "orange",
};

// Auto Stock Keeping Unit when left blank: item name slug + time suffix,
// because the backend requires a unique sku for every item.
const genSku = (name) => {
  const slug = String(name || "ITEM").toUpperCase().trim()
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20) || "ITEM";
  return `${slug}-${Date.now().toString().slice(-5)}`;
};

const today = () => new Date().toISOString().slice(0, 10);

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

  // "True" = stock has physically arrived at the farm; marks the alert Done.
  const markDone = (row, reload, updateRow) => {
    updateRow(row.id, { restocked: true }); // optimistic — instant feedback
    resource("inventory/items")
      .update(row.id, { restocked: true })
      .catch(() => updateRow(row.id, { restocked: false }));
  };

  return (
    <CrudResource
      title={t("inventoryAlerts.title")}
      subtitle={t("inventoryAlerts.subtitle")}
      path="inventory/items"
      canWrite={canWrite}
      showFarmFilter
      showUserFilter
      defaultValues={{ date: today() }}
      beforeSave={(payload, mode) => {
        // Blank Stock Keeping Unit: keep the existing one on edit, or
        // auto-generate a unique one on create (backend requires it).
        if (!String(payload.sku || "").trim()) {
          if (mode === "edit") delete payload.sku;
          else payload.sku = genSku(payload.name);
        }
        if (payload.date === "") delete payload.date;
        // Once stock is refilled above the alert level, clear the Done flag
        // so the next shortage shows the True button again.
        if (mode === "edit" && Number(payload.current_stock) > Number(payload.reorder_level)) {
          payload.restocked = false;
        }
        return payload;
      }}
      sortRows={(a, b) => {
        // Alerts (low-stock items) float to the top, most-short first.
        const needA = Math.max(Number(a.reorder_level || 0) - Number(a.current_stock || 0), 0);
        const needB = Math.max(Number(b.reorder_level || 0) - Number(b.current_stock || 0), 0);
        const lowA = Number(a.current_stock) <= Number(a.reorder_level) ? 1 : 0;
        const lowB = Number(b.current_stock) <= Number(b.reorder_level) ? 1 : 0;
        return lowB - lowA || needB - needA;
      }}
      rowActions={(r, reload, updateRow) =>
        r.restocked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600">
            <Check size={12} /> Done
          </span>
        ) : (
          <button
            onClick={() => markDone(r, reload, updateRow)}
            title="Stock farm par aa gaya — Done mark karo"
            className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
          >
            True
          </button>
        )
      }
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
              {Number(r.current_stock || 0)}
            </span>
          ),
        },
        { key: "reorder_level", header: "Reorder Alert", render: (r) => Number(r.reorder_level || 0) },
        {
          key: "required",
          header: "Required (Kitni Chahiye)",
          render: (r) => {
            const need = Math.max(Number(r.reorder_level || 0) - Number(r.current_stock || 0), 0);
            return need > 0
              ? <span className="font-semibold text-amber-600">{need}</span>
              : "—";
          },
        },
        { key: "date",        header: "Date",        render: (r) => r.date || "—" },
        { key: "supplier",    header: "Employee",    render: (r) => r.supplier || "—" },
        { key: "description", header: "Description", render: (r) => r.description || "—" },
      ]}
      fields={[
        { name: "name",          label: "Item",               required: true },
        { name: "sku",           label: "Stock Keeping Unit (optional)", placeholder: "e.g. FERT-UREA-50 — khali chhodo to auto ban jayega" },
        {
          name: "category",
          label: "Category",
          type: "select",
          options: ["FERTILIZER", "PESTICIDE", "SEED", "CONSUMABLE", "SPARE_PART"],
        },
        { name: "farm",          label: "Farm",               optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "current_stock", label: "Live Stock",         type: "number", placeholder: "Farm me abhi kitne unit hai" },
        { name: "reorder_level", label: "Reorder Alert",      type: "number", placeholder: "Kitne unit se kam par alert aaye" },
        { name: "date",          label: "Date",               type: "date" },
        { name: "supplier",      label: "Employee", type: "select", options: employees.map((e) => e.name) },
        { name: "description",   label: "Description (optional)", type: "textarea" },
      ]}
    />
  );
}
