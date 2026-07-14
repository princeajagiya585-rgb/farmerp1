import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { FileBarChart, Download, Pencil, Trash2, X, Loader2, ArrowLeft } from "lucide-react";
import { resource } from "../lib/api";
import { Button, Card, Input, PageHeader, Select, Table } from "../components/ui";
import { exportExcel } from "../lib/export";
import { useAuth } from "../context/AuthContext";

const att = resource("workforce/attendance");
const empRepo = resource("workforce/employees");

export default function AttendanceReports() {
  const { t } = useTranslation();
  const { user, hasRole } = useAuth();
  const isEmployee = user?.role === "EMPLOYEE";
  const canDelete = hasRole("SUPER_ADMIN"); // only super admin may delete
  const [deletingEmp, setDeletingEmp] = useState(null); // employee name currently being deleted
  // In-page day-by-day editing (opened from the "Edit" action) — no navigation.
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordsRow, setRecordsRow] = useState(null); // the report row being edited
  const [records, setRecords] = useState([]); // this employee's records for the period
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [editRec, setEditRec] = useState(null); // the single record open in the edit form
  const [editForm, setEditForm] = useState({});
  const [savingRec, setSavingRec] = useState(false);
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

  // Fetch this employee's real day-by-day records, scoped to the report's
  // selected month/year, so they can be edited in place (no page change).
  const loadRecords = async (row) => {
    const empId = findEmpId(row.employee);
    if (!empId) {
      window.alert(t("attendanceReports.empNotFound", "Could not resolve this employee. Please reload and try again."));
      return;
    }
    setRecordsLoading(true);
    try {
      const d = await att.list({ employee: empId, page_size: 1000 });
      const recs = Array.isArray(d) ? d : d.results || [];
      const y = Number(year);
      const m = month ? Number(month) : null;
      // Filter by the report's period using the raw date string (avoids timezone shifts).
      const scoped = recs
        .filter((r) => {
          if (!r.date) return false;
          const [ry, rm] = String(r.date).split("-").map(Number);
          if (ry !== y) return false;
          if (m && rm !== m) return false;
          return true;
        })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      setRecords(scoped);
    } catch (e) {
      window.alert(t("attendanceReports.loadRecordsFailed", "Failed to load attendance records."));
    } finally {
      setRecordsLoading(false);
    }
  };

  // Edit → open this employee's day-by-day records in a modal on THIS page,
  // where each record can be edited individually without navigating away.
  const openRecords = async (row) => {
    setRecordsRow(row);
    setEditRec(null);
    setRecords([]);
    setRecordsOpen(true);
    await loadRecords(row);
  };

  const closeRecords = () => {
    setRecordsOpen(false);
    setRecordsRow(null);
    setEditRec(null);
    setRecords([]);
  };

  // Switch the modal to the edit form for a single record.
  const openRecordEdit = (rec) => {
    setEditRec(rec);
    setEditForm({
      status: rec.status || "PRESENT",
      approval_status: rec.approval_status || "PENDING",
      check_in_time: rec.check_in_time,
      check_out_time: rec.check_out_time,
      remarks: rec.remarks || "",
      overtime_hours: rec.overtime_hours || 0,
    });
  };

  const saveRecord = async () => {
    if (!editRec) return;
    setSavingRec(true);
    try {
      await att.update(editRec.id, editForm);
      setEditRec(null);
      // Refresh the in-modal records AND the summary report behind it.
      if (recordsRow) await loadRecords(recordsRow);
      await run();
    } catch (e) {
      window.alert(t("attendanceReports.updateFailed", "Failed to update attendance record."));
    } finally {
      setSavingRec(false);
    }
  };

  const deleteRecord = async (rec) => {
    if (!window.confirm(t("attendanceReports.confirmDeleteRecord", "Delete this attendance record? This cannot be undone."))) return;
    try {
      await att.remove(rec.id);
      if (recordsRow) await loadRecords(recordsRow);
      await run();
    } catch (e) {
      window.alert(t("attendanceReports.deleteFailed", "Failed to delete attendance records."));
    }
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

      {recordsOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
                {editRec && (
                  <button onClick={() => setEditRec(null)} className="text-gray-400 hover:text-gray-600" title={t("common.back", "Back")}>
                    <ArrowLeft size={18} />
                  </button>
                )}
                {editRec
                  ? t("common.editAttendance")
                  : `${recordsRow?.employee || ""} · ${periodLabel()}`}
              </h3>
              <button onClick={closeRecords} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Edit form for a single record */}
            {editRec ? (
              <>
                <div className="space-y-4 p-5">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t("attendance.statusLabel")}</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    >
                      <option value="PRESENT">{t("attendance.presentOption")}</option>
                      <option value="ABSENT">{t("attendance.absentOption")}</option>
                      <option value="HALF_DAY">{t("attendance.halfDayOption")}</option>
                      <option value="LEAVE">{t("attendance.leaveOption")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t("attendance.approvalStatus")}</label>
                    <select
                      value={editForm.approval_status}
                      onChange={(e) => setEditForm({ ...editForm, approval_status: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    >
                      <option value="PENDING">{t("attendance.pendingOption")}</option>
                      <option value="APPROVED">{t("attendance.approvedOption")}</option>
                      <option value="REJECTED">{t("attendance.rejectedOption")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t("attendance.checkInTime")}</label>
                    <input
                      type="datetime-local"
                      value={toLocalInput(editForm.check_in_time)}
                      onChange={(e) => setEditForm({ ...editForm, check_in_time: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t("attendance.checkOutTime")}</label>
                    <input
                      type="datetime-local"
                      value={toLocalInput(editForm.check_out_time)}
                      onChange={(e) => setEditForm({ ...editForm, check_out_time: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t("header.otHrs")}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.overtime_hours}
                      onChange={(e) => setEditForm({ ...editForm, overtime_hours: Number(e.target.value) })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t("attendance.remarksLabel")}</label>
                    <textarea
                      value={editForm.remarks}
                      onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 border-t p-5">
                  <Button variant="secondary" onClick={() => setEditRec(null)} disabled={savingRec}>
                    {t("common.cancel")}
                  </Button>
                  <Button onClick={saveRecord} disabled={savingRec}>
                    {savingRec ? (
                      <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {t("attendance.saving")}</span>
                    ) : (
                      t("attendance.saveChanges")
                    )}
                  </Button>
                </div>
              </>
            ) : (
              /* List of this employee's day-by-day records for the period */
              <div className="max-h-[70vh] overflow-y-auto p-5">
                {recordsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
                    <Loader2 size={16} className="animate-spin text-brand-600" /> {t("common.loading", "Loading…")}
                  </div>
                ) : records.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-500">{t("attendanceReports.noAttendance")}</p>
                ) : (
                  <Table
                    columns={[
                      { key: "date", header: t("attendance.date") },
                      { key: "check_in_time", header: t("attendance.in"), render: (r) => fmt(r.check_in_time) },
                      { key: "check_out_time", header: t("attendance.out"), render: (r) => fmt(r.check_out_time) },
                      { key: "status", header: t("attendance.statusLabel"), render: (r) => t(`attendance.${STATUS_KEY[r.status] || "pending"}`) },
                      { key: "overtime_hours", header: t("header.otHrs"), render: (r) => r.overtime_hours_formatted || r.overtime_hours || "0" },
                      {
                        key: "_actions",
                        header: t("common.actions"),
                        render: (r) => (
                          <div className="flex gap-1">
                            <button
                              onClick={() => openRecordEdit(r)}
                              className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                              title={t("common.edit")}
                            >
                              <Pencil size={15} />
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => deleteRecord(r)}
                                className="rounded p-1.5 text-red-600 hover:bg-red-50"
                                title={t("common.delete")}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        ),
                      },
                    ]}
                    rows={records}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Status code → i18n key used on the Attendance page (attendance.<key>).
const STATUS_KEY = { PRESENT: "present", ABSENT: "absent", HALF_DAY: "halfDay", LEAVE: "leave", PRESENT_DONE: "presentDone" };

// Format a datetime for <input type="datetime-local"> in LOCAL time.
function toLocalInput(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmt(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
