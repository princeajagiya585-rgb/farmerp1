import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { FileBarChart, Download, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { resource } from "../lib/api";
import { Button, Card, Input, PageHeader, Select, Table } from "../components/ui";
import { exportExcel } from "../lib/export";
import { useAuth } from "../context/AuthContext";

const att = resource("workforce/attendance");
const empRepo = resource("workforce/employees");

export default function AttendanceReports() {
  const { t } = useTranslation();
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const isEmployee = user?.role === "EMPLOYEE";
  const canDelete = hasRole("SUPER_ADMIN"); // only super admin may delete
  const [deletingEmp, setDeletingEmp] = useState(null); // employee name currently being deleted
  const [farms, setFarms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [farm, setFarm] = useState("");
  const [employee, setEmployee] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState(null);

  const MONTHS = [{ value: "", label: t("attendanceReports.allMonths") }].concat(
    Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString("en", { month: "long" }) }))
  );

  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));
    empRepo.list({ page_size: 200 }).then((d) => setEmployees(d.results || d));
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    const params = { year };
    if (farm) params.farm = farm;
    if (employee && !isEmployee) params.employee = employee;
    if (month) params.month = month;
    setReport(await att.collectionAction("report", params));
  };

  // Report rows are per-employee monthly summaries (no record id), so resolve the
  // employee's id from the loaded employees list by name.
  const findEmpId = (name) => employees.find((e) => e.name === name)?.id;

  // Edit → open this employee's real day-by-day records on the Attendance page,
  // where each record can be edited/deleted individually.
  const openRecords = (row) => {
    const id = findEmpId(row.employee);
    navigate("/attendance", { state: { employeeId: id ? String(id) : "", employeeName: row.employee } });
  };

  const periodLabel = () => {
    const m = MONTHS.find((mm) => String(mm.value) === String(month));
    return month && m ? `${m.label} ${year}` : `${year}`;
  };

  // Delete → remove ALL of this employee's attendance for the selected month/year.
  // Destructive: gated to super admin + explicit confirmation with the record count.
  const deleteMonth = async (row) => {
    const empId = findEmpId(row.employee);
    if (!empId) {
      window.alert(t("attendanceReports.empNotFound", "Could not resolve this employee. Please reload and try again."));
      return;
    }
    try {
      setDeletingEmp(row.employee);
      const d = await att.list({ employee: empId, page_size: 1000 });
      const recs = Array.isArray(d) ? d : d.results || [];
      const y = Number(year);
      const m = month ? Number(month) : null;
      // Filter by the report's period using the raw date string (avoids timezone shifts).
      const scoped = recs.filter((r) => {
        if (!r.date) return false;
        const [ry, rm] = String(r.date).split("-").map(Number);
        if (ry !== y) return false;
        if (m && rm !== m) return false;
        return true;
      });
      if (scoped.length === 0) {
        window.alert(t("attendanceReports.noRecordsToDelete", "No attendance records to delete for this employee in the selected period."));
        return;
      }
      const ok = window.confirm(
        t("attendanceReports.confirmDeleteMonth", {
          count: scoped.length,
          name: row.employee,
          period: periodLabel(),
          defaultValue: `This will permanently delete ${scoped.length} attendance record(s) for ${row.employee} (${periodLabel()}). This cannot be undone. Continue?`,
        })
      );
      if (!ok) return;
      for (const r of scoped) {
        await att.remove(r.id);
      }
      await run();
    } catch (e) {
      window.alert(t("attendanceReports.deleteFailed", "Failed to delete attendance records."));
    } finally {
      setDeletingEmp(null);
    }
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
        { key: "farm_name", header: t("header.farm") },
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
          {!isEmployee && (
            <div className="min-w-[180px]">
              <Select label={t("header.employee")} value={employee} onChange={(e) => setEmployee(e.target.value)}>
                <option value="">{t("common.allEmployees")}</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </div>
          )}
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
            { key: "farm_name", header: t("header.farm"), render: (r) => r.farm_name || "—" },
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
            {
              key: "_actions",
              header: t("common.actions"),
              render: (r) => (
                <div className="flex gap-1">
                  <button
                    onClick={() => openRecords(r)}
                    className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                    title={t("common.edit")}
                  >
                    <Pencil size={15} />
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => deleteMonth(r)}
                      disabled={deletingEmp === r.employee}
                      className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                      title={t("common.delete")}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
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
