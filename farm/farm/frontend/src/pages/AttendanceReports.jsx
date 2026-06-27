import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { FileBarChart, Download } from "lucide-react";
import { resource } from "../lib/api";
import { Button, Card, Input, PageHeader, Select, Table } from "../components/ui";
import { exportExcel } from "../lib/export";

const att = resource("workforce/attendance");

export default function AttendanceReports() {
  const { t } = useTranslation();
  const [farms, setFarms] = useState([]);
  const [farm, setFarm] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState(null);

  const MONTHS = [{ value: "", label: t("attendanceReports.allMonths") }].concat(
    Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString("en", { month: "long" }) }))
  );

  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    const params = { year };
    if (farm) params.farm = farm;
    if (month) params.month = month;
    setReport(await att.collectionAction("report", params));
  };

  const handleExport = () => {
    if (!report?.rows || report.rows.length === 0) {
      return;
    }
    // Generate filename
    const farmName = farms.find(f => f.id === farm)?.name || "all_farms";
    const monthLabel = MONTHS.find(m => String(m.value) === String(month))?.label || "all_months";
    const filename = `attendance_report_${farmName}_${monthLabel}_${year}.xlsx`;
    
    exportExcel(
      report.rows, 
      [
        { key: "employee", header: t("header.employee") },
        { key: "present", header: t("header.present") },
        { key: "half_day", header: t("header.halfDay") },
        { key: "absent", header: t("header.absent") },
        { key: "leave", header: t("header.leave") },
        { key: "overtime_hours", header: t("header.otHrs") },
        { key: "attendance_pct", header: t("header.attendancePct") },
      ],
      filename,
      "Attendance Report"
    );
  };

  return (
    <div>
      <PageHeader 
        title={t("attendanceReports.titlePg")} 
        subtitle={t("attendanceReports.subtitlePg")} 
        action={
          report?.rows?.length > 0 && (
            <Button onClick={handleExport}>
              <Download size={15} /> {t("attendanceReports.exportExcel")}
            </Button>
          )
        }
      />
      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <Select label={t("attendanceReports.selectFarm")} value={farm} onChange={(e) => setFarm(e.target.value)}>
              <option value="">{t("workforce.allFarms")}</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[150px]"><Select label={t("attendanceReports.selectMonth")} value={month} onChange={(e) => setMonth(e.target.value)} options={MONTHS} /></div>
          <div className="w-28"><Input label={t("attendanceReports.selectYear")} type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
          <Button onClick={run}><FileBarChart size={15} /> {t("attendanceReports.runBtn")}</Button>
        </div>
        <Table
          empty={t("attendanceReports.noAttendance")}
          columns={[
            { key: "employee", header: t("header.employee") },
            { key: "present", header: t("header.present") },
            { key: "half_day", header: t("header.halfDay") },
            { key: "absent", header: t("header.absent") },
            { key: "leave", header: t("header.leave") },
            { key: "overtime_hours", header: t("header.otHrs") },
            {
              key: "attendance_pct",
              header: t("header.attendancePct"),
              render: (r) => (
                <b className={r.attendance_pct >= 75 ? "text-brand-700" : "text-amber-600"}>
                  {r.attendance_pct}%
                </b>
              ),
            },
          ]}
          rows={report?.rows || []}
        />
        {report?.count > 0 && (
          <p className="mt-3 text-sm text-gray-500">{t("attendanceReports.workersSummarized", { count: report.count })}</p>
        )}
      </Card>
    </div>
  );
}
