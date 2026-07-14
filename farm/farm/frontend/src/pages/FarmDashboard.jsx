import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Tractor, Sprout, Users, Wrench, ClipboardList, AlertTriangle,
  ArrowRight, MapPin, DollarSign, Package,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { api, resource } from "../lib/api";
import { Card, PageHeader, Badge } from "../components/ui";

const PIE_COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#ef4444"];
const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const prettyLabel = (s) =>
  String(s || "—").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Same panel design as the main Dashboard overview boxes — the "View All →"
// footer at the bottom opens the module's page.
function Panel({ title, to, subtitle, action, children, className = "", viewLabel = "View All" }) {
  return (
    <div className={`flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-card ${className}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {action}
      </div>
      {subtitle && <p className="mb-2 text-[11px] text-gray-400">{subtitle}</p>}
      <div className="flex-1">{children}</div>
      {to && (
        <Link
          to={to}
          className="mt-3 block w-full rounded-lg border border-gray-100 bg-gray-50 py-2 text-center text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-800"
        >
          {viewLabel} →
        </Link>
      )}
    </div>
  );
}

// Fetch a full list from a resource endpoint once (paginated or plain array).
function useList(path, params) {
  const [rows, setRows] = useState(null); // null = loading
  useEffect(() => {
    let alive = true;
    resource(path)
      .list({ page_size: 10000, ...(params || {}) })
      .then((d) => alive && setRows(Array.isArray(d) ? d : d.results || []))
      .catch(() => alive && setRows([]));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return rows;
}

export default function FarmDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const crops = useList("agronomy/crops");
  const assets = useList("assets/items");
  const maintenance = useList("assets/maintenance");

  useEffect(() => {
    api
      .get("/farms/dashboard/")
      .then((r) => {
        // Tolerate either a plain array or a paginated {results:[...]} payload.
        const rows = Array.isArray(r.data) ? r.data : r.data?.results || [];
        setData(rows);
        setError("");
      })
      .catch(() => setError(t("common.loadFailed", "Could not load the farm dashboard.")))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-400">{t("common.loading")}</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  const totalFarms = data.length;
  const totalFields = data.reduce((s, d) => s + d.fields_count, 0);
  const totalCrops = data.reduce((s, d) => s + d.active_crops_count, 0);
  const totalEmployees = data.reduce((s, d) => s + d.total_employees, 0);
  const totalRevenue = data.reduce((s, d) => s + d.total_revenue, 0);
  const totalExpenses = data.reduce((s, d) => s + d.total_expenses, 0);
  const totalAssets = data.reduce((s, d) => s + d.total_assets, 0);
  const totalHarvest = data.reduce((s, d) => s + d.total_harvest_qty, 0);
  const totalAlerts = data.reduce((s, d) => s + d.alerts_count, 0);

  // Chart data: farm-wise revenue vs expenses
  const chartData = data.map((d) => ({
    name: d.farm?.name ?? "—",
    Revenue: Math.round(d.total_revenue),
    Expenses: Math.round(d.total_expenses),
  }));

  // Summary pie: total employees, fields, assets, crops
  const hasData = totalCrops > 0 || totalFields > 0 || totalAssets > 0 || totalEmployees > 0;
  const summaryPie = hasData
    ? [
        { name: "Active Crops", value: Math.max(totalCrops, 1) },
        { name: "Fields/Plots", value: Math.max(totalFields, 1) },
        { name: "Total Assets", value: Math.max(totalAssets, 1) },
        { name: "Employees", value: Math.max(totalEmployees, 1) },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title={t("farmDashboard.titlePg")}
        subtitle={t("farmDashboard.subtitlePg")}
        action={
          <Link
            to="/farms"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            <Tractor size={16} /> {t("farmDashboard.manageFarms")}
          </Link>
        }
      />



      {totalAlerts > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <AlertTriangle size={18} />
            {t("farmDashboard.alertsMsg", { count: totalAlerts, plural: totalAlerts !== 1 ? "s" : "" })}
          </div>
        </div>
      )}

      {/* Chart row */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title={t("farmDashboard.financialOverview")} className="lg:col-span-2">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="Revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-sm text-gray-400">{t("farmDashboard.noFinancialData")}</p>
          )}
        </Card>

        <Card title={t("farmDashboard.resourceBreakdown")}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={summaryPie}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              >
                {summaryPie.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Farm Administration module panels — same design as the main Dashboard */}
      <h2 className="mb-4 text-lg font-bold text-gray-800">Farm Administration Overview</h2>
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FarmsFieldsPanel data={data} />
        <CropAllocationPanel crops={crops} />
        <AssetInventoryPanel assets={assets} />
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <EquipmentPanel assets={assets} className="lg:col-span-1" />
        <MaintenancePanel maintenance={maintenance} className="lg:col-span-2" />
      </div>

      {/* Farm-wise cards */}
      <h2 className="mb-4 text-lg font-bold text-gray-800">{t("farmDashboard.farmWisePerformance")}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((d) => (
          <FarmCard
            key={d.farm.id}
            data={d}
            onClick={() => navigate(`/farms/${d.farm.id}`)}
            t={t}
          />
        ))}
      </div>

      {data.length === 0 && (
        <Card>
          <p className="py-12 text-center text-sm text-gray-400">
            {t("farmDashboard.noFarms")}
          </p>
        </Card>
      )}
    </div>
  );
}

// ── Farm Administration module panels ────────────────────────────────────

function FarmsFieldsPanel({ data }) {
  const totalFields = data.reduce((s, d) => s + (d.fields_count || 0), 0);
  return (
    <Panel title="Farms & Fields" subtitle="Fields and status per farm" to="/farms">
      {data.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">No farms yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1 text-left">Farm</th>
                <th className="py-1 text-right">Fields</th>
                <th className="py-1 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.farm.id} className="border-t border-gray-100">
                  <td className="py-1.5 font-semibold text-green-700">{d.farm.name}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-700">{d.fields_count}</td>
                  <td className="py-1.5 text-right">
                    <Badge color={d.farm.is_active ? "green" : "gray"}>
                      {d.farm.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 font-bold">
                <td className="py-1.5 text-gray-800">Total ({data.length} farms)</td>
                <td className="py-1.5 text-right text-gray-800">{totalFields}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

const CROP_STATUS_COLOR = { PLANNED: "gray", PLANTED: "blue", GROWING: "green", HARVESTED: "purple", FAILED: "red" };

function CropAllocationPanel({ crops }) {
  const list = crops || [];
  const totalArea = list.reduce((s, c) => s + Number(c.area || 0), 0);
  const byStatus = {};
  list.forEach((c) => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
  return (
    <Panel title="Crop Allocation" subtitle="Active allocations across farms" to="/farms/crop-allocation">
      {crops === null ? (
        <p className="py-6 text-center text-xs text-gray-400">Loading…</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">No crops allocated</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {Object.entries(byStatus).map(([st, n]) => (
              <Badge key={st} color={CROP_STATUS_COLOR[st] || "gray"}>{prettyLabel(st)}: {n}</Badge>
            ))}
          </div>
          <div className="scrollable-content max-h-[160px] space-y-1 overflow-y-auto">
            {list.slice(0, 8).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">
                  {c.name}{c.variety ? ` (${c.variety})` : ""}
                  <span className="ml-1 text-[10px] text-gray-400">· {c.farm_name}</span>
                </span>
                <span className="shrink-0 text-[11px] text-gray-500">{Number(c.area || 0)} ac</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-400">
            {list.length} crops · Total area {totalArea.toLocaleString("en-IN")} acres
          </p>
        </>
      )}
    </Panel>
  );
}

function AssetInventoryPanel({ assets }) {
  const list = assets || [];
  const byType = new Map();
  list.forEach((a) => {
    const b = byType.get(a.asset_type) || { type: a.asset_type, count: 0, value: 0 };
    b.count += 1;
    b.value += Number(a.current_value || 0);
    byType.set(a.asset_type, b);
  });
  const rows = [...byType.values()].sort((a, b) => b.value - a.value);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  return (
    <Panel title="Asset Inventory" subtitle="All assets grouped by type" to="/assets">
      {assets === null ? (
        <p className="py-6 text-center text-xs text-gray-400">Loading…</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">No assets yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1 text-left">Type</th>
                <th className="py-1 text-right">Count</th>
                <th className="py-1 text-right">Current Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.type} className="border-t border-gray-100">
                  <td className="py-1.5 font-medium text-gray-700">{prettyLabel(r.type)}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-700">{r.count}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-800">{inr(r.value)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 font-bold">
                <td className="py-1.5 text-gray-800">Total ({list.length})</td>
                <td className="py-1.5 text-right" />
                <td className="py-1.5 text-right text-gray-800">{inr(totalValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

const EQUIPMENT_KINDS = ["MACHINERY", "EQUIPMENT", "VEHICLE"];
const ASSET_STATUS_COLOR = { ACTIVE: "green", IDLE: "gray", UNDER_REPAIR: "yellow", RETIRED: "red" };

function EquipmentPanel({ assets, className }) {
  const list = (assets || []).filter((a) => EQUIPMENT_KINDS.includes(a.asset_type));
  const active = list.filter((a) => a.status === "ACTIVE").length;
  const repair = list.filter((a) => a.status === "UNDER_REPAIR").length;
  return (
    <Panel title="Equipment & Machinery" subtitle="Machinery, equipment & vehicles" to="/assets/equipment" className={className}>
      {assets === null ? (
        <p className="py-6 text-center text-xs text-gray-400">Loading…</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">No equipment yet</p>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-gray-50 p-2">
              <p className="text-base font-bold text-gray-800">{list.length}</p>
              <p className="text-[10px] text-gray-500">Total</p>
            </div>
            <div className="rounded-xl bg-green-50 p-2">
              <p className="text-base font-bold text-green-700">{active}</p>
              <p className="text-[10px] text-gray-500">Active</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-2">
              <p className="text-base font-bold text-amber-700">{repair}</p>
              <p className="text-[10px] text-gray-500">Under Repair</p>
            </div>
          </div>
          <div className="scrollable-content max-h-[140px] space-y-1 overflow-y-auto">
            {list.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">
                  {a.name}
                  <span className="ml-1 text-[10px] text-gray-400">· {prettyLabel(a.asset_type)}</span>
                </span>
                <Badge color={ASSET_STATUS_COLOR[a.status] || "gray"}>{prettyLabel(a.status)}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function MaintenancePanel({ maintenance, className }) {
  const list = maintenance || [];
  const today = new Date().toISOString().slice(0, 10);
  const thisYear = String(new Date().getFullYear());
  const yearCost = list
    .filter((m) => String(m.date || "").startsWith(`${thisYear}-`))
    .reduce((s, m) => s + Number(m.cost || 0), 0);
  const upcoming = list.filter((m) => m.next_due_date && m.next_due_date >= today).length;
  return (
    <Panel title="Maintenance Log" subtitle="Recent service, repair & inspection records" to="/assets/maintenance" className={className}>
      {maintenance === null ? (
        <p className="py-6 text-center text-xs text-gray-400">Loading…</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">No maintenance records</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="py-1 text-left">Asset</th>
                  <th className="py-1 text-left">Type</th>
                  <th className="py-1 text-left">Date</th>
                  <th className="py-1 text-right">Cost</th>
                  <th className="py-1 text-right">Next Due</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 6).map((m) => (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="py-1.5 font-medium text-gray-700">{m.asset_name || "—"}</td>
                    <td className="py-1.5 text-gray-600">{prettyLabel(m.maintenance_type)}</td>
                    <td className="py-1.5 text-gray-600">{m.date}</td>
                    <td className="py-1.5 text-right font-semibold text-gray-800">{inr(m.cost)}</td>
                    <td className="py-1.5 text-right text-gray-600">{m.next_due_date || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-400">
            This year's maintenance cost: <span className="font-semibold text-gray-600">{inr(yearCost)}</span>
            {" · "}Upcoming due: <span className="font-semibold text-gray-600">{upcoming}</span>
          </p>
        </>
      )}
    </Panel>
  );
}

function FarmCard({ data, onClick, t }) {
  const { farm, fields_count, active_crops_count, total_employees, total_assets } = data;
  const revenue = data.total_revenue || 0;
  const expenses = data.total_expenses || 0;
  const net = revenue - expenses;
  const hasAlerts = data.alerts_count > 0;
  const presentToday = data.present_today || 0;

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft"
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-800 group-hover:text-brand-600">
            {farm.name}
          </h3>
          <p className="flex items-center gap-1 text-xs text-gray-400">
            <MapPin size={12} />
            {farm.location || t("farmDashboard.noLocation")} · {farm.code}
          </p>
        </div>
        <Badge color={farm.is_active ? "green" : "gray"}>
          {farm.is_active ? t("farmDetail.active") : t("farmDetail.inactive")}
        </Badge>
      </div>

      {/* Mini metrics grid */}
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-brand-50/60 px-2.5 py-2 text-center">
          <p className="text-lg font-bold text-brand-700">{fields_count}</p>
          <p className="text-[10px] font-medium text-gray-500">{t("farmDashboard.fields")}</p>
        </div>
        <div className="rounded-xl bg-green-50/60 px-2.5 py-2 text-center">
          <p className="text-lg font-bold text-green-700">{active_crops_count}</p>
          <p className="text-[10px] font-medium text-gray-500">{t("farmDashboard.crops")}</p>
        </div>
        <div className="rounded-xl bg-blue-50/60 px-2.5 py-2 text-center">
          <p className="text-lg font-bold text-blue-700">{total_employees}</p>
          <p className="text-[10px] font-medium text-gray-500">{t("farmDashboard.staff")}</p>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-sm">
        <div>
          <p className="text-xs text-gray-400">{t("farmDashboard.assets")}</p>
          <p className="font-semibold text-gray-700">{total_assets}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">{t("farmDashboard.presentToday")}</p>
          <p className="font-semibold text-gray-700">{presentToday}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">{t("farmDashboard.net")}</p>
          <p className={`font-semibold ${net >= 0 ? "text-green-600" : "text-red-600"}`}>
            ₹{net.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        {hasAlerts ? (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
            <AlertTriangle size={13} />
            {data.alerts_count} alert{data.alerts_count > 1 ? "s" : ""}
          </span>
        ) : (
          <span className="text-xs text-gray-400">{t("farmDashboard.allClear")}</span>
        )}
        <span className="flex items-center gap-1 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
          {t("common.viewDetail")} <ArrowRight size={13} />
        </span>
      </div>
    </div>
  );
}
