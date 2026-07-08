import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import { resource } from "../lib/api";
import { exportExcel, exportExcelMultiSheet } from "../lib/export";
import { Button, Card, Input, PageHeader, Select, Table } from "../components/ui";

const reports = resource("finance/reports");
const MONTHS = [{ value: "", label: "All months" }].concat(
  Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString("en", { month: "long" }) }))
);
const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const Profit = ({ v }) => <b className={Number(v) < 0 ? "text-red-600" : "text-brand-700"}>{money(v)}</b>;

// Compute total row from data and column keys
function totalRow(rows, keys) {
  if (!rows || rows.length === 0) return null;
  const totals = { farm: "Total", crop: "Total" };
  keys.forEach((k) => {
    totals[k] = rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  });
  return totals;
}

export default function FinanceReports() {
  const { t } = useTranslation();
  const [farms, setFarms] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());

  const [pFarm, setPFarm] = useState("");
  const [pMonth, setPMonth] = useState("");
  const [pnl, setPnl] = useState(null);

  const [group, setGroup] = useState("month");
  const [cash, setCash] = useState(null);

  const [farmProf, setFarmProf] = useState(null);
  const [cropProf, setCropProf] = useState(null);

  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));
    runPnl(); runCash(); runFarm(); runCrop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runPnl = async () => {
    const params = { year };
    if (pFarm) params.farm = pFarm;
    if (pMonth) params.month = pMonth;
    setPnl(await reports.collectionAction("pnl", params));
  };
  const runCash = async () => setCash(await reports.collectionAction("cash_flow", { group, year }));
  const runFarm = async () => setFarmProf(await reports.collectionAction("farm_profitability", { year }));
  const runCrop = async () => setCropProf(await reports.collectionAction("crop_profitability", { year }));

  const exportAll = () => {
    const wbData = [];
    
    // Farm profitability
    if (farmProf?.rows?.length > 0) {
      const farmRows = farmProf.rows.map((r) => ({
        [t("header.farm")]: r.farm,
        [t("header.income")]: Number(r.income || 0),
        [t("header.expenses")]: Number(r.expenses || 0),
        [t("header.profit")]: Number(r.profit || 0),
      }));
      const ft = totalRow(farmProf.rows, ["income", "expenses", "profit"]);
      if (ft) {
        farmRows.push({
          [t("header.farm")]: t("common.total"),
          [t("header.income")]: Number(ft.income || 0),
          [t("header.expenses")]: Number(ft.expenses || 0),
          [t("header.profit")]: Number(ft.profit || 0),
        });
      }
      wbData.push({ name: t("financeReports.farmProfitability").substring(0, 31), data: farmRows });
    }
    
    // Crop profitability
    if (cropProf?.rows?.length > 0) {
      const cropRows = cropProf.rows.map((r) => ({
        [t("header.crop")]: r.crop,
        [t("header.income")]: Number(r.income || 0),
        [t("header.expenses")]: Number(r.expenses || 0),
        [t("header.profit")]: Number(r.profit || 0),
      }));
      const ct = totalRow(cropProf.rows, ["income", "expenses", "profit"]);
      if (ct) {
        cropRows.push({
          [t("header.crop")]: t("common.total"),
          [t("header.income")]: Number(ct.income || 0),
          [t("header.expenses")]: Number(ct.expenses || 0),
          [t("header.profit")]: Number(ct.profit || 0),
        });
      }
      wbData.push({ name: t("financeReports.cropProfitability").substring(0, 31), data: cropRows });
    }
    
    if (wbData.length > 0) {
      exportExcelMultiSheet(wbData, `finance-reports-${year}.xlsx`, t("financeReports.title"));
    }
  };

  return (
    <div>
      <PageHeader
        title={t("financeReports.title")}
        subtitle={t("financeReports.subtitle")}
        action={
          <Button variant="secondary" onClick={exportAll}>
            <Download size={15} /> Excel
          </Button>
        }
      />

      <div className="mb-5 flex items-end gap-3">
        <div className="w-32"><Input label="Year" type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
        <Button variant="secondary" onClick={() => { runPnl(); runCash(); runFarm(); runCrop(); }}>
          <FileBarChart size={15} /> Refresh all
        </Button>
      </div>

      {/* Monthly P&L */}
      <Card title={t("financeReports.pnl")} className="mb-5">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <Select label="Farm" value={pFarm} onChange={(e) => setPFarm(e.target.value)}>
              <option value="">All farms</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[150px]"><Select label="Month" value={pMonth} onChange={(e) => setPMonth(e.target.value)} options={MONTHS} /></div>
          <Button onClick={runPnl}><FileBarChart size={15} /> Run</Button>
        </div>
        {pnl && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Income" value={money(pnl.income)} sub={`Revenue ${money(pnl.income_breakdown?.revenue)} · Sales ${money(pnl.income_breakdown?.sales)}`} color="text-green-700" />
            <Stat label="Expenses" value={money(pnl.expenses)} sub={`incl. purchases ${money(pnl.purchases)}`} color="text-red-600" />
            <Stat label="Net Profit" value={money(pnl.profit)} color={Number(pnl.profit) < 0 ? "text-red-600" : "text-brand-700"} />
          </div>
        )}
        {pnl?.expense_by_category?.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Expenses by category</p>
            <Table
              footerColumns={["total"]}
              columns={[
                { key: "category", header: t("header.category") },
                { key: "total", header: t("header.total"), render: (r) => money(r.total) },
              ]}
              rows={pnl.expense_by_category}
            />
          </div>
        )}
      </Card>

      {/* Cash flow */}
      <Card title={t("financeReports.cashFlow")} className="mb-5">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[160px]">
            <Select label="Group by" value={group} onChange={(e) => setGroup(e.target.value)}
              options={[{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} />
          </div>
          <Button onClick={runCash}><FileBarChart size={15} /> Run</Button>
          <Button variant="secondary" onClick={() => {
            const rows = cash?.rows || [];
            const total = {
              period: "Total",
              inflow: rows.reduce((s, r) => s + Number(r.inflow || 0), 0),
              outflow: rows.reduce((s, r) => s + Number(r.outflow || 0), 0),
              net: rows.reduce((s, r) => s + Number(r.net || 0), 0),
            };
            exportExcel([...rows, total], [
              { key: "period", header: "Period" },
              { key: "inflow", header: "Inflow (₹)", render: (r) => Number(r.inflow || 0) },
              { key: "outflow", header: "Outflow (₹)", render: (r) => Number(r.outflow || 0) },
              { key: "net", header: "Net (₹)", render: (r) => Number(r.net || 0) },
            ], `cash-flow-${group}.xlsx`, `Cash Flow (${group})`);
          }}>
            <Download size={15} /> {t("crud.excel")}
          </Button>
        </div>
        <Table
          empty="No cash movements."
          footerColumns={["inflow", "outflow", "net"]}
          columns={[
            { key: "period", header: t("header.period") },
            { key: "inflow", header: t("header.inflow"), render: (r) => <span className="text-green-700">{money(r.inflow)}</span> },
            { key: "outflow", header: t("header.outflow"), render: (r) => <span className="text-red-600">{money(r.outflow)}</span> },
            { key: "net", header: t("header.net"), render: (r) => <Profit v={r.net} /> },
          ]}
          rows={cash?.rows || []}
        />
        {cash?.totals && (
          <div className="mt-3 flex flex-wrap gap-x-6 rounded-lg bg-gray-50 p-3 text-sm">
            <span><span className="text-gray-500">In:</span> <b className="text-green-700">{money(cash.totals.inflow)}</b></span>
            <span><span className="text-gray-500">Out:</span> <b className="text-red-600">{money(cash.totals.outflow)}</b></span>
            <span><span className="text-gray-500">Net:</span> <Profit v={cash.totals.net} /></span>
          </div>
        )}
      </Card>

      {/* Farm-wise profitability */}
      <Card title={t("financeReports.farmProfitability")} className="mb-5">
        <Table
          empty="No data."
          footerColumns={["income", "expenses", "profit"]}
          columns={[
            { key: "farm", header: t("header.farm") },
            { key: "income", header: t("header.income"), render: (r) => money(r.income) },
            { key: "expenses", header: t("header.expenses"), render: (r) => money(r.expenses) },
            { key: "profit", header: t("header.profit"), render: (r) => <Profit v={r.profit} /> },
          ]}
          rows={farmProf?.rows || []}
        />
        {(() => {
          const ft = farmProf?.rows?.length > 0 ? totalRow(farmProf.rows, ["income", "expenses", "profit"]) : null;
          if (!ft) return null;
          return (
            <div className="mt-2 flex flex-wrap gap-x-6 rounded-lg bg-gray-50 p-3 text-sm">
              <span className="text-gray-500">Total</span>
              <span>Income: <b>{money(ft.income)}</b></span>
              <span>Expenses: <b>{money(ft.expenses)}</b></span>
              <span>Profit: <Profit v={ft.profit} /></span>
            </div>
          );
        })()}
      </Card>

      {/* Crop-wise profitability */}
      <Card title={t("financeReports.cropProfitability")}>
        <Table
          empty="No crop-tagged sales or expenses yet. Tag sales/expenses with a crop to see this."
          footerColumns={["income", "expenses", "profit"]}
          columns={[
            { key: "crop", header: t("header.crop") },
            { key: "income", header: t("header.salesIncome"), render: (r) => money(r.income) },
            { key: "expenses", header: t("header.expenses"), render: (r) => money(r.expenses) },
            { key: "profit", header: t("header.profit"), render: (r) => <Profit v={r.profit} /> },
          ]}
          rows={cropProf?.rows || []}
        />
        {(() => {
          const ct = cropProf?.rows?.length > 0 ? totalRow(cropProf.rows, ["income", "expenses", "profit"]) : null;
          if (!ct) return null;
          return (
            <div className="mt-2 flex flex-wrap gap-x-6 rounded-lg bg-gray-50 p-3 text-sm">
              <span className="text-gray-500">Total</span>
              <span>Income: <b>{money(ct.income)}</b></span>
              <span>Expenses: <b>{money(ct.expenses)}</b></span>
              <span>Profit: <Profit v={ct.profit} /></span>
            </div>
          );
        })()}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color || "text-gray-800"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
