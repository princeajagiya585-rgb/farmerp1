import { useTranslation } from "react-i18next";
import { FileText, ExternalLink } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const money = (v) => (v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);
const modeColor = { CASH: "green", BANK: "blue", UPI: "blue", CHEQUE: "yellow" };

export default function FinancePayments() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER", "EMPLOYEE");
  const canEdit = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  const MODES = [
    { value: "CASH", label: t("financePayments.cash") },
    { value: "BANK", label: t("financePayments.bank") },
    { value: "UPI", label: t("financePayments.upi") },
    { value: "CHEQUE", label: t("financePayments.cheque") },
  ];

  return (
    <CrudResource
      title={t("financePayments.titlePg")}
      subtitle={t("financePayments.subtitlePg")}
      path="finance/payments"
      canWrite={canWrite}
      canEdit={canEdit}
      showFarmFilter
      showEmployeeFilter
      footerColumns={["amount"]}
      columns={[
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
        { key: "farm_name", header: t("header.farm") },
        { key: "date", header: t("header.date") },
        { key: "amount", header: t("header.amount"), render: (r) => <b>{money(r.amount)}</b> },
        { key: "mode", header: t("header.mode"), render: (r) => <Badge color={modeColor[r.mode] || "gray"}>{r.mode}</Badge> },
        { key: "is_advance", header: t("header.type"), render: (r) => (r.is_advance ? <Badge color="yellow">Advance</Badge> : "Payment") },
        { key: "reference", header: t("header.reference"), render: (r) => r.reference || "—" },
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
        { name: "expense", label: t("financePayments.againstExpense"), optionsFrom: { path: "finance/expenses", label: (e) => `${e.description || e.category} — ₹${e.amount}` } },
        { name: "purchase", label: t("financePayments.againstPurchase"), optionsFrom: { path: "finance/purchases", label: (p) => `${p.invoice_no || "Purchase"} — ₹${p.total_amount}` } },
        { name: "amount", label: t("financePayments.amount"), type: "number", required: true },
        { name: "date", label: t("header.date"), type: "date", required: true },
        { name: "mode", label: t("header.mode"), type: "select", options: MODES },
        { name: "is_advance", label: t("financePayments.advancePayment"), type: "select", options: [{ value: "false", label: t("common.no") }, { value: "true", label: t("common.yes") }] },
        { name: "reference", label: t("header.reference") + " / Txn No." },
        { name: "bill_file", label: t("financePayments.uploadBill"), type: "file" },
      ]}
    />
  );
}
