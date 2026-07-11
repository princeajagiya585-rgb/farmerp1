import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";
import { api, resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { exportExcel } from "../lib/export";
import { Button, Card, PageHeader, Table } from "../components/ui";

function toArray(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  return Object.entries(obj).map(([name, value]) =>
    typeof value === "object" ? { name, ...value } : { name, value }
  );
}

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodLabel = (m, y) => (m ? `${MONTHS_SHORT[(m - 1) % 12]} ${y || ""}`.trim() : "—");

export default function Reports() {
  const { t } = useTranslation();
  const [finance, setFinance] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [crops, setCrops] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const { hasRole, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [userFilter, setUserFilter] = useState("");
  const [appliedUserFilter, setAppliedUserFilter] = useState("");
  // Closed (Done / PAID) payslips → the Net Pay report table.
  const [paidSlips, setPaidSlips] = useState([]);
  const canSeePayroll = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  useEffect(() => {
    if (hasRole("SUPER_ADMIN", "FARM_MANAGER")) {
      resource("auth/users").list({ page_size: 200 }).then((d) => {
        const all = Array.isArray(d) ? d : d.results || [];
        setUsers(all);
      }).catch(() => {});
    }
  }, [hasRole]);

  useEffect(() => {
    const params = {};
    if (appliedUserFilter) {
      params.user = appliedUserFilter;
    }
    api.get("/reporting/finance/", { params }).then((r) => setFinance(r.data)).catch(() => {});
    api.get("/reporting/inventory/").then((r) => setInventory(r.data)).catch(() => {});
    api.get("/reporting/crops/").then((r) => setCrops(r.data)).catch(() => {});
    api.get("/reporting/attendance/").then((r) => setAttendance(r.data)).catch(() => {});
  }, [appliedUserFilter]);

  // Load closed (PAID) payslips for the Net Pay report. Runs whenever the page
  // opens so a freshly-closed account shows up immediately.
  useEffect(() => {
    if (!canSeePayroll) return;
    resource("payroll/payslips")
      .list({ status: "PAID", page_size: 500 })
      .then((d) => setPaidSlips(Array.isArray(d) ? d : d.results || []))
      .catch(() => {});
  }, [canSeePayroll]);

  // Normalise API shapes to {name, value} so the charts always render —
  // the finance report sends {category, total} and the crop report sends
  // {crop, total_quantity}.
  const expenseData = toArray(
    finance?.expense_by_category || finance?.expenses_by_category || finance?.by_category
  ).map((r) => ({
    name: r.name ?? r.category ?? "—",
    value: Number(r.value ?? r.total ?? r.amount ?? 0),
  }));
  const cropData = toArray(crops?.by_crop || crops?.harvest_by_crop || crops).map((r) => ({
    name: r.name ?? r.crop ?? "—",
    value: Number(r.value ?? r.total_quantity ?? r.quantity ?? 0),
  }));
  const attData = toArray(attendance?.by_date || attendance);
  const lowStockRows = toArray(inventory?.low_stock || []);

  const exportExpenses = () => {
    if (!expenseData.length) return;
    const total = expenseData.reduce((s, r) => s + Number(r.value || 0), 0);
    exportExcel(
      [...expenseData, { name: "Total", value: total }],
      [
        { key: "name", header: "Category" },
        { key: "value", header: "Amount (₹)", render: (r) => Number(r.value || 0) },
      ],
      "expenses-by-category.xlsx",
      "Expenses by Category"
    );
  };

  const netPayTotal = paidSlips.reduce((s, r) => s + Number(r.net_pay || 0), 0);
  const exportNetPay = () => {
    if (!paidSlips.length) return;
    const rows = paidSlips.map((r) => ({
      employee: r.employee_name || "—",
      farm: r.farm_name || "—",
      period: periodLabel(r.period_month, r.period_year),
      net_pay: Number(r.net_pay || 0),
      half_paid: Number(r.half_paid || 0),
    }));
    exportExcel(
      [...rows, { employee: "Total", farm: "", period: "", net_pay: netPayTotal, half_paid: "" }],
      [
        { key: "employee", header: "Employee" },
        { key: "farm", header: "Farm" },
        { key: "period", header: "Period" },
        { key: "net_pay", header: "Net Pay (₹)" },
        { key: "half_paid", header: "Paid (₹)" },
      ],
      "net-pay-closed-accounts.xlsx",
      "Net Pay - Closed Accounts"
    );
  };

  return (
    <div>
      <PageHeader
        title={t("reports.titlePg")}
        subtitle={t("reports.subtitlePg")}
        action={
          (hasRole("SUPER_ADMIN", "FARM_MANAGER")) && (
            <div className="flex items-center gap-2">
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
              >
                <option value="">{t("common.allUsers")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                ))}
              </select>
              <Button
                onClick={() => setAppliedUserFilter(userFilter)}
                variant="secondary"
              >
                {t("common.apply")}
              </Button>
              {appliedUserFilter && (
                <Button
                  onClick={() => { setUserFilter(""); setAppliedUserFilter(""); }}
                  variant="secondary"
                >
                  {t("common.reset")}
                </Button>
              )}
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t("reports.expensesByCategory")}>
          <div className="mb-2 flex justify-end">
            <Button variant="secondary" onClick={exportExpenses} disabled={!expenseData.length}>
              <Download size={14} /> Excel
            </Button>
          </div>
          {expenseData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={expenseData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400">No expense data.</p>
          )}
          <div className="mt-3 text-sm text-gray-600">
            <p>Total Revenue: <b>{money(finance?.total_revenue ?? 0)}</b></p>
            <p>Net: <b>{money(finance?.net ?? 0)}</b></p>
          </div>
        </Card>

        <Card title={t("reports.harvestByCrop")}>
          {cropData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={cropData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400">No crop/harvest data.</p>
          )}
          {cropData.length > 0 && (
            <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-500">
              <b>Total:</b> {cropData.reduce((s, r) => s + Number(r.value || 0), 0)}
            </div>
          )}
        </Card>

        <Card title={t("reports.inventoryValuation")}>
          <p className="text-sm text-gray-600">Items: <b>{inventory?.item_count ?? inventory?.total_items ?? "—"}</b></p>
          <p className="text-sm text-gray-600">Total Stock Value: <b>{money(inventory?.total_stock_value ?? inventory?.total_value ?? inventory?.stock_value ?? 0)}</b></p>
          <h4 className="mt-3 mb-1 text-xs font-semibold uppercase text-gray-500">Low Stock</h4>
          <Table
            footerColumns={["current_stock", "reorder_level"]}
            columns={[
              { key: "name", header: t("header.item") },
              { key: "current_stock", header: t("header.stock") },
              { key: "reorder_level", header: t("header.reorderAt") },
            ]}
            rows={lowStockRows}
            empty="No low-stock items."
          />
        </Card>

        <Card title={t("reports.attendanceSummary")}>
          {attData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={attData}>
                <XAxis dataKey={attData[0]?.date ? "date" : "name"} />
                <YAxis />
                <Tooltip />
                <Bar dataKey={attData[0]?.present != null ? "present" : "value"} fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400">No attendance data.</p>
          )}
          {attData.length > 0 && (
            <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-500">
              <b>Total Present:</b> {attData.reduce((s, r) => s + Number(r[attData[0]?.present != null ? "present" : "value"] || 0), 0)}
            </div>
          )}
        </Card>
      </div>

      {canSeePayroll && (
        <div className="mt-4">
          <Card title={t("reports.netPayClosed")}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {t("reports.netPayClosedHint")}
              </p>
              <Button variant="secondary" onClick={exportNetPay} disabled={!paidSlips.length}>
                <Download size={14} /> Excel
              </Button>
            </div>
            <Table
              footerColumns={["net_pay", "half_paid"]}
              columns={[
                { key: "employee_name", header: t("header.employee"), render: (r) => r.employee_name || "—" },
                { key: "farm_name", header: t("header.farm"), render: (r) => r.farm_name || "—" },
                { key: "period", header: t("header.month"), render: (r) => periodLabel(r.period_month, r.period_year) },
                { key: "net_pay", header: t("header.netPay"), render: (r) => <b>{money(r.net_pay)}</b> },
                { key: "half_paid", header: t("payroll.halfPay"), render: (r) => money(r.half_paid) },
              ]}
              rows={paidSlips}
              empty={t("reports.netPayEmpty")}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
