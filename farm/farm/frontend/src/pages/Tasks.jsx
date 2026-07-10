import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera, CheckCircle, Loader2, MapPin, Pause, Play,
  X, AlertCircle
} from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge, Button, ToastContainer, useToast } from "../components/ui";
import { resource, toFormData } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const repo = resource("tasks");

// Action config mapping: phase -> API action name + label
const workPhaseConfig = {
  BEFORE: { action: "before-work", labelKey: "gps.beforeWork" },
  BREAK_START: { action: "take-break", labelKey: "tasks.break" },
  BREAK_END: { action: "resume-work", labelKey: "tasks.resumeWork" },
  DURING_WORK: { action: "during-work", labelKey: "gps.duringWork" },
  COMPLETED: { action: "complete-work", labelKey: "gps.completedWork" },
};

// New status after each action (for immediate local state update)
const nextStatusAfterAction = {
  BEFORE: "IN_PROGRESS",
  BREAK_START: "ON_BREAK",
  BREAK_END: "IN_PROGRESS",
  DURING_WORK: null, // stays same
  COMPLETED: "WAITING_APPROVAL",
};

const prioColor = { LOW: "gray", MEDIUM: "blue", HIGH: "yellow", URGENT: "red" };
const statusColor = {
  TODO: "gray", ASSIGNED: "yellow", CONFIRMED: "blue",
  IN_PROGRESS: "blue", ON_BREAK: "amber", WAITING_APPROVAL: "purple",
  COMPLETED: "green", APPROVED: "green", REJECTED: "red", RETURNED: "orange",
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

// Closed statuses — no work actions allowed
const CLOSED_STATUSES = ["COMPLETED", "VERIFIED", "APPROVED", "CANCELLED", "WAITING_APPROVAL"];

const formatDuration = (minutes) => {
  if (!minutes && minutes !== 0) return "\u2014";
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export default function Tasks() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canManage = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const isEmployee = hasRole("EMPLOYEE");
  const [now, setNow] = useState(Date.now());
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [toasts, addToast, removeToast] = useToast();

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      setTimerRefresh(r => r + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const assignFields = isEmployee
    ? []
    : [
        { name: "assigned_to", label: t("tasks.assignToUser"), optionsFrom: { path: "auth/users", label: (u) => u.full_name || u.username } },
        { name: "assigned_employee", label: t("tasks.assignToWorker"), optionsFrom: { path: "workforce/employees", label: (e) => e.name } },
      ];

  // Work modal state
  const [workModal, setWorkModal] = useState(null);
  const [workPhoto, setWorkPhoto] = useState(null);
  const [workPhotoPreview, setWorkPhotoPreview] = useState(null);
  const [workPos, setWorkPos] = useState(null);
  const [workPosLoading, setWorkPosLoading] = useState(false);
  const [workSaving, setWorkSaving] = useState(false);
  const [workError, setWorkError] = useState(null);
  const [workNotes, setWorkNotes] = useState("");
  const [workAddress, setWorkAddress] = useState("");
  const [workReason, setWorkReason] = useState("");

  // Timer refresh state
  const [timerRefresh, setTimerRefresh] = useState(0);

  // Complete confirmation
  const [completeConfirm, setCompleteConfirm] = useState(false);

  // ── Quick actions (one-click, NO modal) ─────────────────────────
  const handleQuickBreak = async (row, reload, updateRow) => {
    setWorkSaving(true);
    try {
      await repo.action(row.id, "take-break", {});
      updateRow(row.id, { status: "ON_BREAK" });
      if (reload) reload({ forceRefresh: true });
      addToast(t("tasks.breakStarted"), "success");
    } catch (err) {
      addToast(err.response?.data?.detail || t("common.error"), "error");
    } finally {
      setWorkSaving(false);
    }
  };

  const handleQuickResume = async (row, reload, updateRow) => {
    setWorkSaving(true);
    try {
      await repo.action(row.id, "resume-work", {});
      updateRow(row.id, { status: "IN_PROGRESS" });
      if (reload) reload({ forceRefresh: true });
      addToast(t("tasks.resumedSuccess"), "success");
    } catch (err) {
      addToast(err.response?.data?.detail || t("common.error"), "error");
    } finally {
      setWorkSaving(false);
    }
  };

  const fetchWorkLocation = () => {
    if (!navigator.geolocation) {
      setWorkError(t("gps.noLocation"));
      return;
    }
    setWorkError(null);
    setWorkPosLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const locationData = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${locationData.lat}&lon=${locationData.lng}&zoom=18&addressdetails=1`
          );
          const data = await response.json();
          if (data.display_name) {
            locationData.address = data.display_name;
            setWorkAddress(data.display_name);
          }
        } catch (e) {
          console.log("Address lookup failed:", e);
        }
        setWorkPos(locationData);
        setWorkPosLoading(false);
      },
      () => {
        setWorkPosLoading(false);
        setWorkError(t("gps.noLocation"));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  // openWorkModal now also stores updateRow for immediate state updates
  const openWorkModal = (row, phase, reload, updateRow) => {
    setWorkModal({ row, phase, reload, updateRow });
    setWorkPhoto(null);
    setWorkPhotoPreview(null);
    setWorkError(null);
    setWorkNotes("");
    setWorkAddress("");
    setWorkReason("");
    setWorkPos(null);
    setCompleteConfirm(false);
    fetchWorkLocation();
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
    if (!workModal) return;

    const phase = workModal.phase;
    const { row, reload, updateRow } = workModal;

    // For COMPLETED phase, require confirmation
    if (phase === "COMPLETED" && !completeConfirm) {
      setCompleteConfirm(true);
      return;
    }

    // GPS is required for BEFORE and COMPLETED (not for DURING_WORK)
    if (!workPos && phase !== "DURING_WORK") {
      setWorkError(t("gps.noLocation"));
      return;
    }

    // Photo is required for BEFORE and COMPLETED (not for DURING_WORK)
    if (!workPhoto && phase !== "DURING_WORK") {
      setWorkError(t("tasks.photoRequired"));
      return;
    }

    // Completion notes required
    if (phase === "COMPLETED" && !workNotes.trim()) {
      setWorkError(t("tasks.completionNotesRequired"));
      return;
    }

    setWorkSaving(true);
    setWorkError(null);

    try {
      const action = workPhaseConfig[phase]?.action;
      const data = {
        latitude: workPos ? Number(workPos.lat.toFixed(6)) : null,
        longitude: workPos ? Number(workPos.lng.toFixed(6)) : null,
        accuracy: workPos?.accuracy != null ? Math.round(workPos.accuracy) : null,
        address: workAddress || workPos?.address || "",
        notes: workNotes.trim() || "",
        reason: workReason.trim() || "",
        completion_notes: workNotes.trim() || "",
      };

      // POST to the API endpoint
      await repo.action(row.id, action, workPhoto ? toFormData({ ...data, photo: workPhoto }) : data);

      // IMMEDIATELY update local state so buttons change without waiting for reload
      const newStatus = nextStatusAfterAction[phase];
      if (newStatus && updateRow) {
        updateRow(row.id, { status: newStatus });
      }

      // Also trigger a background reload to sync with backend
      setWorkModal(null);
      if (reload) reload({ forceRefresh: true });

      const successKey = {
        BEFORE: "tasks.beforeWorkSaved",
        BREAK_START: "tasks.breakStarted",
        BREAK_END: "tasks.resumedSuccess",
        DURING_WORK: "tasks.duringWorkSaved",
        COMPLETED: "tasks.workCompleted",
      }[phase];

      addToast(t(successKey), "success");

    } catch (err) {
      setWorkError(err.response?.data?.detail || err.message);
    } finally {
      setWorkSaving(false);
    }
  };

  // ── TaskTimer component ──────────────────────────────────────────
  // Shows the timer based on task.status and my_execution.timer_data
  const TaskTimer = ({ row }) => {
    const status = row.status;
    const execution = row.my_execution;
    const timerData = execution?.timer_data;
    const session = row.active_session;
    const tracked = row.total_tracked_minutes;

    // Completed/closed tasks: show final time
    if (CLOSED_STATUSES.includes(status)) {
      const netSeconds = timerData?.net_work_seconds || 0;
      const h = Math.floor(netSeconds / 3600);
      const m = Math.floor((netSeconds % 3600) / 60);
      const s = netSeconds % 60;
      return (
        <div className="flex items-center gap-1.5">
          <CheckCircle size={12} className="text-green-500" />
          <span className="text-xs font-medium text-green-700">
            {`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`}
          </span>
        </div>
      );
    }

    // ON_BREAK: show working time with pause indicator
    if (status === "ON_BREAK") {
      const workingSeconds = timerData?.working_seconds || 0;
      return (
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
          </span>
          <span className="text-xs font-medium text-amber-700" title={t("tasks.onBreak")}>
            {`${String(Math.floor(workingSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((workingSeconds % 3600) / 60)).padStart(2, "0")}:${String(workingSeconds % 60).padStart(2, "0")} \u23F8`}
          </span>
        </div>
      );
    }

    // IN_PROGRESS with timer data: show live timer
    if (status === "IN_PROGRESS" && timerData) {
      const workingSeconds = timerData.working_seconds || 0;
      const isRunning = timerData.is_running;
      return (
        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
          )}
          <span className={`text-xs font-medium ${isRunning ? "text-green-700" : "text-gray-600"}`}>
            {`${String(Math.floor(workingSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((workingSeconds % 3600) / 60)).padStart(2, "0")}:${String(workingSeconds % 60).padStart(2, "0")}`}
          </span>
        </div>
      );
    }

    // IN_PROGRESS without timer_data fallback: use active_session
    if (status === "IN_PROGRESS") {
      let totalMin = tracked || 0;
      if (session) {
        const elapsed = (Date.now() - new Date(session.start_time).getTime()) / 60000;
        totalMin += elapsed;
      }
      const totalSeconds = Math.round(totalMin * 60);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return (
        <div className="flex items-center gap-1.5">
          {session ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
          )}
          <span className={`text-xs font-medium ${session ? "text-green-700" : "text-gray-600"}`}>
            {`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`}
          </span>
        </div>
      );
    }

    // BEFORE / TODO / other: show tracked time if any
    return tracked ? (
      <span className="text-xs text-gray-500" title={t("tasks.totalTracked")}>
        {formatDuration(tracked)}
      </span>
    ) : (
      <span className="text-xs text-gray-300">{'\u2014'}</span>
    );
  };

  // ── Action buttons based on task.status ──────────────────────────
  // This is the ONLY place button rendering logic lives.
  // It reads row.status directly from the backend.
  const getActionButtons = (row, reload, updateRow) => {
    const status = row.status;
    console.log("Task row:", row.id, "status:", status);

    // ── Closed / terminal statuses: show completed badge ───────────
    if (CLOSED_STATUSES.includes(status)) {
      return (
        <Badge color="green">
          <span className="inline-flex items-center gap-1">
            <CheckCircle size={12} /> {t("tasks.statusCompleted")}
          </span>
        </Badge>
      );
    }

    // ── IN_PROGRESS: show During Work (modal) + Break (one-click) + Complete Work (modal) ──
    if (status === "IN_PROGRESS") {
      return (
        <div className="flex items-center gap-1 flex-nowrap">
          <button
            onClick={() => openWorkModal(row, "DURING_WORK", reload, updateRow)}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-indigo-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
            title={t("gps.duringWork")}
          >
            <Camera size={13} />
            {t("gps.duringWork")}
          </button>
          <button
            onClick={() => handleQuickBreak(row, reload, updateRow)}
            disabled={workSaving}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-amber-500 px-2 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
            title={t("tasks.break")}
          >
            <Pause size={13} />
            {t("tasks.break")}
          </button>
          <button
            onClick={() => openWorkModal(row, "COMPLETED", reload, updateRow)}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-green-700 px-2 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-800"
            title={t("gps.completedWork")}
          >
            <CheckCircle size={13} />
            {t("gps.completedWork")}
          </button>
        </div>
      );
    }

    // ── ON_BREAK: show only Start (Resume) button — one-click, no modal ──
    if (status === "ON_BREAK") {
      return (
        <div className="flex items-center gap-1 flex-nowrap">
          <button
            onClick={() => handleQuickResume(row, reload, updateRow)}
            disabled={workSaving}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-green-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
            title={t("tasks.resumeWork")}
          >
            <Play size={13} />
            {t("tasks.resumeWork")}
          </button>
        </div>
      );
    }

    // ── TODO / ASSIGNED / CONFIRMED: show Before Work button ──
    return (
      <div className="flex items-center gap-1 flex-nowrap">
        <button
          onClick={() => openWorkModal(row, "BEFORE", reload, updateRow)}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-brand-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
          title={t("gps.beforeWork")}
        >
          <Camera size={13} />
          {t("gps.beforeWork")}
        </button>
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
        listParams={myTasksOnly ? MY_TASKS_PARAMS : ALL_TASKS_PARAMS}
        extraToolbar={
          canManage && (
            <Button
              variant={myTasksOnly ? "primary" : "secondary"}
              onClick={() => setMyTasksOnly((p) => !p)}
              className="whitespace-nowrap"
            >
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
              render: (r) => r.assigned_to_name || "\u2014",
            }]),
            ...(isEmployee ? [] : [{
              key: "assigned_employee_name",
              header: t("tasks.assignToWorker"),
              render: (r) => r.assigned_employee_name || "\u2014",
            }]),
            {
              key: "due_date",
              header: t("header.dueDate"),
              render: (r) =>
                r.due_date ? (
                  <span className={r.is_overdue ? "font-semibold text-red-600" : ""}>
                    {r.due_date}{r.is_overdue ? " \u26A0" : ""}
                  </span>
                ) : "\u2014",
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
          ];
          return cols;
        })()}
        rowActions={(row, reload, updateRow) => getActionButtons(row, reload, updateRow)}
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

      {/* Work modal */}
      {workModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl relative z-[1001]">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                {t(workPhaseConfig[workModal.phase]?.labelKey)} {'\u2014'} {workModal.row.title}
              </h3>
              <button onClick={() => setWorkModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {workError && (
                <div className="p-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 ring-1 ring-red-200">
                  {workError}
                </div>
              )}

              {/* Location with Address */}
              {workPosLoading ? (
                <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                  <Loader2 size={16} className="animate-spin text-brand-600 mt-1" />
                  <p className="text-sm font-semibold text-gray-800">{t("common.gettingLocation")}</p>
                </div>
              ) : workPos ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-3">
                    <MapPin size={16} className="text-brand-600 mt-1" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{t("gps.currentLocation")}</p>
                      <p className="text-xs text-gray-600">
                        {workPos.lat.toFixed(6)}, {workPos.lng.toFixed(6)}
                      </p>
                    </div>
                  </div>
                  {workPos.address && (
                    <p className="text-xs text-gray-500 px-1" title={workPos.address}>
                      📍 {workPos.address.substring(0, 80)}...
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
                  <span className="text-sm text-gray-600">{t("common.couldNotGetLocation")}</span>
                  <Button variant="secondary" onClick={fetchWorkLocation}>
                    <MapPin size={14} /> {t("common.retry")}
                  </Button>
                </div>
              )}

              {/* Reason - required for BREAK_START */}
              {workModal.phase === "BREAK_START" && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {t("tasks.breakReason")} <span className="text-red-500"> *</span>
                  </label>
                  <textarea
                    value={workReason}
                    onChange={(e) => setWorkReason(e.target.value)}
                    rows={2}
                    placeholder={t("tasks.breakReasonPlaceholder")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              )}

              {/* Notes - for DURING_WORK, COMPLETED, and BEFORE */}
              {["DURING_WORK", "COMPLETED", "BEFORE"].includes(workModal.phase) && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {t("tasks.notes")} <span className="text-gray-400">({t("common.optional")})</span>
                  </label>
                  <textarea
                    value={workNotes}
                    onChange={(e) => setWorkNotes(e.target.value)}
                    rows={2}
                    placeholder={workModal.phase === "COMPLETED" ? t("tasks.completionNotesPlaceholder") : t("tasks.notesPlaceholder")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              )}

              {/* Photo - required for BEFORE and COMPLETED, optional for DURING_WORK */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t("common.workPhoto")}
                  {workModal.phase !== "DURING_WORK" ? (
                    <span className="text-red-500"> *</span>
                  ) : (
                    <span className="text-gray-400"> ({t("common.optional")})</span>
                  )}
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
                    <Camera size={24} className="text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">{t("gps.clickPhoto")}</p>
                    <input type="file" className="hidden" accept="image/*" onChange={handleWorkPhotoChange} />
                  </label>
                )}
              </div>

              {/* Completion confirmation */}
              {completeConfirm && workModal.phase === "COMPLETED" && (
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
              <Button variant="secondary" onClick={() => setWorkModal(null)} disabled={workSaving}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={submitWork}
                disabled={
                  workSaving ||
                  ((workModal.phase === "BEFORE" || workModal.phase === "COMPLETED") && (!workPos || !workPhoto)) ||
                  (workModal.phase === "COMPLETED" && (!completeConfirm || !workNotes.trim()))
                }
              >
                {workSaving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    {t("common.saving")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    {workModal.phase === "BEFORE" && <><Camera size={16} />{t("gps.beforeWork")}</>}
                    {workModal.phase === "DURING_WORK" && <><Camera size={16} />{t("gps.duringWork")}</>}
                    {workModal.phase === "BREAK_START" && <><Pause size={16} />{t("tasks.break")}</>}
                    {workModal.phase === "BREAK_END" && <><Play size={16} />{t("tasks.resumeWork")}</>}
                    {workModal.phase === "COMPLETED" && (completeConfirm ? <><CheckCircle size={16} />{t("common.yes")}</> : <><CheckCircle size={16} />{t("gps.completedWork")}</>)}
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
