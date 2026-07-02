import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays, CheckCircle2, Clock, Download, FileBarChart, ListTodo, Loader,
} from "lucide-react";
import {
  BarChart, Bar, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { resource } from "../lib/api";
import { Badge, Button, Card, PageHeader, Table } from "../components/ui";
import { exportExcel } from "../lib/export";

const tasksRepo = resource("tasks");
const sessionsRepo = resource("tasks/sessions");

const statusColor = {
  TODO: "gray", IN_PROGRESS: "blue", SUBMITTED: "purple",
  VERIFIED: "green", COMPLETED: "green", CANCELLED: "red",
};
const prioLabelMap = {
  LOW: "tasks.priorityLow",
  MEDIUM: "tasks.priorityMedium",
  HIGH: "tasks.priorityHigh",
  URGENT: "tasks.priorityUrgent",
};

const statusLabelMap = {
  TODO: "tasks.statusTodo",
  IN_PROGRESS: "tasks.statusInProgress",
  SUBMITTED: "tasks.statusSubmitted",
  VERIFIED: "tasks.statusVerified",
  COMPLETED: "tasks.statusCompleted",
  CANCELLED: "tasks.statusCancelled",
};

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatElapsed(startTime) {
  const start = new Date(startTime);
  const elapsed = Math.floor((Date.now() - start.getTime()) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function DailyTaskReport() {
  const { t } = useTranslation();
  const [todayTasks, setTodayTasks] = useState([]);
  const [todaySessions, setTodaySessions] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadReport = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);

      // Fetch tasks — get a broad set and filter on the client
      const taskData = await tasksRepo.list({ page_size: 200 });
      const allTasks = Array.isArray(taskData) ? taskData : taskData.results || [];

      // Tasks relevant to today: created today, due today, or updated today
      const relevant = allTasks.filter((t) => {
        const created = t.created_at?.slice(0, 10) === today;
        const due = t.due_date === today;
        // Check if updated today via updated_at field
        const updated = t.updated_at?.slice(0, 10) === today;
        return created || due || updated;
      });
      setTodayTasks(relevant);

      // Fetch sessions
      const sessData = await sessionsRepo.list({ page_size: 100 });
      const allSessions = Array.isArray(sessData) ? sessData : sessData.results || [];
      const todaySess = allSessions.filter((s) => {
        const startDay = s.start_time?.slice(0, 10);
        return startDay === today;
      });
      setTodaySessions(todaySess);
      setActiveSessions(allSessions.filter((s) => s.is_active));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    // Poll every ~120s with jitter to avoid thundering herd
    const base = 120000;
    const jitter = Math.floor(Math.random() * base * 0.4) - Math.floor(base * 0.2); // ±20%
    const id = setInterval(loadReport, base + jitter);
    return () => clearInterval(id);
  }, []);

  // Compute stats
  const stats = {
    total: todayTasks.length,
    todo: todayTasks.filter((t) => t.status === "TODO").length,
    inProgress: todayTasks.filter((t) => t.status === "IN_PROGRESS").length,
    submitted: todayTasks.filter((t) => t.status === "SUBMITTED").length,
    verified: todayTasks.filter((t) => t.status === "VERIFIED").length,
    completed: todayTasks.filter((t) => ["COMPLETED", "VERIFIED"].includes(t.status)).length,
    cancelled: todayTasks.filter((t) => t.status === "CANCELLED").length,
    dueToday: todayTasks.filter((t) => t.due_date === new Date().toISOString().slice(0, 10)).length, // eslint-disable-line
    activeNow: activeSessions.length,
    todaySessions: todaySessions.length,
    totalMinutes: todaySessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0),
  };

  const statCards = [
    { label: t("tasks.tasksToday"), value: stats.total, icon: ListTodo, color: "from-blue-500 to-blue-700" },
    { label: t("tasks.dueToday"), value: stats.dueToday, icon: CalendarDays, color: "from-amber-500 to-amber-600" },
    { label: t("tasks.inProgress"), value: stats.inProgress, icon: Loader, color: "from-blue-500 to-blue-700" },
    { label: t("tasks.completed"), value: stats.completed, icon: CheckCircle2, color: "from-emerald-500 to-emerald-700" },
    { label: t("tasks.activeSessions"), value: stats.activeNow, icon: Clock, color: "from-green-500 to-green-700" },
    { label: t("tasks.trackedToday"), value: formatDuration(stats.totalMinutes), icon: FileBarChart, color: "from-purple-500 to-purple-700" },
  ];

  // Chart data
  // Hover state for interactive animations
  const [activeIndex, setActiveIndex] = useState(null);
  const [hoverBar, setHoverBar] = useState(null);

  const PIE_COLORS = ["#6b7280", "#3b82f6", "#8b5cf6", "#16a34a", "#22c55e", "#ef4444"];
  const PIE_HOVER_OFFSET = 8;

  const statusPieData = [
    { name: t("tasks.pieToDo"), value: stats.todo, color: PIE_COLORS[0] },
    { name: t("tasks.pieInProgress"), value: stats.inProgress, color: PIE_COLORS[1] },
    { name: t("tasks.pieSubmitted"), value: stats.submitted, color: PIE_COLORS[2] },
    { name: t("tasks.pieVerified"), value: stats.verified, color: PIE_COLORS[3] },
    { name: t("tasks.pieCompleted"), value: todayTasks.filter((t) => t.status === "COMPLETED").length, color: PIE_COLORS[4] },
    { name: t("tasks.pieCancelled"), value: stats.cancelled, color: PIE_COLORS[5] },
  ].filter((d) => d.value > 0);

  // Priority distribution
  const priorityCounts = {};
  todayTasks.forEach((t) => {
    const p = t.priority || "UNKNOWN";
    priorityCounts[p] = (priorityCounts[p] || 0) + 1;
  });
  const priorityChartData = Object.entries(priorityCounts).map(([name, value]) => ({ name: t(prioLabelMap[name] || name), value }));
  const PRIORITY_COLORS_TOTAL = ["#6b7280", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

  // Custom tooltip for pie chart
  const PieTooltip = useCallback(({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lift">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.payload.color || d.color }} />
          <span className="text-sm font-semibold text-gray-800">{d.name}</span>
        </div>
        <p className="mt-1 text-lg font-bold text-gray-900">{d.value} {d.value !== 1 ? t("common.tasks") : t("header.task")}</p>
        <p className="text-xs text-gray-500">{((d.payload.percent || d.percent || 0) * 100).toFixed(1)}% {t("common.total")}</p>
      </div>
    );
  }, []);

  // Custom tooltip for bar chart
  const BarTooltip = useCallback(({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lift">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="mt-1 text-lg font-bold text-brand-700">{payload[0].value} {payload[0].value !== 1 ? t("common.tasks") : t("header.task")}</p>
      </div>
    );
  }, []);

  // Custom pie label with hover highlight
  const renderPieLabel = useCallback(({ name, percent, cx, cy, midAngle, innerRadius, outerRadius, index }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + (index === activeIndex ? PIE_HOVER_OFFSET + 6 : 6);
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        textAnchor={x > cx ? "start" : "end"}
        fill={index === activeIndex ? "#1f2937" : "#6b7280"}
        fontSize={index === activeIndex ? 13 : 11}
        fontWeight={index === activeIndex ? 700 : 500}
        className="transition-all duration-200"
      >
        {`${name} ${(percent * 100).toFixed(0)}%`}
      </text>
    );
  }, [activeIndex]);

  return (
    <div>
      <PageHeader
        title={t("dailyTaskReport.title")}
        subtitle={t("dailyTaskReport.subtitle")}
        action={
          <div className="flex items-center gap-2">
            {todayTasks.length > 0 && (
              <Button variant="secondary" onClick={() => {
                const exportRows = [
                  ...todayTasks,
                  {
                    title: t("common.total"),
                    assigned_to_name: "",
                    status: "",
                    progress: todayTasks.reduce((s, t) => s + (t.progress || 0), 0),
                  },
                ];
                exportExcel(exportRows, [{key:"title",header:t("header.task")},{key:"assigned_to_name",header:t("header.assignee")},{key:"status",header:t("header.status")},{key:"progress",header:t("tasks.progressPercent")}], "daily-tasks.xlsx", t("tasks.exportTasks"));
              }}>
                <Download size={15} /> {t("common.excel")}
              </Button>
            )}
            {todaySessions.length > 0 && (
              <Button variant="secondary" onClick={() => {
                const totalMin = todaySessions.reduce((s, t) => s + (t.duration_minutes || 0), 0);
                const exportRows = [
                  ...todaySessions,
                  {
                    user_name: t("common.total"),
                    start_time: "",
                    end_time: "",
                    duration_minutes: totalMin,
                  },
                ];
                exportExcel(exportRows, [{key:"user_name",header:t("header.worker")},{key:"start_time",header:t("header.started")},{key:"end_time",header:t("header.ended")},{key:"duration_minutes",header:t("header.duration")}], "daily-sessions.xlsx", t("tasks.exportSessionsTitle"));
              }}>
                <Download size={15} /> {t("tasks.exportSessions")}
              </Button>
            )}
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((c) => (
          <div
            key={c.label}
            className={`rounded-2xl bg-gradient-to-br ${c.color} p-4 text-white shadow-sm`}
          >
            <c.icon size={20} className="opacity-80" />
            <p className="mt-2 text-2xl font-bold">{c.value}</p>
            <p className="text-xs opacity-90">{c.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-gray-400">{t("tasks.loadingReport")}</p>
      ) : (
        <>
          {/* Charts Row */}
          {statusPieData.length > 0 && (
            <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card title={t("common.statusDist")}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={50}
                      paddingAngle={3}
                      animationBegin={0}
                      animationDuration={800}
                      animationEasing="ease-out"
                      label={renderPieLabel}
                      labelLine={false}
                      onMouseEnter={(_, index) => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(null)}
                      activeIndex={activeIndex}
                      activeShape={(props) => {
                        const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                        return (
                          <g>
                            <Pie
                              cx={cx}
                              cy={cy}
                              innerRadius={innerRadius}
                              outerRadius={outerRadius + PIE_HOVER_OFFSET}
                              startAngle={startAngle}
                              endAngle={endAngle}
                              fill={fill}
                              data={[statusPieData[activeIndex]]}
                              dataKey="value"
                              animationBegin={0}
                              animationDuration={200}
                              isAnimationActive={false}
                            />
                          </g>
                        );
                      }}
                    >
                      {statusPieData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.color}
                          stroke={i === activeIndex ? "#1f2937" : "transparent"}
                          strokeWidth={i === activeIndex ? 2 : 0}
                          className="transition-all duration-200"
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              <Card title={t("common.priorityBreakdown")}>
                {priorityChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={priorityChartData}
                      onMouseLeave={() => setHoverBar(null)}
                    >
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: "#6b7280" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: "#9ca3af" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<BarTooltip />} cursor={{ fill: "#f3f4f6" }} />
                      <Bar
                        dataKey="value"
                        radius={[6, 6, 0, 0]}
                        animationBegin={200}
                        animationDuration={600}
                        animationEasing="ease-out"
                        onMouseEnter={(_, index) => setHoverBar(index)}
                      >
                        {priorityChartData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={PRIORITY_COLORS_TOTAL[i % PRIORITY_COLORS_TOTAL.length]}
                            opacity={hoverBar === null || hoverBar === i ? 1 : 0.4}
                            className="transition-opacity duration-200"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-gray-400">{t("common.noChartData")}</p>
                )}
              </Card>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Today's Tasks */}
          <Card title={t("common.todaysTasks", { count: todayTasks.length })}>
            <Table
              empty={t("common.noTasksToday")}
              columns={[
                { key: "title", header: t("header.task") },
                { key: "assigned_to_name", header: t("header.assignee"), render: (r) => r.assigned_to_name || r.assigned_employee_name || "—" },
                {
                  key: "status",
                  header: t("header.status"),
                  render: (r) => <Badge color={statusColor[r.status]}>{t(statusLabelMap[r.status] || r.status)}</Badge>,
                },
                {
                  key: "progress",
                  header: t("header.progress"),
                  render: (r) => (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full bg-brand-500"
                          style={{ width: `${r.progress || 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{r.progress || 0}%</span>
                    </div>
                  ),
                },
              ]}
              rows={todayTasks}
              footerColumns={["progress"]}
            />
          </Card>

          {/* Active & Today's Sessions */}
          <Card title={t("common.workSessionsToday", { count: todaySessions.length })}>
            {activeSessions.length > 0 && (
              <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">
                  {t("tasks.liveNow", { count: activeSessions.length })}
                </p>
                <div className="space-y-2">
                  {activeSessions.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                      </span>
                      <span className="font-medium text-gray-800">{s.user_name || s.username}</span>
                      <span className="ml-auto font-semibold text-green-700">
                        {formatElapsed(s.start_time)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Table
              empty={t("common.noSessionsToday")}
              columns={[
                { key: "user_name", header: t("header.worker"), render: (r) => r.user_name || r.username || "—" },
                {
                  key: "start_time",
                  header: t("header.started"),
                  render: (r) =>
                    r.start_time
                      ? new Date(r.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "—",
                },
                {
                  key: "end_time",
                  header: t("header.ended"),
                  render: (r) =>
                    r.end_time
                      ? new Date(r.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : <Badge color="green">{t("tasks.active")}</Badge>,
                },
                {
                  key: "duration_minutes",
                  header: t("header.duration"),
                  render: (r) => formatDuration(r.duration_minutes),
                },
              ]}
              rows={todaySessions}
              footerColumns={["duration_minutes"]}
            />

            {todaySessions.length > 0 && (
              <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
                <span className="text-gray-500">
                  {t("common.trackedTimeLabel")} <b className="text-brand-700">{formatDuration(stats.totalMinutes)}</b>
                </span>
              </div>
            )}
          </Card>
        </div>
        </>
      )}
    </div>
  );
}
