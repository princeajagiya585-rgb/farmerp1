import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { resource } from "../lib/api";
import { exportExcel, exportExcelMultiSheet } from "../lib/export";
import { Button, Card, Input, PageHeader, Select, Table } from "../components/ui";

const itemsRepo     = resource("inventory/items");
const movementsRepo = resource("inventory/movements");
const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

const COLORS = ["#16a34a","#ef4444","#3b82f6","#f59e0b","#8b5cf6","#06b6d4","#f97316"];

export default function InventoryReports() {
  const { t } = useTranslation();

  // Valuation
  const [valuation, setValuation]   = useState(null);

  // Consumption filters
  const [farms, setFarms]           = useState([]);
  const [farmFilter, setFarmFilter] = useState("");
  const [startDate, setStartDate]   = useState("");
  const [endDate, setEndDate]       = useState("");
  const [consumption, setConsumption] = useState(null);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    itemsRepo.collectionAction("valuation").then(setValuation).catch(() => {});
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));
    runConsumption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runConsumption = async () => {
    setLoading(true);
    try {
      const params = {};
      if (farmFilter) params.farm  = farmFilter;
      if (startDate)  params.start = startDate;
      if (endDate)    params.end   = endDate;
      const data = await movementsRepo.collectionAction("consumption", params);
      setConsumption(data);
    } catch {
      setConsumption(null);
    } finally {
      setLoading(false);
    }
  };

  const valRows = valuation
    ? Object.entries(valuation.by_category || {}).map(([category, value]) => ({ category, value }))
    : [];

  const consumptionRows = consumption?.rows || [];

  const exportAllReports = () => {
    const wbData = [];
    
    if (consumptionRows.length > 0) {
      const rows = consumptionRows.map((r) => ({
        Item: r.item,
        Category: r.category,
        Consumed: Number(r.consumed || 0),
      }));
      rows.push({
        Item: "Total",
        Category: "",
        Consumed: consumptionRows.reduce((s, r) => s + Number(r.consumed || 0), 0),
      });
      wbData.push({ name: "Consumption Report", data: rows });
    }
    
    if (valRows.length > 0) {
      const rows = valRows.map((r) => ({
        Category: r.category,
        [t("header.stockValue")]: Number(r.value || 0),
      }));
      rows.push({
        Category: "Total",
        [t("header.stockValue")]: valRows.reduce((s, r) => s + Number(r.value || 0), 0),
      });
      wbData.push({ name: "Stock Valuation", data: rows });
    }
    
    if (wbData.length > 0) {
      exportExcelMultiSheet(wbData, `inventory-reports-${new Date().toISOString().slice(0, 10)}.xlsx`, t("inventoryReports.title"));
    }
  };

  return (
    <div>
      <PageHeader title={t("inventoryReports.title")} subtitle={t("inventoryReports.subtitle")} />

      {/* ── Consumption Report ─────────────────────────────────── */}
      <Card title="Consumption Report" className="mb-5">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <Select label="Farm" value={farmFilter} onChange={(e) => setFarmFilter(e.target.value)}>
              <option value="">All Farms</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[150px]">
            <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="min-w-[150px]">
            <Input label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button onClick={runConsumption}>
            <FileBarChart size={15} /> Run Report
          </Button>
          <Button variant="secondary" onClick={exportAllReports} disabled={!consumptionRows.length && !valRows.length}>
            <Download size={15} /> {t("common.excel")}
          </Button>
        </div>

        {/* Summary bar */}
        {consumption && (
          <div className="mb-4 flex flex-wrap gap-4 rounded-xl bg-gray-50 p-4">
            <div className="text-center">
              <p className="text-xs text-gray-500">Total Items</p>
              <p className="text-xl font-bold text-gray-800">{consumptionRows.length}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Total Consumed</p>
              <p className="text-xl font-bold text-red-600">{Number(consumption.total_consumed || 0).toLocaleString("en-IN")}</p>
            </div>
          </div>
        )}

        {/* Bar Chart */}
        {consumptionRows.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Consumption by Item</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={consumptionRows} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
                <XAxis dataKey="item" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="consumed" radius={[6, 6, 0, 0]}>
                  {consumptionRows.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
        ) : (
          <Table
            empty="No consumption recorded. Add stock-OUT movements to see data."
            footerColumns={["consumed"]}
            columns={[
              { key: "item",     header: "Item" },
              { key: "category", header: "Category" },
              { key: "consumed", header: "Consumed", render: (r) => <b className="text-red-600">{r.consumed}</b> },
            ]}
            rows={consumptionRows}
          />
        )}
      </Card>

      {/* ── Stock Valuation ────────────────────────────────────── */}
      {/* Valuation section - no separate export button, all exports combined above */}
      <Card
        title={t("inventoryReports.valuation")}
      >
        <Table
          empty="No items."
          footerColumns={["value"]}
          columns={[
            { key: "category", header: t("header.category") },
            { key: "value",    header: t("header.stockValue"), render: (r) => money(r.value) },
          ]}
          rows={valRows}
        />
        {valuation && (
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
            <span className="text-gray-500">Total stock value:</span>{" "}
            <b className="text-brand-700">{money(valuation.total_value)}</b>
          </div>
        )}
      </Card>
    </div>
  );
}
