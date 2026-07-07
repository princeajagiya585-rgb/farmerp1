import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { useAuth } from "../context/AuthContext";

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(0, i).toLocaleString("en", { month: "long" }),
}));
const CATEGORIES = ["LABOUR", "INPUTS", "FUEL", "MAINTENANCE", "UTILITIES", "TRANSPORT", "MISC"];

export default function FinanceBudgets() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("financeBudgets.title")}
      subtitle={t("financeBudgets.subtitle")}
      path="finance/budgets"
      canWrite={canWrite}
      columns={[
        { key: "farm_name", header: t("header.farm") },
        { key: "fiscal_year", header: t("header.year") },
        { key: "month", header: t("header.month"), render: (r) => (r.month ? MONTHS[r.month - 1]?.label : "Whole year") },
        { key: "cost_center_name", header: t("header.costCenter"), render: (r) => r.cost_center_name || "—" },
        { key: "category", header: t("header.category"), render: (r) => r.category || "—" },
        { key: "allocated_amount", header: t("header.allocated"), render: (r) => money(r.allocated_amount) },
        { key: "spent", header: t("header.spent"), render: (r) => money(r.spent) },        { key: "remaining",
          header: t("header.remaining"),
          render: (r) => (
            <b className={Number(r.remaining) < 0 ? "text-red-600" : "text-brand-700"}>
              {money(r.remaining)}
            </b>
          ),
        },
      ]}
      footerColumns={["allocated_amount", "spent", "remaining"]}
      fields={[
        { name: "farm", label: t("header.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "cost_center", label: t("financeBudgets.costCenter"), optionsFrom: { path: "finance/cost-centers", label: (c) => c.name } },
        { name: "category", label: t("financeBudgets.categoryOptional"), type: "select", options: CATEGORIES },
        { name: "fiscal_year", label: t("financeBudgets.fiscalYear"), type: "number", required: true },
        { name: "month", label: t("financeBudgets.monthOptional"), type: "select", options: MONTHS },
        { name: "allocated_amount", label: t("financeBudgets.allocatedAmount"), type: "number", required: true },
        { name: "notes", label: t("header.notes"), type: "textarea" },
      ]}
    />
  );
}
