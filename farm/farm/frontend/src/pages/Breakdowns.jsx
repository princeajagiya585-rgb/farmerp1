import { useTranslation } from "react-i18next";
import { Check, Wrench } from "lucide-react";
import { resource, normalizePhotoUrl } from "../lib/api";
import { Badge, PhotoThumb } from "../components/ui";
import CrudResource from "../components/CrudResource";
import { useAuth } from "../context/AuthContext";

const repo = resource("breakdowns/reports");

const severityColor = { LOW: "gray", MEDIUM: "blue", HIGH: "yellow", CRITICAL: "red" };
const statusColor = {
  REPORTED: "yellow",
  ACKNOWLEDGED: "blue",
  IN_PROGRESS: "blue",
  RESOLVED: "green",
};

const sevLabelMap = {
  LOW: "breakdowns.severityLow",
  MEDIUM: "breakdowns.severityMedium",
  HIGH: "breakdowns.severityHigh",
  CRITICAL: "breakdowns.severityCritical",
};
const statusLabelMap = {
  REPORTED: "breakdowns.reported",
  ACKNOWLEDGED: "breakdowns.acknowledged",
  IN_PROGRESS: "breakdowns.inProgress",
  RESOLVED: "breakdowns.resolved",
};

const severityOpts = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export default function Breakdowns() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canAct = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  // EMPLOYEE can create reports; admins can also create
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER", "EMPLOYEE");

  const acknowledge = async (row, load) => {
    await repo.action(row.id, "acknowledge");
    load();
  };

  const resolve = async (row, load) => {
    const notes = window.prompt(t("breakdowns.resolvePrompt"), "");
    if (notes === null) return;
    await repo.action(row.id, "resolve", { resolution_notes: notes });
    load();
  };

  return (
    <CrudResource
      title={t("breakdowns.titlePg")}
      subtitle={t("breakdowns.subtitlePg")}
      path="breakdowns/reports"
      canWrite={canWrite}
      showFarmFilter
      showEmployeeFilter
      showUserFilter
      rowActions={(row, load) =>
        canAct ? (
          <div className="flex gap-1">
            {row.status === "REPORTED" && (
              <button
                onClick={() => acknowledge(row, load)}
                className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                title={t("breakdowns.acknowledgeBtn")}
              >
                <Check size={15} />
              </button>
            )}
            {row.status !== "RESOLVED" && (
              <button
                onClick={() => resolve(row, load)}
                className="rounded p-1.5 text-green-600 hover:bg-green-50"
                title={t("breakdowns.resolveBtn")}
              >
                <Wrench size={15} />
              </button>
            )}
          </div>
        ) : undefined
      }
      columns={[
        { key: "machine_name", header: t("header.machine") },
        { key: "farm_name", header: t("header.farm") },
        {
          key: "severity",
          header: t("header.severity"),
          render: (r) => (
            <Badge color={severityColor[r.severity] || "gray"}>
              {t(sevLabelMap[r.severity] || r.severity)}
            </Badge>
          ),
        },
        {
          key: "status",
          header: t("header.status"),
          render: (r) => (
            <Badge color={statusColor[r.status] || "gray"}>
              {t(statusLabelMap[r.status] || r.status_display || r.status)}
            </Badge>
          ),
        },
        {
          key: "details",
          header: t("header.details"),
          render: (r) => (
            <span className="block max-w-[280px] truncate" title={r.details}>
              {r.details}
            </span>
          ),
        },
        {
          key: "photo",
          header: t("header.photo"),
          render: (r) => <PhotoThumb url={normalizePhotoUrl(r.photo_url)} alt={t("breakdowns.equipment")} size={48} />,
        },
        { key: "reported_by_name", header: t("header.reportedBy") },
        { key: "created_at", header: t("header.when"), render: (r) => fmt(r.created_at) },
      ]}
      fields={[
        { name: "machine_name", label: t("header.machine"), required: true },
        {
          name: "farm",
          label: t("header.farm"),
          optionsFrom: { path: "farms", label: (f) => f.name },
          required: true,
        },
        {
          name: "severity",
          label: t("header.severity"),
          type: "select",
          options: severityOpts,
          required: true,
        },
        { name: "details", label: t("header.description"), type: "textarea", required: true },
        { name: "photo", label: t("header.photo"), type: "file" },
      ]}
      searchable
    />
  );
}

function fmt(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
