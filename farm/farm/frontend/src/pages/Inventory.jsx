import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";

export default function Inventory() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("inventory.title")}
      subtitle={t("inventory.subtitle")}
      path="inventory/items"
      canWrite={canWrite}
      footerColumns={["current_stock", "stock_value"]}
      columns={[
        { key: "name", header: t("header.item") },
        { key: "farm_name", header: t("header.farm") },
        { key: "sku", header: t("header.sku") },
        { key: "category", header: t("header.category"), render: (r) => <Badge color="blue">{r.category}</Badge> },
        { key: "current_stock", header: t("header.stock") },
        { key: "unit", header: t("header.unit") },
        { key: "reorder_level", header: t("header.reorderAt") },
        { key: "unit_cost", header: t("header.unitCost") },
        {
          key: "stock_value",
          header: t("header.stockValue"),
          render: (r) =>
            r.stock_value != null
              ? `₹${Number(r.stock_value).toLocaleString("en-IN")}`
              : "—",
        },
        {
          key: "is_low_stock",
          header: t("header.alert"),
          render: (r) =>
            r.is_low_stock ? <Badge color="red">Low Stock</Badge> : <Badge color="green">OK</Badge>,
        },
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
      ]}
      fields={[
        { name: "name", label: "Item Name", required: true },
        { name: "sku", label: "SKU", required: true },
        {
          name: "category",
          label: "Category",
          type: "select",
          options: ["FERTILIZER", "PESTICIDE", "SEED", "CONSUMABLE", "SPARE_PART"],
        },
        { name: "farm", label: "Farm", optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "unit", label: "Unit" },
        { name: "current_stock", label: "Current Stock", type: "number" },
        { name: "reorder_level", label: "Reorder Level", type: "number" },
        { name: "unit_cost", label: "Unit Cost", type: "number" },
        { name: "supplier", label: "Supplier" },
      ]}
    />
  );
}
