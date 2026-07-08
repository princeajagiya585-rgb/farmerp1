import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const TYPES = [
  { value: "IN", label: "Stock In" },
  { value: "OUT", label: "Stock Out (usage)" },
  { value: "ADJUSTMENT", label: "Adjustment" },
];
const color = { IN: "green", OUT: "red", ADJUSTMENT: "yellow" };

export default function InventoryMovements() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("inventoryMovements.title")}
      subtitle={t("inventoryMovements.subtitle")}
      path="inventory/movements"
      canWrite={canWrite}
      showFarmFilter
      showUserFilter
      columns={[
        { key: "date", header: t("header.date") },
        { key: "item_name", header: t("header.item") },
        { key: "farm_name", header: t("header.farm") },
        { key: "movement_type", header: t("header.type"), render: (r) => <Badge color={color[r.movement_type] || "gray"}>{r.movement_type}</Badge> },
        { key: "quantity", header: t("header.qty") },
        { key: "reason", header: t("header.reason"), render: (r) => r.reason || "—" },
        { key: "reference", header: t("header.reference"), render: (r) => r.reference || "—" },
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
      ]}
      fields={[
        { name: "item", label: "Item", optionsFrom: { path: "inventory/items", label: (i) => `${i.name} (${i.sku})` }, required: true },
        { name: "farm", label: "Farm", optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "movement_type", label: "Type", type: "select", options: TYPES, required: true },
        { name: "quantity", label: "Quantity", type: "number", required: true },
        { name: "date", label: "Date", type: "date", required: true },
        { name: "reason", label: "Reason" },
        { name: "reference", label: "Reference" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
    />
  );
}
