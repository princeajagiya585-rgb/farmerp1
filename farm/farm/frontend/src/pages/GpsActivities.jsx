import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge, PhotoThumb } from "../components/ui";
import { resource, normalizePhotoUrl } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const repo = resource("gps/activities");

const statusColor = { SUBMITTED: "yellow", VERIFIED: "green", REJECTED: "red" };

function verifiedBadge(v, t) {
  if (v === true) return <Badge color="green">{t("gpsActivities.geofencedIn")}</Badge>;
  if (v === false) return <Badge color="red">{t("gpsActivities.geofencedOut")}</Badge>;
  return <span className="text-gray-400">{t("gpsActivities.geofencedNone")}</span>;
}

export default function GpsActivities() {
  const { t } = useTranslation();
  const { hasRole, user } = useAuth();
  const canVerify = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const isEmployee = user?.role === "EMPLOYEE";

  // Employees can submit their own activities; managers can also verify
  const canWrite = isEmployee || canVerify;

  return (
    <CrudResource
      title={t("gpsActivities.title")}
      subtitle={t("gpsActivities.subtitle")}
      path="gps/activities"
      canWrite={canWrite}
      showFarmFilter
      showEmployeeFilter
      // Auto-refresh removed to avoid Railway 429 rate limits.
      // Users can manually reload or use WebSocket updates.
      rowActions={(row, reload) =>
        canVerify && row.status === "SUBMITTED" ? (
          <div className="flex gap-1">
            <button onClick={async () => { await repo.action(row.id, "verify"); reload(); }} className="rounded p-1.5 text-green-600 hover:bg-green-50" title={t("common.verify")}>
              <Check size={15} />
            </button>
            <button onClick={async () => { await repo.action(row.id, "reject"); reload(); }} className="rounded p-1.5 text-red-600 hover:bg-red-50" title={t("common.reject")}>
              <X size={15} />
            </button>
          </div>
        ) : null
      }
      columns={[
        { key: "user_name", header: t("header.worker"), render: (r) => r.user_name || r.user },
        { key: "farm_name", header: t("header.farm"), render: (r) => r.farm_name || "—" },
        { key: "description", header: t("header.activities"), render: (r) => r.description || "—" },
        { key: "task_title", header: t("header.task"), render: (r) => r.task_title || "—" },
        { key: "field_name", header: t("header.field"), render: (r) => r.field_name || "—" },
        {
          key: "coordinates",
          header: t("header.coordinates"),
          render: (r) =>
            r.latitude && r.longitude ? (
              <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-brand-600 hover:underline">
                {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
              </a>
            ) : (
              <span className="text-gray-400">—</span>
            ),
        },
        { key: "location_verified", header: t("header.geofence"), render: (r) => verifiedBadge(r.location_verified, t) },
        { key: "recorded_at", header: t("header.when"), render: (r) => (r.recorded_at ? new Date(r.recorded_at).toLocaleString() : "—") },
        { key: "status", header: t("header.status"), render: (r) => <Badge color={statusColor[r.status] || "gray"}>{r.status}</Badge> },
        { key: "photo", header: t("header.photo"), render: (r) => <PhotoThumb url={normalizePhotoUrl(r.photo_url)} alt={t("header.activities")} size={48} /> },
      ]}
      fields={[
        { name: "farm", label: t("gpsActivities.fieldFarm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "field", label: t("gpsActivities.fieldField"), optionsFrom: { path: "farms/fields", label: (f) => f.name } },
        { name: "task", label: t("gpsActivities.fieldTask"), optionsFrom: { path: "tasks", label: (task) => task.title } },
        { name: "description", label: t("gpsActivities.fieldDescription"), type: "textarea" },
        { name: "latitude", label: t("gps.latitude"), type: "text" },
        { name: "longitude", label: t("gps.longitude"), type: "text" },
        { name: "photo", label: t("header.photo"), type: "file" },
      ]}
    />
  );
}
