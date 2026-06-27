import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const statusColor = { PLANNED: "gray", PLANTED: "blue", GROWING: "green", HARVESTED: "purple", FAILED: "red" };

function calcProgress(plantingDate, harvestDate) {
  if (!plantingDate || !harvestDate) return null;
  const plant = new Date(plantingDate);
  const harvest = new Date(harvestDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const total = harvest - plant;
  const elapsed = today - plant;

  if (total < 0) return null;
  const pct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  const daysLeft = Math.max(0, Math.ceil((harvest - today) / (1000 * 60 * 60 * 24)));
  return { pct, daysLeft, total: Math.round(total / (1000 * 60 * 60 * 24)) };
}

function formatRequiredTime(plantingDate, harvestDate) {
  if (!plantingDate || !harvestDate) return null;
  const plant = new Date(plantingDate);
  const harvest = new Date(harvestDate);
  const totalMs = harvest - plant;

  if (totalMs <= 0) return null;

  const totalMinutes = Math.floor(totalMs / (1000 * 60));
  const totalHours = Math.floor(totalMs / (1000 * 60 * 60));
  const totalDays = Math.floor(totalMs / (1000 * 60 * 60 * 24));

  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  const parts = [];
  if (months > 0) parts.push(`${months}m`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}min`);

  return parts.length > 0 ? parts.join(" ") : "0min";
}

export default function CropAllocation() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("cropAllocation.titlePg")}
      subtitle={t("cropAllocation.subtitlePg")}
      path="agronomy/crops"
      canWrite={canWrite}
      columns={[
        { key: "name", header: t("header.crop") },
        { key: "variety", header: t("header.variety") },
        { key: "farm_name", header: t("header.farm") },
        { key: "block_name", header: t("header.block"), render: (r) => r.block_name || r.field_name || "—" },
        { key: "season", header: t("header.season") },
        { key: "area", header: t("header.areaAc") },
        {
          key: "required",
          header: t("header.required"),
          render: (r) => {
            const required = formatRequiredTime(r.planting_date, r.expected_harvest_date);
            if (!required) return <span className="text-xs text-gray-400">—</span>;
            return <span className="text-xs font-medium text-gray-700">{required}</span>;
          },
        },
        {
          key: "progress",
          header: t("header.timer"),
          render: (r) => {
            const prog = calcProgress(r.planting_date, r.expected_harvest_date);
            if (!prog) return <span className="text-xs text-gray-400">—</span>;
            const barColor =
              prog.pct >= 100 ? "bg-green-500" :
              prog.pct >= 75 ? "bg-yellow-500" :
              prog.pct >= 50 ? "bg-blue-500" :
              "bg-gray-400";
            return (
              <div className="flex items-center gap-2 min-w-[120px]">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.min(prog.pct, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">
                  {prog.pct >= 100
                    ? "Done"
                    : `${prog.daysLeft}d`}
                </span>
              </div>
            );
          },
        },
        { key: "growth_stage", header: t("header.stage") },
        { key: "status", header: t("header.status"), render: (r) => <Badge color={statusColor[r.status]}>{r.status}</Badge> },
      ]}
      fields={[
        { name: "name", label: "Crop Name", required: true },
        { name: "variety", label: "Variety" },
        { name: "farm", label: "Farm", optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "field", label: "Block / Field", optionsFrom: { path: "farms/fields", label: (f) => f.block_name || f.name } },
        { name: "season", label: "Season" },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: ["PLANNED", "PLANTED", "GROWING", "HARVESTED", "FAILED"],
        },
        { name: "growth_stage", label: "Growth Stage" },
        { name: "area", label: "Area (acres)", type: "number" },
        { name: "expected_yield", label: "Expected Yield", type: "number" },
        { name: "planting_date", label: "Planting Date", type: "date" },
        { name: "expected_harvest_date", label: "Expected Harvest", type: "date" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      rowActions={(row) => (
        <Link
          to={`/agronomy/${row.id}`}
          title={t("common.view")}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <Eye size={15} />
        </Link>
      )}
    />
  );
}
