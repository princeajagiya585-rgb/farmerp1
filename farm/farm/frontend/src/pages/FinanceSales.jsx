import { useTranslation } from "react-i18next";
import { FileText, ExternalLink } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { useAuth } from "../context/AuthContext";

const money = (v) => (v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);

export default function FinanceSales() {
  const { t } = useTranslation();
  const { user, hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER", "EMPLOYEE");
  const canEdit = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const userName = user?.full_name || user?.username || "";

  return (
    <CrudResource
      title={t("financeSales.title")}
      subtitle={t("financeSales.subtitle")}
      path="finance/sales"
      canWrite={canWrite}
      canEdit={canEdit}
      showFarmFilter
      showBuyerFilter
      defaultValues={{ buyer: userName }}
      footerColumns={["amount"]}
      columns={[
        { key: "name", header: t("header.name"), render: (r) => r.name || "—" },
        { key: "date", header: t("header.date") },
        { key: "farm_name", header: t("header.farm") },
        { key: "buyer", header: t("header.buyer"), render: (r) => r.buyer || "—" },
        { key: "crop_name", header: t("header.crop"), render: (r) => r.crop_name || "—" },
        { key: "quantity", header: t("header.qty"), render: (r) => `${r.quantity} ${r.unit || ""}`.trim() },
        { key: "unit_price", header: t("header.rate"), render: (r) => money(r.unit_price) },
        { key: "amount", header: t("header.amount"), render: (r) => <b>{money(r.amount)}</b> },
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
        { name: "name", label: t("header.name") },
        { name: "buyer", label: t("financeSales.soldBy"), readonly: true },
        { name: "farm", label: t("header.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "crop", label: t("financeSales.cropOptional"), optionsFrom: { path: "agronomy/crops", label: (c) => `${c.name} ${c.variety || ""}`.trim() } },
        { name: "quantity", label: t("header.quantity"), type: "number" },
        { name: "unit", label: t("financeSales.unitHint") },
        { name: "unit_price", label: t("financeSales.unitPrice"), type: "number" },
        { name: "amount", label: t("financeSales.totalAmount"), type: "number", readonly: true, required: true },
        { name: "date", label: t("header.date"), type: "date", required: true },
        { name: "notes", label: t("header.notes"), type: "textarea" },
        { name: "bill_file", label: t("financeSales.uploadBill"), type: "file" },
      ]}
      computedFields={[
        {
          dependsOn: ["quantity", "unit_price"],
          target: "amount",
          compute: (form) => (Number(form.quantity || 0) * Number(form.unit_price || 0)) || "",
        },
      ]}
    />
  );
}
