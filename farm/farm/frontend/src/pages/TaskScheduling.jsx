import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { resource } from "../lib/api";
import { exportExcel } from "../lib/export";
import { Badge, Button, Card, PageHeader, Table } from "../components/ui";

const repo = resource("tasks");
const prioColor = { LOW: "gray", MEDIUM: "blue", HIGH: "yellow", URGENT: "red" };
const statusColor = { TODO: "gray", IN_PROGRESS: "blue", SUBMITTED: "purple", VERIFIED: "green", COMPLETED: "green", CANCELLED: "red" };

export default function TaskScheduling() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState([]);

  // Scheduling levels with the typical activities from the module spec.
  const LEVELS = [
    { key: "DAILY", labelKey: "taskScheduling.daily", hintKey: "taskScheduling.dailyHint" },
    { key: "WEEKLY", labelKey: "taskScheduling.weekly", hintKey: "taskScheduling.weeklyHint" },
    { key: "MONTHLY", labelKey: "taskScheduling.monthly", hintKey: "taskScheduling.monthlyHint" },
    { key: "ANNUAL", labelKey: "taskScheduling.annual", hintKey: "taskScheduling.annualHint" },
    { key: "ADHOC", labelKey: "taskScheduling.adhoc", hintKey: "taskScheduling.adhocHint" },
  ];

  const TASK_COLS = [
    { key: "title", header: t("header.title") },
    { key: "farm_name", header: t("header.farm") },
    { key: "category", header: t("header.category"), render: (r) => r.category || "—" },
    { key: "priority", header: t("header.priority"), render: (r) => <Badge color={prioColor[r.priority]}>{r.priority}</Badge> },
    { key: "recurrence", header: t("header.recurs"), render: (r) => (r.recurrence !== "NONE" ? r.recurrence : "—") },
    {
      key: "due_date",
      header: t("header.dueDate"),
      render: (r) =>
        r.due_date ? (
          <span className={r.is_overdue ? "font-semibold text-red-600" : ""}>
            {r.due_date}
            {r.is_overdue ? " ⚠" : ""}
          </span>
        ) : "—",
    },
    { key: "status", header: t("header.status"), render: (r) => <Badge color={statusColor[r.status]}>{r.status}</Badge> },
  ];

  useEffect(() => {
    repo.list({ page_size: 300 }).then((d) => setTasks(d.results || d));
  }, []);

  return (
    <div>
      <PageHeader title={t("taskScheduling.title")} subtitle={t("taskScheduling.subtitle")} />
      {LEVELS.map((lvl) => {
        const rows = tasks.filter((t) => t.schedule_type === lvl.key);
        return (
          <Card
            key={lvl.key}
            title={`${t(lvl.labelKey)} (${rows.length})`}
            className="mb-5"
            action={
              rows.length > 0 ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    // Append a summary row showing count
                    const exportRows = [
                      ...rows,
                      { title: `Total ${t(lvl.labelKey)}`, farm_name: "", category: "", priority: "", recurrence: "", due_date: "", status: `${rows.length} tasks` },
                    ];
                    exportExcel(exportRows, TASK_COLS, `scheduling-${lvl.key.toLowerCase()}.xlsx`, `${t(lvl.labelKey)} Tasks`);
                  }}
                >
                  <Download size={14} /> Excel
                </Button>
              ) : null
            }
          >
            <p className="-mt-2 mb-3 text-xs text-gray-400">{t(lvl.hintKey)}</p>
            <Table
              empty={`No ${t(lvl.labelKey)} tasks.`}
              columns={TASK_COLS}
              rows={rows}
            />
          </Card>
        );
      })}
    </div>
  );
}
