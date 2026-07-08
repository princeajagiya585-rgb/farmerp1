import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Check, X, FileText, ExternalLink } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const expRepo = resource("finance/expenses");
const stColor = { PENDING: "yellow", APPROVED: "green", REJECTED: "red" };

export default function Finance() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();

  const TABS = [
    { key: "expenses", label: t("finance.expenses") },
    { key: "revenue", label: t("finance.revenue") },
  ];
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const [tab, setTab] = useState("expenses");

  const act = async (id, verb, reload) => {
    await expRepo.action(id, verb);
    reload();
  };

  return (
    <div>
      <div className="mb-4 flex gap-2 border-b border-gray-200">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-4 py-2 text-sm font-medium ${tab === tb.key ? "border-b-2 border-brand-600 text-brand-700" : "text-gray-500"}`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "expenses" && (
        <CrudResource
          title={t("finance.expenses")}
          path="finance/expenses"
          canWrite={canWrite}
          showFarmFilter
          showEmployeeFilter
          footerColumns={["amount"]}
          columns={[
            { key: "description", header: t("header.description") },
            { key: "farm_name", header: t("header.farm") },
            { key: "category", header: t("header.category"), render: (r) => <Badge color="blue">{r.category}</Badge> },
            { key: "amount", header: t("header.amount"), render: (r) => `₹${Number(r.amount || 0).toLocaleString("en-IN")}` },
            { key: "date", header: t("header.date") },
            { key: "status", header: t("header.status"), render: (r) => <Badge color={stColor[r.status]}>{r.status}</Badge> },
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
            { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
          ]}
          rowActions={(row, reload) =>
            canWrite && row.status === "PENDING" ? (
              <>
                <button onClick={() => act(row.id, "approve", reload)} className="rounded p-1.5 text-green-600 hover:bg-green-50"            title={t("common.approve")}>
                  <Check size={15} />
                </button>
                <button onClick={() => act(row.id, "reject", reload)} className="rounded p-1.5 text-red-600 hover:bg-red-50"            title={t("common.reject")}>
                  <X size={15} />
                </button>
              </>
            ) : null
          }
          fields={[
            { name: "description", label: t("header.description"), required: true },
            {
              name: "category",
              label: t("header.category"),
              type: "select",
              options: ["LABOUR", "INPUTS", "FUEL", "MAINTENANCE", "UTILITIES", "TRANSPORT", "MISC"],
            },
            { name: "amount", label: t("header.amount"), type: "number", required: true },
            { name: "date", label: t("header.date"), type: "date", required: true },
            { name: "farm", label: t("header.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
            { name: "cost_center", label: t("finance.costCenter"), optionsFrom: { path: "finance/cost-centers", label: (c) => c.name } },
            { name: "crop", label: t("finance.cropProfitability"), optionsFrom: { path: "agronomy/crops", label: (c) => `${c.name} ${c.variety || ""}`.trim() } },
            { name: "bill_file", label: t("finance.uploadBill"), type: "file" },
          ]}
        />
      )}

      {tab === "revenue" && (
        <CrudResource
          title={t("finance.revenue")}
          path="finance/revenues"
          canWrite={canWrite}
          showFarmFilter
          showEmployeeFilter
          footerColumns={["amount"]}
          columns={[
            { key: "source", header: t("header.source") },
            { key: "farm_name", header: t("header.farm") },
            { key: "amount", header: t("header.amount"), render: (r) => `₹${Number(r.amount || 0).toLocaleString("en-IN")}` },
            { key: "date", header: t("header.date") },
            { key: "description", header: t("header.description") },
            { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
          ]}
          fields={[{ name: "source",
              label: t("finance.source"),
              type: "select",
              options: ["HARVEST_SALE", "SUBSIDY", "OTHER"],
            },
            { name: "amount", label: t("header.amount"), type: "number", required: true },
            { name: "date", label: t("header.date"), type: "date", required: true },
            { name: "farm", label: t("header.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
            { name: "description", label: t("header.description"), type: "textarea" },
          ]}
        />
      )}
    </div>
  );
}
