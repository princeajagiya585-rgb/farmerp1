import { useTranslation } from "react-i18next";
import { FileText, ExternalLink } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { useAuth } from "../context/AuthContext";

export default function FinanceCostCenters() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("financeCostCenters.title")}
      subtitle={t("financeCostCenters.subtitle")}
      path="finance/cost-centers"
      canWrite={canWrite}
      columns={[
        { key: "name", header: t("header.name") },
        { key: "farm_name", header: t("header.farm") },
        { key: "description", header: t("header.description"), render: (r) => r.description || "—" },
        {
          key: "amount",
          header: t("header.amount"),
          render: (r) => `₹${Number(r.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
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
        { name: "name", label: t("header.name"), required: true },
        { name: "farm", label: t("header.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "description", label: t("header.description"), type: "textarea" },
        { name: "amount", label: t("header.amount"), type: "number" },
        { name: "bill_file", label: t("finance.uploadBill"), type: "file" },
      ]}
      footerColumns={["amount"]}
    />
  );
}
