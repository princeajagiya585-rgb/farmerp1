import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";
import { api } from "../lib/api";
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

export default function Reports() {
  const { t } = useTranslation();
  const [finance, setFinance] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [crops, setCrops] = useState(null);
  const [attendance, setAttendance] = useState(null);

  useEffect(() => {
    api.get("/reporting/finance/").then((r) => setFinance(r.data)).catch(() => {});
    api.get("/reporting/inventory/").then((r) => setInventory(r.data)).catch(() => {});
    api.get("/reporting/crops/").then((r) => setCrops(r.data)).catch(() => {});
    api.get("/reporting/attendance/").then((r) => setAttendance(r.data)).catch(() => {});
  }, []);

  const expenseData = toArray(
    finance?.expense_by_category || finance?.expenses_by_category || finance?.by_category
  );
  const cropData = toArray(crops?.by_crop || crops?.harvest_by_crop || crops);
  const attData = toArray(attendance?.by_date || attendance);
  const lowStockRows = toArray(inventory?.low_stock || []);

  const exportExpenses = () => {
    if (!expenseData.length) return;
    const valKey = expenseData[0]?.value != null ? "value" : "amount";
    const total = expenseData.reduce((s, r) => s + Number(r[valKey] || 0), 0);
    exportExcel(
      [...expenseData, { name: "Total", [valKey]: total }],
      [
        { key: "name", header: "Category" },
        { key: valKey, header: "Amount (₹)", render: (r) => Number(r[valKey] || 0) },
      ],
      "expenses-by-category.xlsx",
      "Expenses by Category"
    );
  };

  return (
    <div>
      <PageHeader
        title={t("reports.titlePg")}
        subtitle={t("reports.subtitlePg")}
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
                <Bar dataKey={expenseData[0]?.value != null ? "value" : "amount"} fill="#ef4444" radius={[6, 6, 0, 0]} />
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
                <Bar dataKey={cropData[0]?.value != null ? "value" : "quantity"} fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400">No crop/harvest data.</p>
          )}
          {cropData.length > 0 && (
            <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-500">
              <b>Total:</b> {cropData.reduce((s, r) => s + Number(r[cropData[0]?.value != null ? "value" : "quantity"] || 0), 0)}
            </div>
          )}
        </Card>

        <Card title={t("reports.inventoryValuation")}>
          <p className="text-sm text-gray-600">Items: <b>{inventory?.item_count ?? inventory?.total_items ?? "—"}</b></p>
          <p className="text-sm text-gray-600">Total Stock Value: <b>{money(inventory?.total_value ?? inventory?.stock_value ?? 0)}</b></p>
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
    </div>
  );
}
