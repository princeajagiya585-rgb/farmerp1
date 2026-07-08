import { useTranslation } from "react-i18next";
import { FileText, ExternalLink } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { useAuth } from "../context/AuthContext";

const money = (v) => (v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);

export default function FinancePurchases() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER", "EMPLOYEE");
  const canEdit = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("financePurchases.title")}
      subtitle={t("financePurchases.subtitle")}
      path="finance/purchases"
      canWrite={canWrite}
      canEdit={canEdit}
      showFarmFilter
      showUserFilter
      footerColumns={["total_amount"]}
      columns={[
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
        { key: "farm_name", header: t("header.farm") },
        { key: "invoice_no", header: t("header.invoice"), render: (r) => r.invoice_no || "—" },
        { key: "quantity", header: t("header.qty"), render: (r) => (r.quantity ? `${r.quantity} ${r.unit || ""}`.trim() : "—") },
        { key: "unit_price", header: t("header.rate"), render: (r) => money(r.unit_price) },
        { key: "total_amount", header: t("header.amount"), render: (r) => <b>{money(r.total_amount)}</b> },
        { key: "date", header: t("header.date") },
        {
          key: "bill_file_url",
          header: t("header.bill"),
          render: (r) =>
            r.bill_file_url ? (
              <a
                href={r.bill_file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800"
              >
                <FileText size={14} />
                <span>View</span>
                <ExternalLink size={12} />
              </a>
            ) : (
              "—"
            ),
        },
      ]}
      fields={[
        { name: "farm", label: t("header.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "invoice_no", label: t("financePurchases.invoiceNo") },
        { name: "date", label: t("header.date"), type: "date", required: true },
        { name: "quantity", label: t("header.quantity"), type: "number" },
        { name: "unit", label: t("financePurchases.unitHint") },
        { name: "unit_price", label: t("financePurchases.unitPrice"), type: "number" },
        { name: "total_amount", label: t("financePurchases.totalAmount"), type: "number", readonly: true, required: true },
        { name: "notes", label: t("header.notes"), type: "textarea" },
        { name: "bill_file", label: t("financePurchases.uploadBill"), type: "file" },
      ]}
      computedFields={[
        {
          dependsOn: ["quantity", "unit_price"],
          target: "total_amount",
          compute: (form) => (Number(form.quantity || 0) * Number(form.unit_price || 0)) || "",
        },
      ]}
    />
  );
}
