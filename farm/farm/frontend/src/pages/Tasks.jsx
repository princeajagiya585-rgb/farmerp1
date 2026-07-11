import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera, CheckCircle, Loader2, MapPin, Pause, Play,
  X, AlertCircle
} from "lucide-react";
import CrudResource from "../components/CrudResource";
import CameraCapture from "../components/CameraCapture";
import { Badge, Button, ToastContainer, useToast } from "../components/ui";
import { resource, toFormData } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const repo = resource("tasks");

// Robust action caller: DRF exposes @action methods with UNDERSCORES by default
// (e.g. /tasks/1/before_work/). If a hyphenated URL 404s, retry the underscore
// form automatically (and vice versa), so it works with either backend style.
const taskAction = async (id, action, data) => {
  try {
    return await repo.action(id, action, data);
  } catch (err) {
    if (err?.response?.status === 404 && /[-_]/.test(action)) {
      const alt = action.includes("-")
        ? action.replace(/-/g, "_")
        : action.replace(/_/g, "-");
      return repo.action(id, alt, data);
    }
    throw err;
  }
};

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
  COMPLETED: "COMPLETED",
};

// New work_phase after each action — the action buttons are driven by
// work_phase, so update it immediately for instant button switching
// (the forced reload then confirms it from the server).
const nextPhaseAfterAction = {
  BEFORE: "IN_PROGRESS",
  BREAK_START: "ON_BREAK",
  BREAK_END: "IN_PROGRESS",
  DURING_WORK: null, // stays IN_PROGRESS
  COMPLETED: "COMPLETED",
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
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [toasts, addToast, removeToast] = useToast();

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
  const [workCameraOpen, setWorkCameraOpen] = useState(false);
  const [workPos, setWorkPos] = useState(null);
  const [workPosLoading, setWorkPosLoading] = useState(false);
  const [workSaving, setWorkSaving] = useState(false);
  const [workError, setWorkError] = useState(null);
  const [workNotes, setWorkNotes] = useState("");
  const [workAddress, setWorkAddress] = useState("");
  const [workReason, setWorkReason] = useState("");

  // ── Quick actions (one-click, NO modal) ─────────────────────────
  const handleQuickBreak = async (row, reload, updateRow) => {
    setWorkSaving(true);
    try {
      await taskAction(row.id, "take-break", { reason: "Break" });
      updateRow(row.id, { status: "ON_BREAK", work_phase: "ON_BREAK" });
      if (reload) reload({ forceRefresh: true });
      addToast(t("tasks.breakStarted"), "success");
    } catch (err) {
      const msg = err.response?.data?.detail || t("common.error");
      addToast(msg, "error");
    } finally {
      setWorkSaving(false);
    }
  };

  const handleQuickResume = async (row, reload, updateRow) => {
    setWorkSaving(true);
    try {
      await taskAction(row.id, "resume-work", {});
      updateRow(row.id, { status: "IN_PROGRESS", work_phase: "IN_PROGRESS" });
      if (reload) reload({ forceRefresh: true });
      addToast(t("tasks.resumedSuccess"), "success");
    } catch (err) {
      const msg = err.response?.data?.detail || t("common.error");
      addToast(msg, "error");
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
    fetchWorkLocation();
  };

  // Shared by the file picker and the camera: store the file and build a preview.
  const applyWorkPhoto = (file) => {
    if (!file) return;
    setWorkPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setWorkPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleWorkPhotoChange = (e) => applyWorkPhoto(e.target.files[0]);

  const submitWork = async () => {
    if (!workModal) return;

    const phase = workModal.phase;
    const { row, reload, updateRow } = workModal;

    // Before / During / Completed work: require BOTH a location and a photo
    // (proof the worker was on-site at each stage) before the entry can be
    // submitted. Break phases keep their own rules.
    if (["BEFORE", "DURING_WORK", "COMPLETED"].includes(phase)) {
      if (!workPos) {
        setWorkError(t("gps.noLocation"));
        return;
      }
      if (!workPhoto) {
        setWorkError(t("tasks.photoRequired"));
        return;
      }
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
      await taskAction(row.id, action, workPhoto ? toFormData({ ...data, photo: workPhoto }) : data);

      // Immediately update local state so buttons change without waiting for reload
      const newStatus = nextStatusAfterAction[phase];
      const newPhase = nextPhaseAfterAction[phase];
      if (updateRow && (newStatus || newPhase)) {
        updateRow(row.id, {
          ...(newStatus ? { status: newStatus } : {}),
          ...(newPhase ? { work_phase: newPhase } : {}),
        });
      }

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
      setWorkError(
        err?.response?.status === 404
          ? "API endpoint not found (404) \u2014 backend action URL mismatch. Check the task action routes."
          : err.response?.data?.detail || err.message
      );
    } finally {
      setWorkSaving(false);
    }
  };

  // ── TaskTimer component ──────────────────────────────────────────
  // Shows the timer based on task.status and my_execution.timer_data
  const TaskTimer = ({ row }) => {
    const status = row.status;
    const execution = row.my_execution;
    // Prefer the task-level work_timer (computed from activities → works for
    // every user, incl. admins with no Employee profile); fall back to the
    // execution timer.
    const timerData = row.work_timer || execution?.timer_data;
    const session = row.active_session;
    const tracked = row.total_tracked_minutes;

    // Tick a local `now` ONCE PER SECOND, but only while THIS row's timer is
    // actively counting up. Previously a single interval on the parent
    // re-rendered the entire Tasks page + table every second; scoping it here
    // means static rows never re-render and only running timers update.
    const isTicking =
      !CLOSED_STATUSES.includes(status) &&
      status !== "ON_BREAK" &&
      ((timerData && timerData.start_time && !timerData.is_completed) ||
        status === "IN_PROGRESS");
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
      if (!isTicking) return undefined;
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }, [isTicking]);

    const fmt = (secs) => {
      const v = Math.max(0, Math.floor(secs || 0));
      const h = Math.floor(v / 3600);
      const m = Math.floor((v % 3600) / 60);
      const s = v % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    // Live timer computed from the execution's anchors — ticks off `now`
    // (updated every second), counts up while working, freezes during a break.
    if (timerData && timerData.start_time) {
      const anchor = new Date(timerData.start_time).getTime();
      const accBreak = timerData.accumulated_break_seconds || 0;

      if (timerData.is_completed || CLOSED_STATUSES.includes(status)) {
        return (
          <div className="flex items-center gap-1.5">
            <CheckCircle size={12} className="text-green-500" />
            <span className="text-xs font-medium text-green-700">{fmt(timerData.final_work_seconds)}</span>
          </div>
        );
      }

      if (timerData.is_on_break || status === "ON_BREAK") {
        const breakStart = timerData.break_start_time ? new Date(timerData.break_start_time).getTime() : now;
        const frozen = (breakStart - anchor) / 1000 - accBreak;
        return (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            <span className="text-xs font-medium text-amber-700" title={t("tasks.onBreak")}>
              {`${fmt(frozen)} ⏸`}
            </span>
          </div>
        );
      }

      const net = (now - anchor) / 1000 - accBreak;
      return (
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <span className="text-xs font-medium text-green-700">{fmt(net)}</span>
        </div>
      );
    }

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

  // ── Action buttons — driven by row.work_phase ───────────────
  const getActionButtons = (row, reload, updateRow) => {
    const workPhase = row.work_phase || "BEFORE";

    if (workPhase === "COMPLETED" || CLOSED_STATUSES.includes(row.status))
      return <Badge color="green"><span className="inline-flex items-center gap-1"><CheckCircle size={12} /> Work Done</span></Badge>;

    if (workPhase === "ON_BREAK")
      return (
        <div className="flex items-center gap-1 flex-nowrap">
          <button onClick={() => handleQuickResume(row, reload, updateRow)} disabled={workSaving}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-green-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50">
            <Play size={13} />{t("tasks.startWork")}
          </button>
        </div>
      );

    if (workPhase === "IN_PROGRESS")
      return (
        <div className="flex items-center gap-1 flex-nowrap">
          <button onClick={() => openWorkModal(row, "DURING_WORK", reload, updateRow)}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-indigo-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700">
            <Camera size={13} />{t("gps.duringWork")}
          </button>
          <button onClick={() => handleQuickBreak(row, reload, updateRow)} disabled={workSaving}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-amber-500 px-2 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50">
            <Pause size={13} />{t("tasks.break")}
          </button>
          <button onClick={() => openWorkModal(row, "COMPLETED", reload, updateRow)}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-green-700 px-2 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-800">
            <CheckCircle size={13} />{t("gps.completedWork")}
          </button>
        </div>
      );

    // BEFORE phase
    return (
      <div className="flex items-center gap-1 flex-nowrap">
        <button onClick={() => openWorkModal(row, "BEFORE", reload, updateRow)}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-brand-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700">
          <Camera size={13} />{t("gps.beforeWork")}
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

              {/* Photo - required for BEFORE, DURING_WORK and COMPLETED */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t("common.workPhoto")}
                  <span className="text-red-500"> *</span>
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
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setWorkCameraOpen(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700"
                    >
                      <Camera size={18} /> {t("common.takePhoto")}
                    </button>
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                      <p className="text-sm text-gray-500">{t("common.orChooseFile")}</p>
                      <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleWorkPhotoChange} />
                    </label>
                  </div>
                )}
              </div>

            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setWorkModal(null)} disabled={workSaving}>
                {t("common.cancel")}
              </Button>

              {/* BEFORE / DURING_WORK / COMPLETED: Submit is enabled only once
                  BOTH a photo and a location are attached. */}
              {["BEFORE", "DURING_WORK", "COMPLETED"].includes(workModal.phase) && (
                workPos && workPhoto ? (
                  <Button onClick={submitWork} disabled={workSaving}>
                    {workSaving ? (
                      <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" />{t("common.saving")}</span>
                    ) : (
                      <span className="flex items-center gap-2"><CheckCircle size={16} />Submit</span>
                    )}
                  </Button>
                ) : (
                  <span className="text-xs text-gray-400 self-center">
                    {!workPos && !workPhoto ? "Add photo & location to submit" :
                     !workPos ? "Waiting for location..." : "Add a photo to submit"}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      )}

      <CameraCapture
        open={workCameraOpen}
        title={t("common.workPhoto")}
        onClose={() => setWorkCameraOpen(false)}
        onCapture={(file) => { applyWorkPhoto(file); setWorkCameraOpen(false); }}
      />

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </>
  );
}
