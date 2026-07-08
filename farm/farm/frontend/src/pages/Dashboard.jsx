import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Tractor, Wallet, Users, Banknote, ClipboardList, MapPin,
  Sprout, Boxes, FileText, AlertTriangle, UserCog, ArrowRight,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

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
  const pollingRef = useRef(null);
  const retryRef = useRef(null);
  const kpiRef = useRef(null);

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
      .get("/reporting/dashboard/", { timeout: 20000 })
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

 useEffect(() => {
  // ⛔ Do NOT fire any API call until auth is fully initialized.
  // Otherwise the backend receives the request without an Authorization
  // header and returns 401, triggering an unnecessary refresh cycle.
  if (authLoading || !user) return;

  loadDashboard();

  if (!pollingRef.current) {
    const base = 120000;
    const jitter = Math.floor(Math.random() * base * 0.4) - Math.floor(base * 0.2); // ±20%
    pollingRef.current = setInterval(() => {
      loadDashboard(0);
    }, base + jitter); // ~2 minutes with jitter
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
      {/* Welcome banner */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-700 to-brand-900 p-6 text-white shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("layout.welcome", { name: user?.first_name || user?.username })}</h1>
            <p className="mt-1 text-sm text-brand-100/80">{t("layout.overview")}</p>
          </div>
        </div>
      </div>



      {/* Module Overview Cards — only show accessible modules */}
      {visibleModules.length > 0 && (
        <>
          <h2 className="mb-4 text-lg font-bold text-gray-800">{t("dashboard.quickAccess")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleModules.map((mod) => {
              const Icon = mod.icon;
              const metrics = getModuleMetrics(mod, kpi, t);
              if (mod.key === "tasks") {
                return (
                  <TasksCard
                    key="tasks"
                    mod={mod}
                    kpi={kpi}
                    navigate={navigate}
                    t={t}
                  />
                );
              }
              if (mod.key === "gps") {
                return (
                  <GpsCard
                    key="gps"
                    mod={mod}
                    kpi={kpi}
                    navigate={navigate}
                    t={t}
                  />
                );
              }
              if (mod.key === "hr") {
                return (
                  <HrCard
                    key="hr"
                    mod={mod}
                    kpi={kpi}
                    navigate={navigate}
                    t={t}
                  />
                );
              }
              if (mod.key === "finance") {
                return (
                  <FinanceCard
                    key="finance"
                    mod={mod}
                    kpi={kpi}
                    navigate={navigate}
                    t={t}
                  />
                );
              }
              return (
                <div
                  key={mod.key}
                  onClick={() => navigate(mod.path)}
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <div className={`h-1.5 w-full bg-gradient-to-r ${mod.color}`} />
                  <div className="p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${mod.bg}`}>
                        <Icon size={20} className="text-gray-700" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-800">{t(mod.label)}</p>
                      </div>
                    </div>
                    {metrics.length > 0 ? (
                      <div className="scrollable-content mb-3 max-h-[200px] space-y-1.5 overflow-y-auto">
                        {metrics.map((m, i) => (
                          <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5">
                            <span className="text-xs text-gray-500">{m.label.includes(".") ? t(m.label) : m.label}</span>
                            <span className="text-sm font-bold text-gray-800">{m.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="scrollable-content mb-3 flex max-h-[200px] items-center justify-center overflow-y-auto rounded-lg bg-gray-50 py-4">
                        <p className="text-xs text-gray-400">{t("common.view")}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                      {t("common.view")} <ArrowRight size={12} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
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
          {/* Currently on the clock: checked in but not yet checked out.
              Drops by one as soon as someone checks out. */}
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-600"
            title={t("dashboard.checkedInNow", "Currently checked in")}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            {wk.checked_in_now ?? 0} {t("dashboard.checkedIn", "checked in")}
          </span>
        </div>
        {breakdown.length > 0 ? (
          <div className="mb-3">
            {/* Common header row — stays fixed */}
            <div className="mb-1.5 flex items-center justify-between rounded-lg bg-gray-100 px-2.5 py-1.5 sm:px-3">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Farm</span>
              <div className="flex items-center gap-3 sm:gap-4 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                <span title="Total users assigned to this farm">Total Users</span>
                <span title="Active employees on this farm">Active</span>
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
                    <span className="flex w-5 items-center justify-end gap-1 font-semibold text-green-600 sm:w-6">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                      {farm.active_count ?? 0}
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
