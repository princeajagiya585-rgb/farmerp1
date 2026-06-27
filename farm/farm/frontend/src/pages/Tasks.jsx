import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, CheckCheck, CheckCircle, Play, Pause, Square, Send, User } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge, Button } from "../components/ui";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const repo = resource("tasks");
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
    <CrudResource
      title={t("tasks.titlePg")}
      subtitle={t("tasks.subtitlePg")}
      path="tasks"
      canWrite
      canEdit={canManage}
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
        { key: "assigned_to_name", header: t("header.assignee"), render: (r) => r.assigned_to_name || r.assigned_employee_name || "—" },
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
          {/* All users (incl. employees) can start/stop their work timer */}
          {!["COMPLETED", "VERIFIED", "CANCELLED"].includes(row.status) &&
            (row.active_session ? (
              <button
                onClick={() => act(row.id, "stop_work", reload)}
                className="inline-flex items-center gap-1 rounded p-1.5 text-amber-600 hover:bg-amber-50"
                title={t("tasks.breakTask")}
              >
                <Pause size={15} />
                <span className="text-xs font-medium">{t("tasks.break")}</span>
              </button>
            ) : (
              <button
                onClick={() => act(row.id, "start_work", reload)}
                className="inline-flex items-center gap-1 rounded p-1.5 text-green-600 hover:bg-green-50"
                title={t("tasks.resumeTask")}
              >
                <Play size={15} />
                <span className="text-xs font-medium">{t("tasks.start")}</span>
              </button>
            ))}
          {/* All users: mark their task complete */}
          {!["COMPLETED", "VERIFIED", "CANCELLED"].includes(row.status) && (
            <button onClick={() => act(row.id, "mark_complete", reload)} className="rounded p-1.5 text-green-700 hover:bg-green-50" title={t("tasks.completeTask")}>
              <CheckCircle size={15} />
            </button>
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
  );
}
