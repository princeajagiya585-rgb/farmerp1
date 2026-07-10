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

// Work phase config - using new API endpoints
const workPhaseConfig = {
  BEFORE: { action: "before-work", labelKey: "gps.beforeWork" },
  BREAK_START: { action: "take-break", labelKey: "tasks.break" },
  BREAK_END: { action: "resume-work", labelKey: "tasks.resumeWork" },
  DURING_WORK: { action: "during-work", labelKey: "gps.duringWork" },
  COMPLETED: { action: "complete-work", labelKey: "gps.completedWork" },
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

// Get location with address
const getLocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };

        // Try to get address from coordinates using reverse geocoding
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}&zoom=18&addressdetails=1`
          );
          const data = await response.json();
          if (data.display_name) {
            loc.address = data.display_name;
          }
        } catch (e) {
          console.log("Address lookup failed:", e);
        }

        resolve(loc);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

const formatDuration = (minutes) => {
  if (!minutes && minutes !== 0) return "—";
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const formatTime = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
      setTimerRefresh(r => r + 1); // Trigger timer refresh
    }, 1000); // Update every second for live timer
    return () => clearInterval(id);
  }, []);

  const assignFields = isEmployee
    ? []
    : [
        { name: "assigned_to", label: t("tasks.assignToUser"), optionsFrom: { path: "auth/users", label: (u) => u.full_name || u.username } },
        { name: "assigned_employee", label: t("tasks.assignToWorker"), optionsFrom: { path: "workforce/employees", label: (e) => e.name } },
      ];

  // Work modal state
  const [workModal, setWorkModal] = useState(null); // { row, phase, reload }
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

        // Try to get address
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

  const openWorkModal = (row, phase, reload) => {
    setWorkModal({ row, phase, reload });
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

    // For COMPLETED phase, require confirmation
    if (phase === "COMPLETED" && !completeConfirm) {
      setCompleteConfirm(true);
      return;
    }

    // Validate required fields based on phase
    // Every action requires GPS (per requirement)
    if (!workPos) {
      setWorkError(t("gps.noLocation"));
      return;
    }

    // Photo is optional for all phases — users can submit without it
    // This is important for compatibility across devices and browsers

    // Require reason for break
    if (phase === "BREAK_START" && !workReason.trim()) {
      setWorkError(t("tasks.breakReasonRequired"));
      return;
    }

    // Require completion notes for COMPLETED
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

      // Use the new API endpoints
      await repo.action(workModal.row.id, action, workPhoto ? toFormData({ ...data, photo: workPhoto }) : data);

      // Use forceRefresh to bust browser cache and ensure fresh data
      const reload = workModal.reload;
      setWorkModal(null);
      reload({ forceRefresh: true });

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

  // Get work phase — uses backend-computed work_phase field, with
  // fallback to local computation from location_pings for older backends.
  const getWorkPhase = (row) => {
    // First priority: use my_execution if available (new workflow)
    if (row.my_execution) {
      const status = row.my_execution.status;
      // Check terminal statuses first
      if (["WAITING_APPROVAL", "COMPLETED", "APPROVED"].includes(status)) {
        return "COMPLETED";
      }
      if (status === "ON_BREAK") {
        return "ON_BREAK";
      }
      // IN_PROGRESS — check if before_work has been done
      if (status === "IN_PROGRESS") {
        return row.my_execution.before_work_time ? "IN_PROGRESS" : "BEFORE";
      }
      // If my_execution exists with any other status (ASSIGNED, CONFIRMED),
      // still mark as BEFORE so the user can start work via before_work
      return "BEFORE";
    }

    // Second priority: Backend already computes work_phase — use it directly
    if (row.work_phase) {
      const validPhases = ["BEFORE", "IN_PROGRESS", "ON_BREAK", "COMPLETED"];
      if (validPhases.includes(row.work_phase)) {
        return row.work_phase;
      }
    }

    // Fallback: compute from location_pings (legacy)
    const pings = row.location_pings || [];
    if (!pings.length) return "BEFORE";
    const sorted = [...pings].sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
    const latest = sorted[0]?.activity;
    if (latest === "CHECKOUT") return "COMPLETED";
    if (latest === "BREAK") return "ON_BREAK";
    if (["CHECKIN", "DURING_WORK", "RESUME"].includes(latest)) return "IN_PROGRESS";
    return "BEFORE";
  };

  // Timer component - uses execution timer_data for accurate live timing
  const TaskTimer = ({ row }) => {
    const execution = row.my_execution;
    const phase = getWorkPhase(row);
    const timerData = execution?.timer_data;

    if (phase === "COMPLETED") {
      // Show final completed time
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

    if (phase === "ON_BREAK") {
      const workingSeconds = timerData?.working_seconds || 0;
      return (
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
          </span>
          <span className="text-xs font-medium text-amber-700" title={t("tasks.onBreak")}>
            {`${String(Math.floor(workingSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((workingSeconds % 3600) / 60)).padStart(2, "0")}:${String(workingSeconds % 60).padStart(2, "0")} ⏸`}
          </span>
        </div>
      );
    }

    if (phase === "IN_PROGRESS" && timerData) {
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

    // Fallback: use legacy active_session
    const session = row.active_session;
    const tracked = row.total_tracked_minutes;

    if (phase === "IN_PROGRESS") {
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

    // BEFORE phase or no session
    return tracked ? (
      <span className="text-xs text-gray-500" title={t("tasks.totalTracked")}>
        {formatDuration(tracked)}
      </span>
    ) : (
      <span className="text-xs text-gray-300">—</span>
    );
  };

  // Get action buttons based on phase
  const getActionButtons = (row, reload) => {
    const phase = getWorkPhase(row);
    console.log("Task row:", row, "phase:", phase, "status:", row.status);
    const isClosed = ["COMPLETED", "VERIFIED", "APPROVED", "CANCELLED"].includes(row.status);

    if (isClosed) {
      return (
        <Badge color="green">
          <span className="inline-flex items-center gap-1">
            <CheckCircle size={12} /> {t("tasks.statusCompleted")}
          </span>
        </Badge>
      );
    }

    switch (phase) {
      case "BEFORE":
        // Show BEFORE WORK button
        return (
          <button
            onClick={() => openWorkModal(row, "BEFORE", reload)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
            title={t("gps.beforeWork")}
          >
            <Camera size={14} />
            {t("gps.beforeWork")}
          </button>
        );

      case "IN_PROGRESS":
        // Show 3 buttons: During Work (modal), Break (modal), Complete Work (modal)
        return (
          <>
            <button
              onClick={() => openWorkModal(row, "DURING_WORK", reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              title={t("gps.duringWork")}
            >
              <Camera size={14} />
              {t("gps.duringWork")}
            </button>
            <button
              onClick={() => openWorkModal(row, "BREAK_START", reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600"
              title={t("tasks.break")}
            >
              <Pause size={14} />
              {t("tasks.break")}
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
        );

      case "ON_BREAK":
        // Show During Work (modal), Resume (modal) — NO Complete Work until work resumes
        return (
          <>
            <button
              onClick={() => openWorkModal(row, "DURING_WORK", reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              title={t("gps.duringWork")}
            >
              <Camera size={14} />
              {t("gps.duringWork")}
            </button>
            <button
              onClick={() => openWorkModal(row, "BREAK_END", reload)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700"
              title={t("tasks.resumeWork")}
            >
              <Play size={14} />
              {t("tasks.resumeWork")}
            </button>
          </>
        );

      case "COMPLETED":
        return (
          <Badge color="green">
            <span className="inline-flex items-center gap-1">
              <CheckCircle size={12} /> {t("tasks.statusCompleted")}
            </span>
          </Badge>
        );

      default:
        return (
          <button
            onClick={() => openWorkModal(row, "BEFORE", reload)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <Camera size={14} />
            {t("gps.beforeWork")}
          </button>
        );
    }
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
        rowActions={(row, reload) => getActionButtons(row, reload)}
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
                {t(workPhaseConfig[workModal.phase]?.labelKey)} — {workModal.row.title}
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

              {/* Photo - optional for all phases */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t("common.workPhoto")} <span className="text-gray-400">({t("common.optional")})</span>
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
                onClick={submitWork}                  disabled={
                  workSaving ||
                  !workPos ||
                  (workModal.phase === "BREAK_START" && !workReason.trim()) ||
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