import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, ListTodo, Loader, CheckCircle2, AlertTriangle } from "lucide-react";
import { resource } from "../lib/api";
import { exportExcel } from "../lib/export";
import { Badge, Button, Card, PageHeader, Table } from "../components/ui";

const repo = resource("tasks");
const prioColor = { LOW: "gray", MEDIUM: "blue", HIGH: "yellow", URGENT: "red" };

// ── Build a total row for export ───────────────────────────────────────
function withTotal(rows, firstColKey, countKey) {
  if (!rows.length) return rows;
  const total = rows.reduce((s, r) => s + (r[countKey] || 0), 0);
  return [
    ...rows,
    { [firstColKey]: "Total", [countKey]: total },
  ];
}

export default function TaskMonitor() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [delayed, setDelayed] = useState([]);

  const PRIORITY_COLS = [
    { key: "priority", header: t("header.priority") },
    { key: "count", header: t("header.count") },
  ];

  const SCHEDULE_COLS = [
    { key: "schedule_type", header: t("header.level") },
    { key: "count", header: t("header.count") },
  ];

  const DELAYED_COLS = [
    { key: "title", header: t("header.title") },
    { key: "farm_name", header: t("header.farm") },
    { key: "priority", header: t("header.priority"), render: (r) => <Badge color={prioColor[r.priority]}>{r.priority}</Badge> },
    { key: "due_date", header: t("header.dueDate"), render: (r) => <span className="font-semibold text-red-600">{r.due_date}</span> },
    { key: "status", header: t("header.status") },
  ];

  useEffect(() => {
    repo.collectionAction("stats").then(setStats);
    repo.list({ page_size: 300 }).then((d) => {
      const rows = d.results || d;
      setDelayed(rows.filter((t) => t.is_overdue));
    });
  }, []);

  const cards = [
    { label: "Pending", value: stats?.pending ?? "—", icon: ListTodo, color: "from-gray-500 to-gray-700" },
    { label: "Active", value: stats?.active ?? "—", icon: Loader, color: "from-blue-500 to-blue-700" },
    { label: "Completed", value: stats?.completed ?? "—", icon: CheckCircle2, color: "from-emerald-500 to-emerald-700" },
    { label: "Delayed", value: stats?.delayed ?? "—", icon: AlertTriangle, color: "from-red-500 to-red-600" },
  ];

  return (
    <div>
      <PageHeader title={t("taskMonitor.title")} subtitle={t("taskMonitor.subtitle")} />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl bg-gradient-to-br ${c.color} p-5 text-white shadow-sm`}>
            <c.icon size={22} className="opacity-80" />
            <p className="mt-3 text-3xl font-bold">{c.value}</p>
            <p className="text-sm opacity-90">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title={t("taskMonitor.byPriority")}
          action={
            stats?.by_priority?.length ? (
              <Button
                variant="secondary"
                onClick={() =>
                  exportExcel(
                    withTotal(stats.by_priority, "priority", "count"),
                    PRIORITY_COLS,
                    "tasks-by-priority.xlsx",
                    "By Priority"
                  )
                }
              >
                <Download size={14} /> Excel
              </Button>
            ) : null
          }
        >
          <Table
            empty="No tasks."
            columns={PRIORITY_COLS}
            rows={stats?.by_priority || []}
            footerColumns={["count"]}
          />
        </Card>
        <Card
          title={t("taskMonitor.bySchedule")}
          action={
            stats?.by_schedule_type?.length ? (
              <Button
                variant="secondary"
                onClick={() =>
                  exportExcel(
                    withTotal(stats.by_schedule_type, "schedule_type", "count"),
                    SCHEDULE_COLS,
                    "tasks-by-schedule.xlsx",
                    "By Schedule Level"
                  )
                }
              >
                <Download size={14} /> Excel
              </Button>
            ) : null
          }
        >
          <Table
            empty="No tasks."
            columns={SCHEDULE_COLS}
            rows={stats?.by_schedule_type || []}
            footerColumns={["count"]}
          />
        </Card>
      </div>

      <Card
        title={t("taskMonitor.delayedTasks", { count: delayed.length })}
        action={
          delayed.length > 0 ? (
            <Button
              variant="secondary"
              onClick={() => {
                const exportRows = [
                  ...delayed,
                  { title: `Total: ${delayed.length} delayed tasks`, farm_name: "", priority: "", due_date: "", status: "" },
                ];
                exportExcel(exportRows, DELAYED_COLS, "delayed-tasks.xlsx", "Delayed Tasks");
              }}
            >
              <Download size={14} /> Excel
            </Button>
          ) : null
        }
      >
        <Table
          empty="No delayed tasks. 🎉"
          columns={DELAYED_COLS}
          rows={delayed}
        />
      </Card>
    </div>
  );
}
