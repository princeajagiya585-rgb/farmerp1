import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import { api, resource } from "../lib/api";
import { exportCSV } from "../lib/export";
import { Button, Card, Input, PageHeader, Select, Table } from "../components/ui";

export default function TimeTrackingReports() {
  const { t } = useTranslation();
  const [farms, setFarms] = useState([]);
  const [farm, setFarm] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    setLoading(true);
    try {
      const params = {};
      if (farm) params.farm = farm;
      if (start) params.start = start;
      if (end) params.end = end;
      const res = await api.get("/reporting/time-tracking/", { params });
      setData(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (userId) => {
    setExpanded((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  // Add index for the SR column (Table render only receives row)
  const flatRows = (data?.rows || []).map((r, i) => ({ ...r, _idx: i + 1 }));

  const tableColumns = [
    { key: "_idx", header: t("header.srNo") },
    { key: "full_name", header: t("header.worker"), render: (r) => r.full_name || r.username },
    { key: "total_time", header: t("header.totalTime"), render: (r) => <span className="font-semibold text-brand-600">{r.total_hours || 0} h, {r.total_minutes || 0} m</span> },
    {
      key: "_expand",
      header: t("header.tasks"),
      render: (r) =>
        r.tasks?.length > 0 ? (
          <button
            onClick={() => toggleExpand(r.user_id)}
            className="text-xs font-medium text-brand-600 hover:text-brand-800"
          >
            {expanded[r.user_id] ? "▲ Hide" : "▼ Show"} ({r.tasks.length})
          </button>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
  ];

  const exportRows = flatRows.flatMap((r) => {
    if (r.tasks?.length > 0) {
      return r.tasks.map((t) => ({
        Worker: r.full_name || r.username,
        Username: r.username,
        Task: t.task_title,
        "Task Hours": t.hours,
        "Task Minutes": t.minutes,
        "Total Hours": r.total_hours,
        "Total Minutes": r.total_minutes,
        Sessions: r.task_count,
      }));
    }
    return [{
      Worker: r.full_name || r.username,
      Username: r.username,
      Task: "—",
      "Task Hours": "—",
      "Task Minutes": "—",
      "Total Hours": r.total_hours,
      "Total Minutes": r.total_minutes,
      Sessions: r.task_count,
    }];
  });

  // Build columns for CSV export (flat key-value pairs)
  const exportColumns = [
    { key: "Worker", header: t("header.worker") },
    { key: "Username", header: t("header.username") },
    { key: "Task", header: t("header.task") },
    { key: "Task Hours", header: t("header.taskHours") },
    { key: "Task Minutes", header: t("header.taskMinutes") },
    { key: "Total Hours", header: t("header.totalHours") },
    { key: "Total Minutes", header: t("header.totalMinutes") },
    { key: "Sessions", header: t("header.tasks") },
  ];

  return (
    <div>
      <PageHeader
        title={t("timeTrackingReports.title")}
        subtitle={t("timeTrackingReports.subtitle")}
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <Select label="Farm" value={farm} onChange={(e) => setFarm(e.target.value)}>
              <option value="">All farms</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
          <div className="w-44">
            <Input label="Start Date" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="w-44">
            <Input label="End Date" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={run} disabled={loading}>
              <FileBarChart size={15} /> {loading ? "Loading…" : "Run"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => exportCSV(exportRows, exportColumns, `time-tracking-${new Date().toISOString().slice(0, 10)}.csv`)}
              disabled={flatRows.length === 0}
            >
              <Download size={15} /> CSV
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="py-8 text-center text-gray-400">Loading report…</p>
        ) : (
          <>
            <Table
              empty="No tracked time found for this period."
              columns={tableColumns}
              rows={flatRows}
            />

            {/* Expandable task breakdown rows */}
            {flatRows.map((r) =>
              expanded[r.user_id] && r.tasks?.length > 0 ? (
                <div key={r.user_id} className="mx-3 mb-3 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Task breakdown — {r.full_name || r.username}
                  </p>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-brand-100 text-gray-500">
                        <th className="py-1 pr-3 font-medium">{t("header.task")}</th>
                        <th className="py-1 font-medium">{t("header.totalTime")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.tasks.map((t) => (
                        <tr key={`${r.user_id}-${t.task_id}`} className="border-b border-brand-50">
                          <td className="py-1 pr-3 text-gray-700">{t.task_title}</td>
                          <td className="py-1 text-gray-700">{t.hours || 0} h, {t.minutes || 0} m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null
            )}

            {data && flatRows.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-4 rounded-lg bg-gray-50 p-3 text-sm">
                <span className="text-gray-500">
                  Workers: <b className="text-gray-700">{data.total_users}</b>
                </span>
                <span className="text-gray-500">
                  {t("header.totalTime")}: <b className="text-brand-700">{data.total_hours || 0} h, {data.total_minutes || 0} m</b>
                </span>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
