import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera, Check, CheckCheck, CheckCircle, Loader2, MapPin, Play,
  Pause, StopCircle, X, Send, RotateCcw, User, Clock, Navigation,
  FileText, AlertCircle
} from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge, Button, ToastContainer, useToast, PhotoThumb } from "../components/ui";
import { resource, api, toFormData } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const repo = resource("tasks");
const execRepo = resource("tasks/executions");

// Status colors for the new workflow
const statusColor = {
  TODO: "gray",
  ASSIGNED: "yellow",
  CONFIRMED: "blue",
  IN_PROGRESS: "blue",
  ON_BREAK: "amber",
  WAITING_APPROVAL: "purple",
  COMPLETED: "green",
  APPROVED: "green",
  REJECTED: "red",
  RETURNED: "orange",
  CANCELLED: "red",
};

const statusLabelMap = {
  TODO: "tasks.statusTodo",
  ASSIGNED: "tasks.statusAssigned",
  CONFIRMED: "tasks.statusConfirmed",
  IN_PROGRESS: "tasks.statusInProgress",
  ON_BREAK: "tasks.statusOnBreak",
  WAITING_APPROVAL: "tasks.statusWaitingApproval",
  COMPLETED: "tasks.statusCompleted",
  APPROVED: "tasks.statusApproved",
  REJECTED: "tasks.statusRejected",
  RETURNED: "tasks.statusReturned",
  CANCELLED: "tasks.statusCancelled",
};

const prioColor = { LOW: "gray", MEDIUM: "blue", HIGH: "yellow", URGENT: "red" };
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

const MY_TASKS_PARAMS = { my_tasks: "true" };
const ALL_TASKS_PARAMS = {};

// Helper to get current GPS location
const getLocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

// Format seconds to HH:MM:SS
const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

// Format time for display
const formatTime = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export default function Tasks() {
  const { t } = useTranslation();
  const { hasRole, user: currentUser } = useAuth();
  const canManage = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const isEmployee = hasRole("EMPLOYEE");
  const [now, setNow] = useState(Date.now());
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [toasts, addToast, removeToast] = useToast();
  const timerRef = useRef(null);

  // Tick every second for live timer
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-refresh task list to get latest execution status
  const [refreshKey, setRefreshKey] = useState(0);

  const assignFields = isEmployee
    ? []
    : [
        { name: "assigned_to", label: t("tasks.assignToUser"), optionsFrom: { path: "auth/users", label: (u) => u.full_name || u.username } },
        { name: "assigned_employee", label: t("tasks.assignToWorker"), optionsFrom: { path: "workforce/employees", label: (e) => e.name } },
      ];

  // ── Workflow Action Modal State ──
  const [actionModal, setActionModal] = useState(null); // { type, task, execution, onSuccess }
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionPos, setActionPos] = useState(null);
  const [actionPhoto, setActionPhoto] = useState(null);
  const [actionPhotoPreview, setActionPhotoPreview] = useState(null);
  const [actionNotes, setActionNotes] = useState("");
  const [actionProgress, setActionProgress] = useState(0);

  // ── Complete Confirmation Modal ──
  const [completeConfirm, setCompleteConfirm] = useState(false);

  // Open action modal with GPS
  const openActionModal = async (type, task, execution, onSuccess) => {
    setActionModal({ type, task, execution, onSuccess });
    setActionError(null);
    setActionNotes("");
    setActionProgress(execution?.progress_percentage || 0);
    setActionPhoto(null);
    setActionPhotoPreview(null);
    setCompleteConfirm(false);

    const loc = await getLocation();
    setActionPos(loc);
  };

  // Handle photo selection
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setActionPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setActionPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  // Submit workflow action
  const submitAction = async () => {
    if (!actionModal) return;
    setActionLoading(true);
    setActionError(null);

    try {
      const { type, task, execution, onSuccess } = actionModal;
      let result;

      const gpsData = {
        gps_lat: actionPos?.lat ? Number(actionPos.lat.toFixed(6)) : null,
        gps_lng: actionPos?.lng ? Number(actionPos.lng.toFixed(6)) : null,
      };

      switch (type) {
        case "CONFIRM":
          result = await execRepo.action(execution.id, "confirm");
          addToast(t("tasks.confirmedSuccess"), "success");
          break;

        case "START":
          result = await execRepo.action(execution.id, "start", gpsData);
          addToast(t("tasks.startedSuccess"), "success");
          break;

        case "BREAK":
          result = await execRepo.action(execution.id, "break_work", gpsData);
          addToast(t("tasks.breakStarted"), "success");
          break;

        case "RESUME":
          result = await execRepo.action(execution.id, "resume", {});
          addToast(t("tasks.resumedSuccess"), "success");
          break;

        case "PROGRESS":
          const progressData = {
            ...gpsData,
            progress_percentage: actionProgress,
            remarks: actionNotes,
          };
          if (actionPhoto) {
            result = await api.post(`/tasks/executions/${execution.id}/progress/`,
              toFormData({ ...progressData, photo: actionPhoto })
            );
          } else {
            result = await execRepo.action(execution.id, "progress", progressData);
          }
          addToast(t("tasks.progressSaved"), "success");
          break;

        case "COMPLETE":
          // Show confirmation first
          if (!completeConfirm) {
            setCompleteConfirm(true);
            setActionLoading(false);
            return;
          }
          const completeData = {
            ...gpsData,
            completion_notes: actionNotes,
          };
          if (actionPhoto) {
            result = await api.post(`/tasks/executions/${execution.id}/complete/`,
              toFormData({ ...completeData, completion_photo: actionPhoto })
            );
          } else {
            result = await execRepo.action(execution.id, "complete", completeData);
          }
          addToast(t("tasks.completedSuccess"), "success");
          break;

        case "APPROVE":
          result = await execRepo.action(execution.id, "approve");
          addToast(t("tasks.approvedSuccess"), "success");
          break;

        case "RETURN":
          result = await execRepo.action(execution.id, "return_task");
          addToast(t("tasks.returnedSuccess"), "success");
          break;

        default:
          throw new Error("Unknown action");
      }

      setActionModal(null);
      if (onSuccess) onSuccess();
      setRefreshKey(k => k + 1);
    } catch (err) {
      setActionError(err.response?.data?.detail || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Timer display component
  const TaskTimer = ({ execution }) => {
    if (!execution) return <span className="text-xs text-gray-300">—</span>;

    const status = execution.status;
    const startedAt = execution.started_at;

    if (!startedAt) return <span className="text-xs text-gray-300">00:00:00</span>;

    // Calculate current duration from backend
    const currentDuration = execution.current_duration_seconds ||
      (execution.working_seconds || 0);

    // Live timer calculation
    let liveSeconds = currentDuration;
    if (status === "IN_PROGRESS" && execution.started_at) {
      const startTime = new Date(execution.started_at).getTime();
      const elapsed = Math.floor((now - startTime) / 1000);
      // Subtract break time if on break
      const breakSeconds = execution.break_seconds || 0;
      liveSeconds = Math.max(0, elapsed - breakSeconds);
    }

    const isOnBreak = status === "ON_BREAK";

    return (
      <div className="flex items-center gap-1.5">
        {isOnBreak ? (
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
          </span>
        ) : status === "IN_PROGRESS" ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
        ) : null}
        <span className={`text-xs font-mono font-medium ${
          isOnBreak ? "text-amber-700" : status === "IN_PROGRESS" ? "text-green-700" : "text-gray-700"
        }`}>
          {formatDuration(liveSeconds)}
          {isOnBreak && " ⏸"}
        </span>
      </div>
    );
  };

  // Get execution status display
  const getExecutionStatus = (execution) => {
    if (!execution) return null;
    return (
      <div className="flex flex-col gap-1">
        <Badge color={statusColor[execution.status]}>
          {t(statusLabelMap[execution.status] || execution.status)}
        </Badge>
        {execution.progress_percentage > 0 && (
          <span className="text-xs text-gray-500">{execution.progress_percentage}%</span>
        )}
      </div>
    );
  };

  // Get action buttons based on execution status
  const getActionButtons = (task, execution, reload) => {
    if (!execution) {
      // No execution yet - show ASSIGNED buttons
      return (
        <>
          <button
            onClick={() => openActionModal("CONFIRM", task, execution, reload)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            title={t("tasks.confirmWork")}
          >
            <Check size={14} />
            {t("tasks.confirmWork")}
          </button>
        </>
      );
    }

    const status = execution.status;
    const isClosed = ["COMPLETED", "APPROVED", "REJECTED", "RETURNED"].includes(status);

    if (isClosed) {
      return (
        <Badge color={statusColor[status]}>
          {t(statusLabelMap[status] || status)}
        </Badge>
      );
    }

    switch (status) {
      case "ASSIGNED":
        return (
          <>
            <button
              onClick={() => openActionModal("CONFIRM", task, execution, reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              title={t("tasks.confirmWork")}
            >
              <Check size={14} />
              {t("tasks.confirmWork")}
            </button>
          </>
        );

      case "CONFIRMED":
        return (
          <>
            <button
              onClick={() => openActionModal("START", task, execution, reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700"
              title={t("tasks.startWork")}
            >
              <Play size={14} />
              {t("tasks.startWork")}
            </button>
          </>
        );

      case "IN_PROGRESS":
        return (
          <>
            <button
              onClick={() => openActionModal("PROGRESS", task, execution, reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              title={t("tasks.duringWork")}
            >
              <Camera size={14} />
              {t("tasks.duringWork")}
            </button>
            <button
              onClick={() => openActionModal("BREAK", task, execution, reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600"
              title={t("tasks.break")}
            >
              <Pause size={14} />
              {t("tasks.break")}
            </button>
            <button
              onClick={() => openActionModal("COMPLETE", task, execution, reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-700 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-800"
              title={t("tasks.completeWork")}
            >
              <CheckCircle size={14} />
              {t("tasks.completeWork")}
            </button>
          </>
        );

      case "ON_BREAK":
        return (
          <>
            <button
              onClick={() => openActionModal("RESUME", task, execution, reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700"
              title={t("tasks.resumeWork")}
            >
              <Play size={14} />
              {t("tasks.resumeWork")}
            </button>
            <button
              onClick={() => openActionModal("COMPLETE", task, execution, reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-700 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-800"
              title={t("tasks.completeWork")}
            >
              <CheckCircle size={14} />
              {t("tasks.completeWork")}
            </button>
          </>
        );

      case "WAITING_APPROVAL":
        if (canManage) {
          return (
            <>
              <button
                onClick={() => openActionModal("APPROVE", task, execution, reload)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700"
                title={t("tasks.approve")}
              >
                <Check size={14} />
                {t("tasks.approve")}
              </button>
              <button
                onClick={() => openActionModal("RETURN", task, execution, reload)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-600"
                title={t("tasks.return")}
              >
                <RotateCcw size={14} />
                {t("tasks.return")}
              </button>
            </>
          );
        }
        return (
          <Badge color="purple">
            {t("tasks.waitingApproval")}
          </Badge>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <CrudResource
        key={refreshKey}
        title={t("tasks.titlePg")}
        subtitle={t("tasks.subtitlePg")}
        path="tasks"
        canWrite
        canEdit={canManage}
        showFarmFilter
        showUserFilter
        listParams={myTasksOnly ? MY_TASKS_PARAMS : ALL_TASKS_PARAMS}
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
        columns={(() => {
          const cols = [
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
            ...(isEmployee ? [] : [{
              key: "assigned_to_name",
              header: t("tasks.assignToUser"),
              render: (r) => r.assigned_to_name || "—",
            }]),
            ...(isEmployee ? [] : [{
              key: "assigned_employee_name",
              header: t("tasks.assignToWorker"),
              render: (r) => r.assigned_employee_name || "—",
            }]),
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
              key: "execution_status",
              header: t("header.status"),
              render: (r) => getExecutionStatus(r.my_execution),
            },
            {
              key: "timer",
              header: t("header.timer"),
              render: (r) => <TaskTimer execution={r.my_execution} />,
            },
          ];
          return cols;
        })()}
        rowActions={(row, reload) => {
          const execution = row.my_execution;
          return getActionButtons(row, execution, reload);
        }}
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

      {/* ── Workflow Action Modal ── */}
      {actionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl relative z-[1001]">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                {actionModal.type === "CONFIRM" && t("tasks.confirmWork")}
                {actionModal.type === "START" && t("tasks.startWork")}
                {actionModal.type === "BREAK" && t("tasks.break")}
                {actionModal.type === "RESUME" && t("tasks.resumeWork")}
                {actionModal.type === "PROGRESS" && t("tasks.duringWork")}
                {actionModal.type === "COMPLETE" && (completeConfirm ? t("tasks.confirmComplete") : t("tasks.completeWork"))}
                {actionModal.type === "APPROVE" && t("tasks.approve")}
                {actionModal.type === "RETURN" && t("tasks.return")}
                {' — '}{actionModal.task.title}
              </h3>
              <button onClick={() => setActionModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {actionError && (
                <div className="p-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 ring-1 ring-red-200">
                  {actionError}
                </div>
              )}

              {/* GPS Location */}
              {["START", "BREAK", "RESUME", "PROGRESS", "COMPLETE"].includes(actionModal.type) && (
                actionPos ? (
                  <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-3">
                    <MapPin size={16} className="text-brand-600 mt-1" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{t("gps.currentLocation")}</p>
                      <p className="text-xs text-gray-600">
                        {actionPos.lat.toFixed(6)}, {actionPos.lng.toFixed(6)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
                    <span className="text-sm text-gray-600">{t("common.couldNotGetLocation")}</span>
                  </div>
                )
              )}

              {/* Progress slider for DURING WORK */}
              {actionModal.type === "PROGRESS" && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {t("tasks.progress")}: {actionProgress}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={actionProgress}
                    onChange={(e) => setActionProgress(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}

              {/* Notes */}
              {["PROGRESS", "COMPLETE"].includes(actionModal.type) && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {t("tasks.notes")} <span className="text-gray-400">({t("common.optional")})</span>
                  </label>
                  <textarea
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    rows={3}
                    placeholder={t("tasks.notesPlaceholder")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              )}

              {/* Photo */}
              {["PROGRESS", "COMPLETE"].includes(actionModal.type) && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {t("common.photo")} <span className="text-gray-400">({t("common.optional")})</span>
                  </label>
                  {actionPhotoPreview ? (
                    <div className="relative">
                      <img src={actionPhotoPreview} alt="Preview" className="w-full h-40 object-cover rounded-lg" />
                      <button
                        onClick={() => { setActionPhoto(null); setActionPhotoPreview(null); }}
                        className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1 hover:bg-opacity-70"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                      <Camera size={24} className="text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">{t("gps.clickPhoto")}</p>
                      <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handlePhotoChange} />
                    </label>
                  )}
                </div>
              )}

              {/* Completion confirmation */}
              {completeConfirm && actionModal.type === "COMPLETE" && (
                <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={20} className="text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800">{t("tasks.confirmComplete")}</p>
                      <p className="text-sm text-amber-700 mt-1">{t("tasks.cannotUndo")}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setActionModal(null)} disabled={actionLoading}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={submitAction}
                disabled={actionLoading}
                variant={actionModal.type === "COMPLETE" ? "primary" : "primary"}
              >
                {actionLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    {t("common.saving")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    {actionModal.type === "CONFIRM" && <><Check size={16} />{t("tasks.confirmWork")}</>}
                    {actionModal.type === "START" && <><Play size={16} />{t("tasks.startWork")}</>}
                    {actionModal.type === "BREAK" && <><Pause size={16} />{t("tasks.break")}</>}
                    {actionModal.type === "RESUME" && <><Play size={16} />{t("tasks.resumeWork")}</>}
                    {actionModal.type === "PROGRESS" && <><Camera size={16} />{t("tasks.saveProgress")}</>}
                    {actionModal.type === "COMPLETE" && (completeConfirm ? <><CheckCircle size={16} />{t("common.yes")}</> : <><CheckCircle size={16} />{t("tasks.completeWork")}</>)}
                    {actionModal.type === "APPROVE" && <><Check size={16} />{t("tasks.approve")}</>}
                    {actionModal.type === "RETURN" && <><RotateCcw size={16} />{t("tasks.return")}</>}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </>
  );
}