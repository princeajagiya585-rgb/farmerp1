import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Check, CheckCheck, CheckCircle, Loader2, MapPin, Send, User, X } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge, Button } from "../components/ui";
import { resource, toFormData } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const repo = resource("tasks");
const pingsRepo = resource("gps/pings");

// Work-proof flow: each phase posts a geo-tagged (optionally photographed)
// LocationPing tied to the task. CHECKIN/CHECKOUT activities are labelled
// "Before Work"/"Completed Work" throughout the UI.
const workPhaseConfig = {
  BEFORE: { activity: "CHECKIN", labelKey: "gps.beforeWork" },
  DURING: { activity: "DURING_WORK", labelKey: "gps.duringWork" },
  COMPLETED: { activity: "CHECKOUT", labelKey: "gps.completedWork" },
};
const prioColor = { LOW: "gray", MEDIUM: "blue", HIGH: "yellow", URGENT: "red" };
const statusColor = {
  TODO: "gray", IN_PROGRESS: "blue", SUBMITTED: "purple", VERIFIED: "green", COMPLETED: "green", CANCELLED: "red",
};
const statusLabelMap = {
  TODO: "tasks.statusTodo",
  IN_PROGRESS: "tasks.statusInProgress",
  SUBMITTED: "tasks.statusSubmitted",
  VERIFIED: "tasks.statusVerified",
  COMPLETED: "tasks.statusCompleted",
  CANCELLED: "tasks.statusCancelled",
};
const prioLabelMap = {
  LOW: "tasks.priorityLow",
  MEDIUM: "tasks.priorityMedium",
  HIGH: "tasks.priorityHigh",
  URGENT: "tasks.priorityUrgent",
};
const scheduleLabelMap = {
  DAILY: "tasks.scheduleDaily",
  WEEKLY: "tasks.scheduleWeekly",
  MONTHLY: "tasks.scheduleMonthly",
  ANNUAL: "tasks.scheduleAnnual",
  ADHOC: "tasks.scheduleAdhoc",
};
const recurrenceLabelMap = {
  NONE: "tasks.recurrenceNone",
  DAILY: "tasks.recurrenceDaily",
  WEEKLY: "tasks.recurrenceWeekly",
  MONTHLY: "tasks.recurrenceMonthly",
  ANNUAL: "tasks.recurrenceAnnual",
};

export default function Tasks() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canManage = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const isEmployee = hasRole("EMPLOYEE");
  const [now, setNow] = useState(Date.now());
  const [myTasksOnly, setMyTasksOnly] = useState(false);

  // Employees can only create tasks for themselves — hide the "assign to others"
  // fields. Managers/admins can assign to any user or worker.
  const assignFields = isEmployee
    ? []
    : [
        { name: "assigned_to", label: t("tasks.assignToUser"), optionsFrom: { path: "auth/users", label: (u) => u.full_name || u.username } },
        { name: "assigned_employee", label: t("tasks.assignToWorker"), optionsFrom: { path: "workforce/employees", label: (e) => e.name } },
      ];

  // Tick every 30s to refresh elapsed times
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const act = async (id, verb, reload) => {
    await repo.action(id, verb);
    reload();
  };

  // ── Work-proof modal (Before / During / Completed Work) ──────────────
  const [workModal, setWorkModal] = useState(null); // { row, phase, reload }
  const [workPhoto, setWorkPhoto] = useState(null);
  const [workPhotoPreview, setWorkPhotoPreview] = useState(null);
  const [workPos, setWorkPos] = useState(null);
  const [workPosLoading, setWorkPosLoading] = useState(false);
  const [workSaving, setWorkSaving] = useState(false);
  const [workError, setWorkError] = useState(null);

  const openWorkModal = (row, phase, reload) => {
    setWorkModal({ row, phase, reload });
    setWorkPhoto(null);
    setWorkPhotoPreview(null);
    setWorkError(null);
    setWorkPos(null);
    if (!navigator.geolocation) {
      setWorkError(t("gps.noLocation"));
      return;
    }
    setWorkPosLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setWorkPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setWorkPosLoading(false);
      },
      () => {
        setWorkPosLoading(false);
        setWorkError(t("gps.noLocation"));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const handleWorkPhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setWorkPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setWorkPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const submitWork = async () => {
    if (!workModal || !workPos) return;
    setWorkSaving(true);
    setWorkError(null);
    try {
      const data = {
        latitude: Number(workPos.lat.toFixed(6)),
        longitude: Number(workPos.lng.toFixed(6)),
        accuracy: workPos.accuracy != null ? Math.round(workPos.accuracy) : null,
        activity: workPhaseConfig[workModal.phase].activity,
        task: workModal.row.id,
      };
      await pingsRepo.create(workPhoto ? toFormData({ ...data, photo: workPhoto }) : data);
      const reload = workModal.reload;
      setWorkModal(null);
      reload();
    } catch (err) {
      setWorkError(err.response?.data?.detail || err.message);
    } finally {
      setWorkSaving(false);
    }
  };

  const formatDuration = (minutes) => {
    if (!minutes && minutes !== 0) return "—";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const TaskTimer = ({ row }) => {
    const session = row.active_session;
    if (!session) {
      const tracked = row.total_tracked_minutes;
      return tracked ? (
        <span className="text-xs text-gray-500" title={t("tasks.totalTracked")}>
          {formatDuration(tracked)}
        </span>
      ) : (
        <span className="text-xs text-gray-300">—</span>
      );
    }
    const start = new Date(session.start_time);
    const elapsed = Math.floor((Date.now() - start.getTime()) / 60000);
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <span className="text-xs font-medium text-green-700" title={t("tasks.startedAt", { time: formatTime(session.start_time) })}>
          {formatDuration(elapsed)}
        </span>
      </div>
    );
  };

  return (
    <>
    <CrudResource
      title={t("tasks.titlePg")}
      subtitle={t("tasks.subtitlePg")}
      path="tasks"
      canWrite
      canEdit={canManage}
      showFarmFilter
      showUserFilter
      listParams={myTasksOnly ? { my_tasks: "true" } : {}}
      extraToolbar={
        canManage && (
          <Button
            variant={myTasksOnly ? "primary" : "secondary"}
            onClick={() => setMyTasksOnly((p) => !p)}
            className="whitespace-nowrap"
          >
            <User size={15} />
            {myTasksOnly ? t("tasks.myTasks") : t("tasks.allTasksBtn")}
          </Button>
        )
      }
      columns={[
        { key: "title", header: t("header.work") },
        { key: "start_date", header: t("tasks.fieldStartDate") },
        { key: "farm_name", header: t("header.farm") },
        {
          key: "priority",
          header: t("header.priority"),
          render: (r) => <Badge color={prioColor[r.priority]}>{t(prioLabelMap[r.priority] || r.priority)}</Badge>,
        },
        {
          key: "schedule_type",
          header: t("header.schedule"),
          render: (r) => t(scheduleLabelMap[r.schedule_type] || r.schedule_type),
        },
        { key: "assigned_to_name", header: t("header.user"), render: (r) => {
            if (r.active_session?.user_name) return r.active_session.user_name;
            if (r.active_session?.username) return r.active_session.username;
            return r.assigned_to_name || r.assigned_employee_name || "—";
          } },
        {
          key: "due_date",
          header: t("header.dueDate"),
          render: (r) =>
            r.due_date ? (
              <span className={r.is_overdue ? "font-semibold text-red-600" : ""}>
                {r.due_date}{r.is_overdue ? " ⚠" : ""}
              </span>
            ) : "—",
        },
        {
          key: "progress",
          header: t("header.progress"),
          render: (r) => (
            <div className="flex items-center gap-2">
              <div className="h-2 w-20 rounded-full bg-gray-200">
                <div className="h-2 rounded-full bg-brand-500" style={{ width: `${r.progress || 0}%` }} />
              </div>
              <span className="text-xs text-gray-500">{r.progress || 0}%</span>
            </div>
          ),
        },
        {
          key: "status",
          header: t("header.status"),
          render: (r) => <Badge color={statusColor[r.status]}>{t(statusLabelMap[r.status] || r.status)}</Badge>,
        },
        {
          key: "timer",
          header: t("header.timer"),
          render: (r) => <TaskTimer row={r} />,
        },
      ]}
      rowActions={(row, reload) => (
        <>
          {/* Work-proof flow (all users): Before Work → During Work + Completed Work.
              Each step records location + photo and shows on the Location Map.
              A row without work_phase (e.g. cached API data) defaults to BEFORE. */}
          {!["COMPLETED", "VERIFIED", "CANCELLED"].includes(row.status) && (row.work_phase || "BEFORE") === "BEFORE" && (
            <button
              onClick={() => openWorkModal(row, "BEFORE", reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
              title={t("gps.beforeWork")}
            >
              <Camera size={14} />
              {t("gps.beforeWork")}
            </button>
          )}
          {!["COMPLETED", "VERIFIED", "CANCELLED"].includes(row.status) && row.work_phase === "DURING" && (
            <>
              <button
                onClick={() => openWorkModal(row, "DURING", reload)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                title={t("gps.duringWork")}
              >
                <Camera size={14} />
                {t("gps.duringWork")}
              </button>
              <button
                onClick={() => openWorkModal(row, "COMPLETED", reload)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-700 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-800"
                title={t("gps.completedWork")}
              >
                <CheckCircle size={14} />
                {t("gps.completedWork")}
              </button>
            </>
          )}
          {/* Admin workflow: submit / verify / complete */}
          {canManage && ["TODO", "IN_PROGRESS"].includes(row.status) && (
            <button onClick={() => act(row.id, "submit", reload)} className="rounded p-1.5 text-purple-600 hover:bg-purple-50" title={t("tasks.submit")}>
              <Send size={15} />
            </button>
          )}
          {canManage && row.status === "SUBMITTED" && (
            <button onClick={() => act(row.id, "verify", reload)} className="rounded p-1.5 text-green-600 hover:bg-green-50" title={t("tasks.verify")}>
              <Check size={15} />
            </button>
          )}
          {canManage && row.status === "VERIFIED" && (
            <button onClick={() => act(row.id, "complete", reload)} className="rounded p-1.5 text-green-700 hover:bg-green-50" title={t("tasks.complete")}>
              <CheckCheck size={15} />
            </button>
          )}
        </>
      )}
      fieldDependencies={[
        { watch: "assigned_employee", target: "farm", mapField: "farm" }
      ]}
      fields={[
        { name: "title", label: t("tasks.fieldWork"), required: true },
        { name: "description", label: t("tasks.fieldDescription"), type: "textarea" },
        { name: "farm", label: t("tasks.fieldFarm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        {
          name: "priority",
          label: t("tasks.fieldPriority"),
          type: "select",
          options: ["LOW", "MEDIUM", "HIGH", "URGENT"],
        },
        {
          name: "schedule_type",
          label: t("tasks.scheduleType"),
          type: "select",
          options: ["DAILY", "WEEKLY", "MONTHLY", "ANNUAL", "ADHOC"],
        },
        {
          name: "recurrence",
          label: t("tasks.fieldRecurrence"),
          type: "select",
          options: ["NONE", "DAILY", "WEEKLY", "MONTHLY", "ANNUAL"],
        },
        ...assignFields,
        { name: "field", label: t("tasks.fieldField"), optionsFrom: { path: "farms/fields", label: (f) => f.name } },
        { name: "category", label: t("tasks.fieldCategory") },
        { name: "start_date", label: t("tasks.fieldStartDate"), type: "date" },
        { name: "due_date", label: t("tasks.fieldDueDate"), type: "date" },
      ]}
    />

    {/* Work-proof modal: location + photo for the selected task & phase */}
    {workModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
        <div className="bg-white rounded-xl w-full max-w-md shadow-xl relative z-[1001]">
          <div className="p-6 border-b flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">
              {t(workPhaseConfig[workModal.phase].labelKey)} — {workModal.row.title}
            </h3>
            <button
              onClick={() => setWorkModal(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>
          <div className="p-6 space-y-4">
            {workError && (
              <div className="p-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 ring-1 ring-red-200">
                {workError}
              </div>
            )}

            {/* Current location */}
            {workPosLoading ? (
              <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                <Loader2 size={16} className="animate-spin text-brand-600 mt-1" />
                <p className="text-sm font-semibold text-gray-800">{t("common.gettingLocation")}</p>
              </div>
            ) : workPos ? (
              <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-3">
                <MapPin size={16} className="text-brand-600 mt-1" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">{t("gps.currentLocation")}</p>
                  <p className="text-xs text-gray-600">
                    {workPos.lat.toFixed(6)}, {workPos.lng.toFixed(6)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 bg-red-50 p-3 rounded-lg ring-1 ring-red-200">
                {t("common.couldNotGetLocation")}
              </div>
            )}

            {/* Photo capture (required — work proof needs a photo) */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                {t("common.workPhoto")} <span className="text-red-500">*</span>
              </label>
              {workPhotoPreview ? (
                <div className="relative">
                  <img src={workPhotoPreview} alt="Preview" className="w-full h-40 object-cover rounded-lg" />
                  <button
                    onClick={() => { setWorkPhoto(null); setWorkPhotoPreview(null); }}
                    className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1 hover:bg-opacity-70"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Camera size={24} className="text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">{t("gps.clickPhoto")}</p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    onChange={handleWorkPhotoChange}
                  />
                </label>
              )}
            </div>
          </div>
          <div className="p-6 border-t flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setWorkModal(null)} disabled={workSaving}>
              {t("gps.cancel")}
            </Button>
            <Button onClick={submitWork} disabled={workSaving || !workPos || !workPhoto}>
              {workSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  {t("common.saving")}
                </span>
              ) : (
                t(workPhaseConfig[workModal.phase].labelKey)
              )}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
