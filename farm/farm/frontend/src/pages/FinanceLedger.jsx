import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const rawNum = (v) => Number(v || 0);

// Sort: CREDIT entries first, then DEBIT, then by date descending within each group
const sortRows = (a, b) => {
  if (a.entry_type === "CREDIT" && b.entry_type !== "CREDIT") return -1;
  if (a.entry_type !== "CREDIT" && b.entry_type === "CREDIT") return 1;
  if (a.entry_type === "DEBIT" && b.entry_type !== "DEBIT") return -1;
  if (a.entry_type !== "DEBIT" && b.entry_type === "DEBIT") return 1;
  // Same type: sort by date descending (newest first)
  return new Date(b.date) - new Date(a.date);
};

function extractExcelText(vnode) {
  if (!vnode) return "";
  if (typeof vnode === "string") return vnode;
  if (Array.isArray(vnode)) return vnode.map(extractExcelText).join(" ");
  if (vnode.props) {
    const children = vnode.props.children;
    if (children) return extractExcelText(children);
    return "";
  }
  return String(vnode);
}

function valueToExcel(v) {
  if (v == null) return "";
  if (typeof v === "object" && v.props) return extractExcelText(v);
  if (typeof v === "object") return "";
  return String(v);
}

export default function FinanceLedger() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN");
  const repo = resource("finance/ledger");

  const columns = [
    { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
    { key: "farm_name", header: t("header.farm"), render: (r) => r.farm_name || "—" },
    { key: "date", header: t("header.date") },
    {
      key: "entry_type",
      header: t("header.type"),
      render: (r) => (
        <Badge color={r.entry_type === "CREDIT" ? "green" : "red"}>{r.entry_type}</Badge>
      ),
    },
    { key: "account", header: t("header.account") },
    { key: "amount", header: t("header.amount"), render: (r) => money(r.amount) },
    { key: "reference", header: t("header.reference"), render: (r) => r.reference || "—" },
    { key: "description", header: t("header.description"), render: (r) => r.description || "—" },
  ];

  // Custom footer: Credit – Debit = Balance
  const renderFooter = ({ rows }) => {
    const creditTotal = rows
      .filter((r) => r.entry_type === "CREDIT")
      .reduce((s, r) => s + rawNum(r.amount), 0);
    const debitTotal = rows
      .filter((r) => r.entry_type === "DEBIT")
      .reduce((s, r) => s + rawNum(r.amount), 0);
    const balance = creditTotal - debitTotal;

    const colSpan = columns.length + 1; // +1 for actions column

    return (
      <>
        <tr className="border-t-2 border-green-300 bg-green-50 font-semibold text-green-800">
          <td className="px-3 py-2.5 text-sm font-medium" colSpan={3}>
            {t("financeLedger.creditTotal")}
          </td>
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5 font-bold">{money(creditTotal)}</td>
          <td colSpan={colSpan - 6} />
        </tr>
        <tr className="border-t border-red-200 bg-red-50 font-semibold text-red-800">
          <td className="px-3 py-2.5 text-sm font-medium" colSpan={3}>
            {t("financeLedger.debitTotal")}
          </td>
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5 font-bold">{money(debitTotal)}</td>
          <td colSpan={colSpan - 6} />
        </tr>
        <tr className="border-t-2 border-gray-400 bg-gray-100 font-bold text-gray-900">
          <td className="px-3 py-3 text-sm" colSpan={3}>
            {t("financeLedger.balanceLabel")}
          </td>
          <td className="px-3 py-3">
            <Badge color={balance >= 0 ? "green" : "red"}>
              {balance >= 0 ? t("financeLedger.credit") : t("financeLedger.debit")}
            </Badge>
          </td>
          <td className="px-3 py-3" />
          <td className="px-3 py-3 text-base">{money(Math.abs(balance))}</td>
          <td colSpan={colSpan - 6} />
        </tr>
      </>
    );
  };

  // Custom Excel export with balance row
  const extraToolbar = (
    <button
      onClick={async () => {
        let allRows = [];
        try {
          const data = await repo.list({ page_size: 10000 });
          allRows = (Array.isArray(data) ? data : data.results || []).sort(sortRows);
        } catch {
          return;
        }

        const cols = columns; // exclude actions since not in crud columns
        const header = cols.map((c) => c.header);
        const data = allRows.map((r) =>
          cols.map((c) => valueToExcel(c.render ? c.render(r) : r[c.key]))
        );

        const creditTotal = allRows
          .filter((r) => r.entry_type === "CREDIT")
          .reduce((s, r) => s + rawNum(r.amount), 0);
        const debitTotal = allRows
          .filter((r) => r.entry_type === "DEBIT")
          .reduce((s, r) => s + rawNum(r.amount), 0);
        const balance = creditTotal - debitTotal;

        const spacer = Array(cols.length).fill("");
        const creditRow = Array(cols.length).fill("");
        creditRow[0] = t("financeLedger.creditTotal");
        creditRow[5] = `₹${creditTotal.toLocaleString("en-IN")}`;

        const debitRow = Array(cols.length).fill("");
        debitRow[0] = t("financeLedger.debitTotal");
        debitRow[5] = `₹${debitTotal.toLocaleString("en-IN")}`;

        const balanceRow = Array(cols.length).fill("");
        balanceRow[0] = t("financeLedger.balanceLabel");
        balanceRow[3] = balance >= 0 ? "CREDIT" : "DEBIT";
        balanceRow[5] = `₹${Math.abs(balance).toLocaleString("en-IN")}`;

        const exportData = [...data, spacer, creditRow, debitRow, balanceRow];
        const ws = XLSX.utils.aoa_to_sheet([header, ...exportData]);
        ws["!cols"] = cols.map(() => ({ wch: 20 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t("financeLedger.title"));
        XLSX.writeFile(wb, "finance-ledger.xlsx");
      }}
      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
    >
      📥 {t("crud.excel")}
    </button>
  );

  return (
    <CrudResource
      title={t("financeLedger.title")}
      subtitle={t("financeLedger.subtitle")}
      path="finance/ledger"
      canWrite={canWrite}
      showFarmFilter
      showUserFilter
      defaultCurrentPeriod
      disablePagination
      sortRows={sortRows}
      columns={columns}
      renderFooter={renderFooter}
      extraToolbar={extraToolbar}
      hideExport
      fields={[
        { name: "farm", label: t("header.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "entry_type", label: t("financeLedger.entryType"), type: "select", options: [{ value: "DEBIT", label: t("financeLedger.debit") }, { value: "CREDIT", label: t("financeLedger.credit") }], required: true },
        { name: "account", label: t("financeLedger.accountHead"), required: true },
        { name: "amount", label: t("financeLedger.amount"), type: "number", required: true },
        { name: "date", label: t("header.date"), type: "date", required: true },
        { name: "reference", label: t("header.reference") },
        { name: "description", label: t("header.description"), type: "textarea" },
      ]}
    />
  );
}
