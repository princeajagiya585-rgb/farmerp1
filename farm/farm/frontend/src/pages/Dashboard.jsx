import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Tractor, Wallet, Users, Banknote, ClipboardList, MapPin,
  Sprout, Boxes, FileText, AlertTriangle, UserCog, ArrowRight,
  TrendingUp, TrendingDown, CalendarCheck, LayoutGrid, Coins, UserMinus, Plane, Download,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { api, resource } from "../lib/api";
import { exportExcel } from "../lib/export";
import { useAuth } from "../context/AuthContext";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CAT_COLORS = ["#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b", "#06b6d4", "#ef4444", "#94a3b8", "#ec4899", "#14b8a6"];
const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
// "CROP_SALE" → "Crop Sale" for readable category labels
const prettyLabel = (s) =>
  String(s || "OTHER").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const ALL_ROLES = ["SUPER_ADMIN", "FARM_MANAGER", "EMPLOYEE"];
const FM = "FARM_MANAGER";
const EM = "EMPLOYEE";

const ALL_MODULES = [
  {
    key: "farmAdmin",
    icon: Tractor,
    color: "from-emerald-500 to-emerald-700",
    bg: "bg-emerald-50",
    path: "/farms/dashboard",
    label: "nav.farmAdmin",
    roles: [FM],
  },
  {
    key: "finance",
    icon: Banknote,
    color: "from-blue-500 to-blue-700",
    bg: "bg-blue-50",
    path: "/finance",
    label: "nav.finance",
    roles: [FM],
  },
  {
    key: "hr",
    icon: Users,
    color: "from-violet-500 to-violet-700",
    bg: "bg-violet-50",
    path: "/workforce",
    label: "nav.hr",
    roles: [FM],
  },
  {
    key: "payroll",
    icon: Wallet,
    color: "from-amber-500 to-amber-700",
    bg: "bg-amber-50",
    path: "/payroll",
    label: "nav.payroll",
    roles: [FM, EM],
  },
  {
    key: "tasks",
    icon: ClipboardList,
    color: "from-rose-500 to-rose-700",
    bg: "bg-rose-50",
    path: "/tasks",
    label: "nav.tasksScheduling",
    roles: ALL_ROLES,
  },
  {
    key: "agronomy",
    icon: Sprout,
    color: "from-green-500 to-green-700",
    bg: "bg-green-50",
    path: "/agronomy",
    label: "nav.agronomyCrops",
    roles: [FM, EM],
  },
  {
    key: "inventory",
    icon: Boxes,
    color: "from-orange-500 to-orange-700",
    bg: "bg-orange-50",
    path: "/inventory",
    label: "nav.inventory",
    roles: [FM],
  },
  {
    key: "documents",
    icon: FileText,
    color: "from-sky-500 to-sky-700",
    bg: "bg-sky-50",
    path: "/documents",
    label: "nav.documents",
    roles: [FM],
  },
  {
    key: "administration",
    icon: UserCog,
    color: "from-slate-500 to-slate-700",
    bg: "bg-slate-50",
    path: "/users",
    label: "nav.administration",
    roles: ["SUPER_ADMIN"],
  },
];

function canAccess(roles, userRole) {
  if (userRole === "SUPER_ADMIN") return true;
  return roles.includes(userRole);
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [kpi, setKpi] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [waking, setWaking] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState("");
  const pollingRef = useRef(null);
  const retryRef = useRef(null);
  const kpiRef = useRef(null);
  const selectedFarmRef = useRef("");

  // Keep a ref in sync with the latest data so the loader can decide whether a
  // failed *background* refresh should be surfaced (no data yet) or swallowed
  // (we already have good data on screen).
  useEffect(() => {
    kpiRef.current = kpi;
  }, [kpi]);

  // The backend runs on a free tier that sleeps when idle, so the first request
  // after a while can fail or be slow while it wakes up. Retry the initial load
  // with backoff, but DO NOT retry on subsequent polls (to avoid 429 pile-ups).
  const INITIAL_MAX_RETRIES = 3;

  const loadDashboard = (attempt = 0) => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    setLoading(true);
    api
      .get("/reporting/dashboard/", {
        params: selectedFarmRef.current ? { farm: selectedFarmRef.current } : {},
        timeout: 20000,
      })
      .then((r) => {
        setKpi(r.data);
        setError("");
        setWaking(false);
      })
      .catch((err) => {
        // A 401 is handled by the axios interceptor (refresh / redirect); don't
        // overwrite the screen for it here.
        if (err?.response?.status === 401) return;

        // If we already have data on screen, a failed background poll shouldn't
        // wipe the dashboard — just keep the last good values.
        if (kpiRef.current) return;

        // Only retry on the initial load (attempt tracked), not on background polls
        if (attempt < INITIAL_MAX_RETRIES) {
          setWaking(true);
          const delay = Math.min(2000 * 2 ** attempt, 10000);
          retryRef.current = setTimeout(() => loadDashboard(attempt + 1), delay);
        } else {
          setWaking(false);
          setError("Could not load dashboard. Please retry.");
        }
      })
      .finally(() => setLoading(false));
  };

  // Switch the whole dashboard to a single farm (or back to All Farms).
  const onFarmChange = (value) => {
    setSelectedFarm(value);
    selectedFarmRef.current = value;
    loadDashboard(0);
  };

 useEffect(() => {
  // ⛔ Do NOT fire any API call until auth is fully initialized.
  // Otherwise the backend receives the request without an Authorization
  // header and returns 401, triggering an unnecessary refresh cycle.
  if (authLoading || !user) return;

  loadDashboard();

  if (!pollingRef.current) {
    const base = 300000;
    const jitter = Math.floor(Math.random() * base * 0.4) - Math.floor(base * 0.2); // ±20%
    pollingRef.current = setInterval(() => {
      loadDashboard(0);
    }, base + jitter); // ~5 minutes with jitter — the dashboard endpoint is heavy
  }

  return () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  };
}, [authLoading, user]);

  if (error && !kpi) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => { setError(""); loadDashboard(0); }}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          {t("common.retry", "Retry")}
        </button>
      </div>
    );
  }
  if (!kpi) {
    return (
      <p className="text-gray-400">
        {waking ? t("common.wakingServer", "Waking up the server, please wait…") : t("common.loading")}
      </p>
    );
  }

  const visibleModules = ALL_MODULES.filter((m) => canAccess(m.roles, user?.role));

  return (
    <div>
      {/* Welcome + farm scope selector */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">
            {t("layout.welcome", { name: user?.first_name || user?.username })} 👋
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t("layout.overview")}</p>
        </div>
        {(kpi?.farms?.length || 0) > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-lg">🌾</span>
            <select
              value={selectedFarm}
              onChange={(e) => onFarmChange(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm outline-none focus:border-brand-500"
            >
              <option value="">{t("dashboard.allFarms", "All Farms")}</option>
              {kpi.farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Accounting-style overview — KPIs, yearly ledger, charts & tables */}
      <DashboardOverview kpi={kpi} t={t} />

      {/* Quick Access — clean navigation tiles (detail lives in the panels above) */}
      {visibleModules.length > 0 && (
        <>
          <h2 className="mb-4 text-lg font-bold text-gray-800">{t("dashboard.quickAccess")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visibleModules.map((mod) => {
              // HR & Tasks keep their richer detail cards in Quick Access.
              if (mod.key === "hr") return <HrCard key="hr" mod={mod} kpi={kpi} navigate={navigate} t={t} />;
              if (mod.key === "tasks") return <TasksCard key="tasks" mod={mod} kpi={kpi} navigate={navigate} t={t} />;
              const Icon = mod.icon;
              const metrics = getModuleMetrics(mod, kpi, t).slice(0, 2);
              return (
                <div
                  key={mod.key}
                  onClick={() => navigate(mod.path)}
                  className="group cursor-pointer rounded-2xl border border-gray-100 bg-white p-4 shadow-card transition-all hover:-translate-y-1 hover:border-brand-200 hover:shadow-soft"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${mod.color} text-white shadow-sm`}>
                      <Icon size={20} />
                    </div>
                    <p className="flex-1 text-sm font-bold leading-tight text-gray-800">{t(mod.label)}</p>
                    <ArrowRight size={16} className="shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </div>
                  {metrics.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {metrics.map((m, i) => (
                        <div key={i} className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                          <p className="truncate text-[10px] text-gray-500">{m.label.includes(".") ? t(m.label) : m.label}</p>
                          <p className="truncate text-sm font-bold text-gray-800">{m.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────── Redesigned dashboard ─────────────────────────
// `to` renders a full-width "View All →" footer that opens the module page.
function Panel({ title, action, subtitle, children, className = "", to, viewLabel = "View All" }) {
  const navigate = useNavigate();
  return (
    <div className={`flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-card ${className}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {action}
      </div>
      {subtitle && <p className="mb-2 text-[11px] text-gray-400">{subtitle}</p>}
      <div className="flex-1">{children}</div>
      {to && (
        <button
          onClick={() => navigate(to)}
          className="mt-3 w-full rounded-lg border border-gray-100 bg-gray-50 py-2 text-center text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-800"
        >
          {viewLabel} →
        </button>
      )}
    </div>
  );
}

function YearSelect({ years, value, onChange }) {
  if (!years.length) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 outline-none focus:border-brand-500"
    >
      {years.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );
}

// Month dropdown — value is "ALL" or "01".."12" (matches the date's MM part).
function MonthSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 outline-none focus:border-brand-500"
    >
      <option value="ALL">All Months</option>
      {MONTHS.map((m, i) => (
        <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
      ))}
    </select>
  );
}

function KpiCard({ icon: Icon, iconBg, iconFg, title, value, sub, to }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={to ? () => navigate(to) : undefined}
      className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-card ${
        to ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft" : ""
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon size={18} className={iconFg} />
        </div>
        <p className="text-[11px] font-medium leading-tight text-gray-500">{title}</p>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-gray-400">{sub}</p>}
      {to && <p className="mt-1.5 text-[11px] font-semibold text-brand-600">View →</p>}
    </div>
  );
}

// Shared fetch for the Balance Sheet + Farm-wise panels: all approved expenses
// and revenue entries, filtered client-side by farm/year/month inside each
// panel. Loads once per visit and re-fetches when the tab regains focus, so
// records deleted elsewhere disappear without hammering the backend on a
// timer (navigating back to the dashboard also remounts and reloads).
function useFinanceRows() {
  const [rows, setRows] = useState({ expenses: [], revenues: [], loading: true });
  useEffect(() => {
    let alive = true;
    const load = () => {
      const params = { page_size: 10000 };
      Promise.all([
        resource("finance/expenses").list({ ...params, status: "APPROVED" }),
        resource("finance/revenues").list(params),
      ])
        .then(([exp, rev]) => {
          if (!alive) return;
          setRows({
            expenses: Array.isArray(exp) ? exp : exp.results || [],
            revenues: Array.isArray(rev) ? rev : rev.results || [],
            loading: false,
          });
        })
        .catch(() => alive && setRows((r) => ({ ...r, loading: false })));
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return rows;
}

// Distinct years (desc) present in the rows' dates, always including this year.
function yearsFromRows(...lists) {
  const set = new Set([String(new Date().getFullYear())]);
  lists.flat().forEach((r) => {
    const y = String(r.date || "").slice(0, 4);
    if (/^\d{4}$/.test(y)) set.add(y);
  });
  return [...set].sort((a, b) => Number(b) - Number(a));
}

function DashboardOverview({ kpi }) {
  const fk = kpi.farm_kpis ?? {};
  const wk = kpi.workforce_kpis ?? {};
  const fin = kpi.financial_kpis ?? {};
  const monthly = fin.monthly ?? {};
  const finRows = useFinanceRows();
  const years = Object.keys(monthly).sort((a, b) => Number(b) - Number(a));
  const defaultYear = years[0] || String(new Date().getFullYear());
  const [lineYear, setLineYear] = useState(defaultYear);

  const kpis = [
    { icon: Tractor, iconBg: "bg-emerald-50", iconFg: "text-emerald-600", title: "Total Farms", value: fk.total_farms ?? 0, sub: `Active ${fk.total_farms ?? 0}`, to: "/farms" },
    { icon: LayoutGrid, iconBg: "bg-blue-50", iconFg: "text-blue-600", title: "Total Fields", value: fk.total_fields ?? 0, sub: `Cultivated ${fk.cultivated_fields ?? 0}`, to: "/farms" },
    { icon: MapPin, iconBg: "bg-teal-50", iconFg: "text-teal-600", title: "Total Area", value: Number(fk.total_area || 0).toLocaleString("en-IN"), sub: "acres", to: "/farms" },
    { icon: Users, iconBg: "bg-violet-50", iconFg: "text-violet-600", title: "Total Employees", value: wk.total_employees ?? 0, sub: `Active ${wk.active_employees ?? 0}`, to: "/workforce" },
    { icon: Banknote, iconBg: "bg-rose-50", iconFg: "text-rose-600", title: "Total Expenses (This Year)", value: inr(fin.this_year_expenses), sub: `This Month: ${inr(fin.this_month_expenses)}`, to: "/finance" },
    { icon: Coins, iconBg: "bg-emerald-50", iconFg: "text-emerald-600", title: "Total Revenue (This Year)", value: inr(fin.this_year_revenue), sub: `This Month: ${inr(fin.this_month_revenue)}`, to: "/finance" },
    { icon: TrendingUp, iconBg: "bg-blue-50", iconFg: "text-blue-600", title: "Net Profit (This Year)", value: inr(fin.this_year_net), sub: `Margin: ${fin.this_year_margin ?? 0}%`, to: "/finance/reports" },
  ];

  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FinancialSummaryPanel monthly={monthly} years={years} year={lineYear} setYear={setLineYear} />
        <ExpenseCategoryPanel fin={fin} />
        <FarmWisePanel farms={kpi.farms || []} finRows={finRows} />
      </div>

      <BalanceSheetPanel farms={kpi.farms || []} finRows={finRows} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HrOverviewPanel wk={wk} />
        <RecentTransactionsPanel kpi={kpi} />
        <UpcomingTasksPanel kpi={kpi} />
      </div>

      <PayrollByEmployeePanel />
    </div>
  );
}

function PayrollByEmployeePanel() {
  const currentYear = String(new Date().getFullYear());
  const [payments, setPayments] = useState(null); // null = loading
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState("ALL");

  useEffect(() => {
    let alive = true;
    resource("payroll/payments")
      .list({ page_size: 10000 })
      .then((d) => alive && setPayments(Array.isArray(d) ? d : d.results || []))
      .catch(() => alive && setPayments((p) => p || []));
    return () => { alive = false; };
  }, []);

  const list = payments || [];
  const years = yearsFromRows(list);
  const inScope = (r) =>
    (year === "ALL" || String(r.date || "").startsWith(`${year}-`)) &&
    (month === "ALL" || String(r.date || "").slice(5, 7) === month);

  const byEmp = new Map();
  list.filter(inScope).forEach((r) => {
    const key = `${r.employee_name || "—"}|${r.farm_name || ""}`;
    const b = byEmp.get(key) || { employee: r.employee_name || "—", farm_name: r.farm_name, paid: 0 };
    b.paid += Number(r.amount || 0);
    byEmp.set(key, b);
  });
  const rows = [...byEmp.values()].sort((a, b) => b.paid - a.paid);
  const total = rows.reduce((s, r) => s + Number(r.paid || 0), 0);

  const download = () => {
    const data = rows.map((r) => ({ employee: r.employee, farm: r.farm_name || "—", paid: Number(r.paid || 0) }));
    data.push({ employee: "Total", farm: "", paid: total });
    const period = `${year === "ALL" ? "all-years" : year}${month === "ALL" ? "" : `-${MONTHS[Number(month) - 1]}`}`;
    exportExcel(
      data,
      [
        { key: "employee", header: "Employee" },
        { key: "farm", header: "Farm" },
        { key: "paid", header: "Salary Paid" },
      ],
      `salary-by-employee-${period}.xlsx`,
      "Salary",
    );
  };
  return (
    <Panel
      title="Salary Paid by Employee"
      subtitle="Who received how much — actual payouts"
      to="/payroll/payments"
      viewLabel="View Employee Payments"
      action={
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 outline-none focus:border-brand-500"
          >
            <option value="ALL">All Years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <MonthSelect value={month} onChange={setMonth} />
          {rows.length > 0 && (
            <button
              onClick={download}
              title="Download salary summary"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 hover:text-brand-600"
            >
              <Download size={13} /> Excel
            </button>
          )}
        </div>
      }
    >
      {payments === null ? (
        <p className="py-6 text-center text-xs text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">
          No salary paid in {month === "ALL" ? "" : `${MONTHS[Number(month) - 1]} `}{year === "ALL" ? "any year" : year}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1 text-left">Employee</th>
                <th className="py-1 text-left">Farm</th>
                <th className="py-1 text-right">Salary Paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 font-semibold text-gray-700">{r.employee}</td>
                  <td className="py-1.5 text-green-700">{r.farm_name || "—"}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-800">{inr(r.paid)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 font-bold">
                <td className="py-1.5 text-gray-800" colSpan={2}>Total</td>
                <td className="py-1.5 text-right text-gray-800">{inr(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function FinancialSummaryPanel({ monthly, years, year, setYear }) {
  const data = (monthly[year] || []).map((m) => ({
    name: MONTHS[m.month - 1], Expenses: m.expenses, Revenue: m.revenue, Net: m.revenue - m.expenses,
  }));
  return (
    <Panel
      title="Monthly Trend (Revenue vs Expenses)"
      subtitle="Month-by-month movement for the selected year"
      action={<YearSelect years={years} value={year} onChange={setYear} />}
      to="/finance/reports"
      viewLabel="View Financial Reports"
    >
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}K` : v)} />
          <Tooltip formatter={(v) => inr(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Revenue" stroke="#22c55e" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Net" stroke="#3b82f6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function ExpenseCategoryPanel({ fin }) {
  const cats = fin.expenses_by_category || [];
  const total = cats.reduce((s, c) => s + Number(c.total || 0), 0);
  const data = cats.map((c) => ({ name: c.category, value: Number(c.total || 0) }));
  return (
    <Panel title="Expense by Category (This Year)" to="/finance" viewLabel="View Expenses">
      {data.length === 0 ? (
        <p className="py-10 text-center text-xs text-gray-400">No expense data</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="w-1/2">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2}>
                    {data.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => inr(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1">
              {data.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 truncate text-gray-600">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                    <span className="truncate">{prettyLabel(c.name)}</span>
                  </span>
                  <span className="ml-1 shrink-0 text-right">
                    <span className="font-semibold text-gray-700">{inr(c.value)}</span>
                    <span className="ml-1 text-[10px] text-gray-400">{total ? ((c.value / total) * 100).toFixed(1) : 0}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-400">Total Expenses: {inr(total)}</p>
        </>
      )}
    </Panel>
  );
}

function FarmWisePanel({ farms, finRows }) {
  const currentYear = String(new Date().getFullYear());
  const [year, setYear] = useState(currentYear);
  const inYear = (r) => year === "ALL" || String(r.date || "").startsWith(`${year}-`);
  const years = yearsFromRows(finRows.expenses, finRows.revenues);

  // Seed with every farm (so zero-activity farms still show), then add sums.
  const byFarm = new Map(
    farms.map((f) => [String(f.id), { farm_id: String(f.id), farm_name: f.name, expenses: 0, revenue: 0 }])
  );
  const bucket = (r) => {
    const key = String(r.farm);
    if (!byFarm.has(key)) {
      byFarm.set(key, { farm_id: key, farm_name: r.farm_name || "—", expenses: 0, revenue: 0 });
    }
    return byFarm.get(key);
  };
  finRows.expenses.filter(inYear).forEach((r) => { bucket(r).expenses += Number(r.amount || 0); });
  finRows.revenues.filter(inYear).forEach((r) => { bucket(r).revenue += Number(r.amount || 0); });
  const rows = [...byFarm.values()].map((f) => ({ ...f, net: f.revenue - f.expenses }));

  const tExp = rows.reduce((s, f) => s + Number(f.expenses || 0), 0);
  const tRev = rows.reduce((s, f) => s + Number(f.revenue || 0), 0);
  const tNet = tRev - tExp;
  const margin = (net, rev) => (rev ? `${(net / rev * 100).toFixed(2)}%` : "0%");

  const download = () => {
    const data = rows.map((f) => {
      const rev = Number(f.revenue || 0), net = Number(f.net || 0);
      return {
        farm: f.farm_name,
        expenses: Number(f.expenses || 0),
        revenue: rev,
        net,
        margin: margin(net, rev),
      };
    });
    data.push({ farm: "Total", expenses: tExp, revenue: tRev, net: tNet, margin: margin(tNet, tRev) });
    exportExcel(
      data,
      [
        { key: "farm", header: "Farm" },
        { key: "expenses", header: "Expenses" },
        { key: "revenue", header: "Revenue" },
        { key: "net", header: "Net Profit" },
        { key: "margin", header: "Margin" },
      ],
      `farm-wise-financial-summary-${year === "ALL" ? "all-years" : year}.xlsx`,
      "Farm Summary",
    );
  };

  return (
    <Panel
      title="Farm wise Financial Overview"
      to="/finance/reports"
      viewLabel="View Financial Reports"
      action={
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 outline-none focus:border-brand-500"
          >
            <option value="ALL">All Years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {rows.length > 0 && (
            <button
              onClick={download}
              title="Download farm-wise summary"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 hover:text-brand-600"
            >
              <Download size={13} /> Excel
            </button>
          )}
        </div>
      }
    >
      {finRows.loading ? (
        <p className="py-8 text-center text-xs text-gray-400">Loading…</p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-gray-400">
              <th className="py-1 text-left">Farm</th><th className="py-1 text-right">Expenses</th>
              <th className="py-1 text-right">Revenue</th><th className="py-1 text-right">Net Profit</th><th className="py-1 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const rev = Number(f.revenue || 0), net = Number(f.net || 0);
              return (
                <tr key={f.farm_id} className="border-t border-gray-100">
                  <td className="py-1.5 font-semibold text-green-700">{f.farm_name}</td>
                  <td className="py-1.5 text-right text-rose-600">{inr(f.expenses)}</td>
                  <td className="py-1.5 text-right text-emerald-600">{inr(f.revenue)}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-800">{inr(f.net)}</td>
                  <td className="py-1.5 text-right text-gray-600">{rev ? (net / rev * 100).toFixed(2) : 0}%</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-gray-200 font-bold">
              <td className="py-1.5 text-gray-800">Total</td>
              <td className="py-1.5 text-right text-rose-600">{inr(tExp)}</td>
              <td className="py-1.5 text-right text-emerald-600">{inr(tRev)}</td>
              <td className="py-1.5 text-right text-gray-800">{inr(tNet)}</td>
              <td className="py-1.5 text-right text-gray-700">{tRev ? (tNet / tRev * 100).toFixed(2) : 0}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      )}
    </Panel>
  );
}

// ── Farm-wise Balance Sheet ──────────────────────────────────────────────
// Debit side = approved expenses grouped by category, Credit side = revenue
// grouped by category. Own farm + year selectors, independent of the global
// dashboard scope, so any farm's sheet can be checked without reloading.
function BalanceSheetPanel({ farms, finRows }) {
  const currentYear = String(new Date().getFullYear());
  const [farm, setFarm] = useState("");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState("ALL");
  const loading = finRows.loading;

  const inScope = (r) =>
    (!farm || String(r.farm) === String(farm)) &&
    (year === "ALL" || String(r.date || "").startsWith(`${year}-`)) &&
    (month === "ALL" || String(r.date || "").slice(5, 7) === month);
  const groupByCategory = (list) => {
    const map = new Map();
    list.filter(inScope).forEach((r) => {
      const key = r.category || "OTHER";
      map.set(key, (map.get(key) || 0) + Number(r.amount || 0));
    });
    return [...map.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  };

  const debits = groupByCategory(finRows.expenses);
  const credits = groupByCategory(finRows.revenues);
  const debitTotal = debits.reduce((s, r) => s + r.total, 0);
  const creditTotal = credits.reduce((s, r) => s + r.total, 0);
  const balance = creditTotal - debitTotal;

  const years = yearsFromRows(finRows.expenses, finRows.revenues);

  const maxRows = Math.max(debits.length, credits.length);
  const farmName = farm ? (farms.find((f) => String(f.id) === String(farm))?.name || "") : "All Farms";

  const download = () => {
    const data = [];
    for (let i = 0; i < maxRows; i++) {
      data.push({
        debit_category: debits[i] ? prettyLabel(debits[i].category) : "",
        debit_amount: debits[i] ? debits[i].total : "",
        credit_category: credits[i] ? prettyLabel(credits[i].category) : "",
        credit_amount: credits[i] ? credits[i].total : "",
      });
    }
    data.push({ debit_category: "Total Debit", debit_amount: debitTotal, credit_category: "Total Credit", credit_amount: creditTotal });
    data.push({ debit_category: "Balance", debit_amount: balance >= 0 ? "CREDIT" : "DEBIT", credit_category: "", credit_amount: Math.abs(balance) });
    const period = `${year === "ALL" ? "all-years" : year}${month === "ALL" ? "" : `-${MONTHS[Number(month) - 1]}`}`;
    exportExcel(
      data,
      [
        { key: "debit_category", header: "Debit (Expense Category)" },
        { key: "debit_amount", header: "Debit Amount" },
        { key: "credit_category", header: "Credit (Revenue Category)" },
        { key: "credit_amount", header: "Credit Amount" },
      ],
      `balance-sheet-${farmName.replace(/\s+/g, "-").toLowerCase()}-${period}.xlsx`,
      "Balance Sheet",
    );
  };

  return (
    <Panel
      title="Balance Sheet (Farm wise)"
      subtitle="Category-wise Debit (expenses) vs Credit (revenue)"
      to="/finance/ledger"
      viewLabel="View Ledger"
      action={
        <div className="flex items-center gap-2">
          <select
            value={farm}
            onChange={(e) => setFarm(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 outline-none focus:border-brand-500"
          >
            <option value="">All Farms</option>
            {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 outline-none focus:border-brand-500"
          >
            <option value="ALL">All Years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <MonthSelect value={month} onChange={setMonth} />
          <button
            onClick={download}
            title="Download balance sheet"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 hover:text-brand-600"
          >
            <Download size={13} /> Excel
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="py-8 text-center text-xs text-gray-400">Loading…</p>
      ) : maxRows === 0 ? (
        <p className="py-8 text-center text-xs text-gray-400">
          No entries for {farmName} ({month === "ALL" ? "" : `${MONTHS[Number(month) - 1]} `}{year === "ALL" ? "all years" : year})
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide">
                <th className="rounded-tl-lg bg-rose-50 py-1.5 pl-2 text-left text-rose-600" colSpan={2}>Debit (Kharch)</th>
                <th className="rounded-tr-lg bg-emerald-50 py-1.5 pl-2 text-left text-emerald-600" colSpan={2}>Credit (Aavak)</th>
              </tr>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1 pl-2 text-left">Category</th>
                <th className="py-1 pr-2 text-right">Amount</th>
                <th className="border-l border-gray-100 py-1 pl-2 text-left">Category</th>
                <th className="py-1 pr-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }, (_, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 pl-2 font-medium text-gray-700">{debits[i] ? prettyLabel(debits[i].category) : ""}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold text-rose-600">{debits[i] ? inr(debits[i].total) : ""}</td>
                  <td className="border-l border-gray-100 py-1.5 pl-2 font-medium text-gray-700">{credits[i] ? prettyLabel(credits[i].category) : ""}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold text-emerald-600">{credits[i] ? inr(credits[i].total) : ""}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 font-bold">
                <td className="py-2 pl-2 text-gray-800">Total Debit</td>
                <td className="py-2 pr-2 text-right text-rose-600">{inr(debitTotal)}</td>
                <td className="border-l border-gray-100 py-2 pl-2 text-gray-800">Total Credit</td>
                <td className="py-2 pr-2 text-right text-emerald-600">{inr(creditTotal)}</td>
              </tr>
              <tr className={`font-bold ${balance >= 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                <td className="rounded-bl-lg py-2 pl-2" colSpan={2}>
                  Balance ({balance >= 0 ? "Credit" : "Debit"}) — {farmName}
                </td>
                <td className="rounded-br-lg py-2 pr-2 text-right text-sm" colSpan={2}>{inr(Math.abs(balance))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function HrOverviewPanel({ wk }) {
  const rows = wk.farm_breakdown || [];
  const stats = [
    { icon: Users, fg: "text-violet-600", bg: "bg-violet-50", label: "Total Users", value: wk.total_employees ?? 0, sub: `Active: ${wk.active_employees ?? 0}` },
    { icon: CalendarCheck, fg: "text-green-600", bg: "bg-green-50", label: "Present Today", value: wk.present_today ?? 0 },
    { icon: Plane, fg: "text-amber-600", bg: "bg-amber-50", label: "On Leave", value: wk.on_leave_today ?? 0 },
    { icon: UserMinus, fg: "text-rose-600", bg: "bg-rose-50", label: "Absent", value: wk.absent_today ?? 0 },
  ];
  return (
    <Panel title="HR Overview" to="/workforce" viewLabel="View Employees">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="rounded-xl bg-gray-50 p-2 text-center">
              <div className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-lg ${s.bg}`}><Icon size={16} className={s.fg} /></div>
              <p className="text-[10px] text-gray-500">{s.label}</p>
              <p className="text-base font-bold text-gray-800">{s.value}</p>
              {s.sub && <p className="text-[9px] text-gray-400">{s.sub}</p>}
            </div>
          );
        })}
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1 text-left">Farm</th><th className="py-1 text-right">Total Users</th>
                <th className="py-1 text-right">Check In</th><th className="py-1 text-right">Absent</th><th className="py-1 text-right">On Leave</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.farm_id} className="border-t border-gray-100">
                  <td className="py-1.5 font-semibold text-green-700">{f.farm_name}</td>
                  <td className="py-1.5 text-right text-gray-700">{f.total_count}</td>
                  <td className="py-1.5 text-right text-green-600">{f.checkin_today_count ?? 0}</td>
                  <td className="py-1.5 text-right text-rose-600">{f.absent_today_count ?? 0}</td>
                  <td className="py-1.5 text-right text-amber-600">{f.on_leave_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function RecentTransactionsPanel({ kpi }) {
  const tx = kpi.recent_transactions || [];
  return (
    <Panel title="Recent Transactions" to="/finance" viewLabel="View All Transactions">
      {tx.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">No transactions</p>
      ) : (
        <div className="space-y-1.5">
          {tx.map((x, i) => {
            const income = x.type === "REVENUE";
            return (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${income ? "bg-emerald-50" : "bg-rose-50"}`}>
                    {income ? <TrendingUp size={14} className="text-emerald-600" /> : <TrendingDown size={14} className="text-rose-600" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-gray-700">{x.label}</p>
                    <p className="truncate text-[10px] text-gray-400">{x.farm_name || "—"}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-xs font-bold ${income ? "text-emerald-600" : "text-rose-600"}`}>{income ? "+" : "-"}{inr(x.amount)}</p>
                  <p className="text-[10px] text-gray-400">{x.date}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function UpcomingTasksPanel({ kpi }) {
  const tasks = kpi.upcoming_tasks || [];
  const prColor = { URGENT: "bg-red-100 text-red-700", HIGH: "bg-red-50 text-red-600", MEDIUM: "bg-amber-50 text-amber-600", LOW: "bg-gray-100 text-gray-500" };
  return (
    <Panel title="Upcoming Tasks" to="/tasks" viewLabel="View All Tasks">
      {tasks.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">No upcoming tasks</p>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((tk) => (
            <div key={tk.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-gray-700">{tk.title}</p>
                <p className="truncate text-[10px] text-gray-400">{tk.farm_name || "—"} · {tk.due_date}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${prColor[tk.priority] || prColor.LOW}`}>{tk.priority}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function TasksCard({ mod, kpi, navigate, t }) {
  const tk = kpi.task_kpis ?? {};
  const active = tk.active_tasks || [];
  const completed = tk.today_completed_tasks || [];

  return (
    <div
      onClick={() => navigate(mod.path)}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft col-span-1 sm:col-span-2"
    >
      <div className={`h-1.5 w-full bg-gradient-to-r ${mod.color}`} />
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${mod.bg}`}>
              <ClipboardList size={20} className="text-gray-700" />
            </div>
            <p className="text-sm font-bold text-gray-800">{t(mod.label)}</p>
          </div>
          <div className="flex gap-3 text-xs text-gray-500">
            <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">{tk.open_tasks} active</span>
            <span className="rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-600">{tk.completed_tasks} completed</span>
          </div>
        </div>
        <div className="scrollable-content grid max-h-[200px] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
          {/* Active tasks */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Active Tasks</p>
            {active.length === 0 ? (
              <p className="text-xs text-gray-400">No active tasks</p>
            ) : (
              <div className="space-y-1">
                {active.map((task) => (
                  <div key={task.id} className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-1.5">
                    <span className="truncate text-xs text-gray-700">{task.title}</span>
                    <span className="ml-2 shrink-0 text-xs font-medium text-rose-600">{task.assigned_user}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Completed in last 12h */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Completed (last 12h)</p>
            {completed.length === 0 ? (
              <p className="text-xs text-gray-400">None completed yet today</p>
            ) : (
              <div className="space-y-1">
                {completed.map((task) => (
                  <div key={task.id} className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-1.5">
                    <span className="truncate text-xs text-gray-700">{task.title}</span>
                    <span className="ml-2 shrink-0 text-xs font-medium text-green-600">{task.assigned_user}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
          {t("common.view")} <ArrowRight size={12} />
        </div>
      </div>
    </div>
  );
}

function HrCard({ mod, kpi, navigate, t }) {
  const wk = kpi.workforce_kpis ?? {};
  const breakdown = wk.farm_breakdown || [];

  return (
    <div
      onClick={() => navigate(mod.path)}
      className="group col-span-1 cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft sm:col-span-2"
    >
      <div className={`h-1.5 w-full bg-gradient-to-r ${mod.color}`} />
      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${mod.bg}`}>
              <Users size={20} className="text-gray-700" />
            </div>
            <p className="text-sm font-bold text-gray-800">{t(mod.label)}</p>
          </div>

        </div>
        {breakdown.length > 0 ? (
          <div className="mb-3">
            {/* Common header row — stays fixed */}
            <div className="mb-1.5 flex items-center justify-between rounded-lg bg-gray-100 px-2.5 py-1.5 sm:px-3">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Farm</span>
              <div className="flex items-center gap-3 sm:gap-4 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                <span title="Total users assigned to this farm">Total Users</span>
                <span title="Users who completed check-in today">Check In</span>
              </div>
            </div>
            {/* Farm rows — scrollable */}
            <div className="scrollable-content max-h-[160px] space-y-1 overflow-y-auto">
              {breakdown.map((farm) => (
                <div
                  key={farm.farm_id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5 sm:px-3"
                >
                  <span className="min-w-0 flex-1 truncate pr-2 text-xs font-bold text-green-700">🌾 {farm.farm_name}</span>
                  <div className="flex shrink-0 items-center gap-3 sm:gap-4 text-xs">
                    <span className="w-5 text-right font-semibold text-gray-800 sm:w-6">{farm.total_count}</span>
                    {/* Today's completed check-ins for this farm */}
                    <span className="flex w-5 items-center justify-end gap-1 font-semibold text-green-600 sm:w-6">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                      {farm.checkin_today_count ?? 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-3 flex items-center justify-center rounded-lg bg-gray-50 py-4">
            <p className="text-xs text-gray-400">{t("common.noRecords")}</p>
          </div>
        )}
        <div className="flex items-center justify-end gap-1 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
          {t("common.view")} <ArrowRight size={12} />
        </div>
      </div>
    </div>
  );
}

function FinanceCard({ mod, kpi, navigate, t }) {
  const fin = kpi.financial_kpis ?? {};
  const breakdown = fin.farm_breakdown || [];
  const Icon = mod.icon;
  const fmt = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <div
      onClick={() => navigate(mod.path)}
      className="group col-span-1 cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft sm:col-span-2"
    >
      <div className={`h-1.5 w-full bg-gradient-to-r ${mod.color}`} />
      <div className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${mod.bg}`}>
            <Icon size={20} className="text-gray-700" />
          </div>
          <p className="text-sm font-bold text-gray-800">{t(mod.label)}</p>
        </div>
        {breakdown.length > 0 ? (
          <div className="mb-3">
            {/* Header row */}
            <div className="mb-1.5 flex items-center justify-between rounded-lg bg-gray-100 px-2.5 py-1.5 sm:px-3">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Farm</span>
              <div className="flex items-center gap-2 sm:gap-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                <span className="w-14 text-right sm:w-16">{t("header.expenses", "Expenses")}</span>
                <span className="w-14 text-right sm:w-16">{t("header.revenue")}</span>
                <span className="w-14 text-right sm:w-16">{t("header.net")}</span>
              </div>
            </div>
            {/* Per-farm rows */}
            <div className="scrollable-content max-h-[160px] space-y-1 overflow-y-auto">
              {breakdown.map((f) => (
                <div
                  key={f.farm_id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5 sm:px-3"
                >
                  <span className="min-w-0 flex-1 truncate pr-2 text-xs font-bold text-green-700">🌾 {f.farm_name}</span>
                  <div className="flex shrink-0 items-center gap-2 sm:gap-3 text-xs">
                    <span className="w-14 text-right font-semibold text-rose-600 sm:w-16">{fmt(f.expenses)}</span>
                    <span className="w-14 text-right font-semibold text-emerald-600 sm:w-16">{fmt(f.revenue)}</span>
                    <span className={`w-14 text-right font-bold sm:w-16 ${Number(f.net) >= 0 ? "text-gray-800" : "text-red-600"}`}>{fmt(f.net)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-3 flex items-center justify-center rounded-lg bg-gray-50 py-4">
            <p className="text-xs text-gray-400">{t("common.noRecords")}</p>
          </div>
        )}
        {/* Totals */}
        <div className="mb-2 flex items-center justify-between rounded-lg bg-brand-50 px-2.5 py-1.5 sm:px-3 text-xs">
          <span className="font-semibold text-gray-600">{t("common.total")}</span>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="w-14 text-right font-semibold text-rose-600 sm:w-16">{fmt(fin.total_expenses)}</span>
            <span className="w-14 text-right font-semibold text-emerald-600 sm:w-16">{fmt(fin.total_revenue)}</span>
            <span className="w-14 text-right font-bold text-gray-800 sm:w-16">{fmt(fin.net)}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
          {t("common.view")} <ArrowRight size={12} />
        </div>
      </div>
    </div>
  );
}

function GpsCard({ mod, kpi, navigate, t }) {
  const gps = kpi.today_gps || [];
  const activeUsers = gps.filter((p) => p.latitude != null);

  return (
    <div
      onClick={() => navigate(mod.path)}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft"
    >
      <div className={`h-1.5 w-full bg-gradient-to-r ${mod.color}`} />
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${mod.bg}`}>
              <MapPin size={20} className="text-gray-700" />
            </div>
            <p className="text-sm font-bold text-gray-800">{t(mod.label)}</p>
          </div>
          <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-600">
            {activeUsers.length} active
          </span>
        </div>
        {activeUsers.length > 0 ? (
          <div className="scrollable-content mb-3 max-h-[200px] space-y-1.5 overflow-y-auto">
            {activeUsers.slice(0, 5).map((ping) => (
              <div
                key={ping.user_id}
                className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-[10px] font-bold text-cyan-700">
                  {(ping.user_name || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-700">
                    {ping.user_name}
                    {ping.farm_name && (
                      <span className="ml-1 text-gray-400">· {ping.farm_name}</span>
                    )}
                  </p>
                  <p className="flex items-center gap-1 text-[10px] text-gray-400">
                    {Number(ping.latitude).toFixed(4)}, {Number(ping.longitude).toFixed(4)}
                    <span>· {new Date(ping.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </p>
                </div>
                {ping.activity === "CHECKIN" && (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                )}
              </div>
            ))}
            {activeUsers.length > 5 && (
              <p className="text-center text-[10px] text-gray-400">+{activeUsers.length - 5} more</p>
            )}
          </div>
        ) : (
          <div className="mb-3 flex items-center justify-center rounded-lg bg-gray-50 py-4">
            <p className="text-xs text-gray-400">{t("common.view")}</p>
          </div>
        )}
        <div className="flex items-center justify-end gap-1 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
          {t("common.view")} <ArrowRight size={12} />
        </div>
      </div>
    </div>
  );
}


function KPICard({ label, value, icon: Icon, color }) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
    green: "bg-green-50 text-green-700",
    rose: "bg-rose-50 text-rose-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    orange: "bg-orange-50 text-orange-700",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-card">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colorMap[color] || colorMap.emerald}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-500">{label}</p>
        <p className="text-base font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function getModuleMetrics(mod, kpi) {
  const fk = kpi.farm_kpis ?? {};
  const wk = kpi.workforce_kpis ?? {};
  const ck = kpi.crop_kpis ?? {};
  const tk = kpi.task_kpis ?? {};
  const fin = kpi.financial_kpis ?? {};
  const inv = kpi.inventory_kpis || {};
  const fmt = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  switch (mod.key) {
    case "farmAdmin":
      return [
        { label: "dashboard.totalFarms", value: fk.total_farms },
        { label: "header.fields", value: fk.total_fields },
      ];
    case "finance":
      return [
        { label: "header.revenue", value: fmt(fin.total_revenue) },
        { label: "header.net", value: fmt(fin.net) },
        { label: "Expenses", value: fmt(fin.total_expenses) },
      ];
    case "hr":
      return [
        { label: "dashboard.employees", value: wk.total_employees },
        { label: "dashboard.presentToday", value: wk.present_today },
        { label: "Absent Today", value: wk.absent_today ?? 0 },
        { label: "Managers", value: wk.manager_count ?? 0 },
        { label: "Pending Approvals", value: wk.pending_approvals ?? 0 },
      ];
    case "payroll":
      return [
        { label: "Advances", value: fmt(fin.total_advances) },
        { label: "Outstanding", value: fmt(fin.outstanding_advances) },
        { label: "Deductions", value: fmt(fin.total_deductions) },
      ];
    case "tasks":
      return [];
    case "agronomy":
      return [
        { label: "dashboard.activeCrops", value: ck.active_crops },
        { label: "dashboard.harvestQty", value: Number(ck.total_harvest_qty ?? 0).toFixed(1) },
      ];
    case "inventory":
      return [
        { label: "Total Items", value: inv.total_items ?? 0 },
        { label: "Low Stock", value: inv.low_stock_count ?? 0 },
        { label: "Stock Value", value: fmt(inv.stock_value) },
      ];
    case "documents":
      return [
        { label: "Total Documents", value: kpi.document_kpis?.total_documents ?? 0 },
      ];
    case "breakdowns":
      return [
        { label: "Open", value: kpi.breakdown_kpis?.open_breakdowns ?? 0 },
        { label: "Total", value: kpi.breakdown_kpis?.total_breakdowns ?? 0 },
      ];
    case "administration":
      return [
        { label: "Total Users", value: kpi.admin_kpis?.total_users ?? 0 },
      ];
    default:
      return [];
  }
}
