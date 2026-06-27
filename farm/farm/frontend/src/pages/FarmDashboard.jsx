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
import { api } from "../lib/api";
import { Card, PageHeader, Badge } from "../components/ui";

const PIE_COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#ef4444"];

export default function FarmDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/farms/dashboard/")
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-400">Loading dashboard…</p>;

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
    name: d.farm.name,
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
