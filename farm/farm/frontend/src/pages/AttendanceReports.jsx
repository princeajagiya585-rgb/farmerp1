import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { FileBarChart, Download, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { api, resource } from "../lib/api";
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
  const [selected, setSelected] = useState(new Set()); // ticked row ids (= employee ids)
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // In-page editing of the monthly totals (opened from the "Edit" action) — no navigation.
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null); // the report row being edited
  // Absent is not edited directly — it is auto-derived from the days in the period.
  const [editForm, setEditForm] = useState({ present: 0, half_day: 0, leave: 0 });
  const [savingRow, setSavingRow] = useState(false);
  const [farms, setFarms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [farm, setFarm] = useState("");
  const [employee, setEmployee] = useState("");
  // Default to the current (real-time) month so the page opens on this month's
  // report rather than the whole-year "All Months" view.
  const [month, setMonth] = useState(new Date().getMonth() + 1);
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
    const data = await att.collectionAction("report", params);
    // The Table keys selection off row.id, and report rows are per-employee
    // summaries rather than records — so the employee id doubles as the row id.
    data.rows = (data.rows || []).map((r) => ({ ...r, id: r.employee_id }));
    setReport(data);
    setSelected(new Set()); // a new period invalidates the old selection
  };

  // Report rows carry their employee id. Older responses didn't, so fall back to
  // matching on the display name — that lookup is unreliable (the employees list
  // is farm-scoped while the report is not, and names are not unique), which is
  // exactly why the id is now sent.
  const findEmpId = (row) =>
    row.employee_id || employees.find((e) => e.name === row.employee)?.id;

  // Edit → open a small form on THIS page to edit only the monthly totals
  // (Present / Half Day / Absent / Leave). No navigation.
  const openEdit = (row) => {
    setEditRow(row);
    setEditForm({
      present: Number(row.present) || 0,
      half_day: Number(row.half_day) || 0,
      leave: Number(row.leave) || 0,
    });
    setEditOpen(true);
  };

  // Total days for the selected period. With a month picked, this is the exact
  // number of days in that month (28/29/30/31). Without a month (whole year /
  // all months), fall back to the row's own total so that view keeps working.
  const daysInPeriod = () => {
    if (month) return new Date(Number(year), Number(month), 0).getDate();
    if (editRow) {
      return (
        (Number(editRow.present) || 0) +
        (Number(editRow.half_day) || 0) +
        (Number(editRow.absent) || 0) +
        (Number(editRow.leave) || 0)
      );
    }
    return 0;
  };

  // Absent = days in the period − everything else, clamped at 0. Auto-generated,
  // never entered by hand.
  const computedAbsent = () =>
    Math.max(
      0,
      daysInPeriod() -
        ((Number(editForm.present) || 0) + (Number(editForm.half_day) || 0) + (Number(editForm.leave) || 0))
    );

  const closeEdit = () => {
    setEditOpen(false);
    setEditRow(null);
  };

  // Save the edited totals as a manual override for this employee + period.
  const saveEdit = async () => {
    if (!editRow) return;
    const empId = findEmpId(editRow);
    if (!empId) {
      window.alert(t("attendanceReports.empNotFound", "Could not resolve this employee. Please reload and try again."));
      return;
    }
    setSavingRow(true);
    try {
      await api.post("/workforce/attendance/report_override/", {
        employee: empId,
        year: Number(year),
        month: month ? Number(month) : null,
        present: Number(editForm.present) || 0,
        half_day: Number(editForm.half_day) || 0,
        absent: computedAbsent(),
        leave: Number(editForm.leave) || 0,
      });
      closeEdit();
      await run(); // refresh the report so the edited totals show
    } catch (e) {
      window.alert(t("attendanceReports.updateFailed", "Failed to save attendance totals."));
    } finally {
      setSavingRow(false);
    }
  };

  const periodLabel = () => {
    const m = MONTHS.find((mm) => String(mm.value) === String(month));
    return month && m ? `${m.label} ${year}` : `${year}`;
  };

  // The attendance records belonging to one report row, narrowed to the period
  // the report is showing. Shared by the single-row and bulk delete paths.
  const recordsForRow = async (row) => {
    const empId = findEmpId(row);
    if (!empId) return null; // employee could not be resolved
    const d = await att.list({ employee: empId, page_size: 1000 });
    const recs = Array.isArray(d) ? d : d.results || [];
    const y = Number(year);
    const m = month ? Number(month) : null;
    // Filter by the report's period using the raw date string (avoids timezone shifts).
    return recs.filter((r) => {
      if (!r.date) return false;
      const [ry, rm] = String(r.date).split("-").map(Number);
      if (ry !== y) return false;
      if (m && rm !== m) return false;
      return true;
    });
  };

  // Delete → remove ALL of this employee's attendance for the selected month/year.
  // Destructive: gated to super admin + explicit confirmation with the record count.
  const deleteMonth = async (row) => {
    try {
      setDeletingEmp(row.employee);
      const scoped = await recordsForRow(row);
      if (scoped === null) {
        window.alert(t("attendanceReports.empNotFound", "Could not resolve this employee. Please reload and try again."));
        return;
      }
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

  // Bulk delete — every attendance record, in the selected period, for all
  // ticked employees. One confirmation covering the whole batch.
  const deleteSelected = async () => {
    const rows = (report?.rows || []).filter((r) => selected.has(r.id));
    if (rows.length === 0) return;
    setBulkDeleting(true);
    try {
      const perRow = [];
      for (const row of rows) {
        const recs = await recordsForRow(row);
        if (recs && recs.length) perRow.push({ row, recs });
      }
      const total = perRow.reduce((n, x) => n + x.recs.length, 0);
      if (total === 0) {
        window.alert(t("attendanceReports.noRecordsToDelete", "No attendance records to delete for this employee in the selected period."));
        return;
      }
      const ok = window.confirm(
        t("attendanceReports.confirmDeleteSelected", {
          count: total,
          people: perRow.length,
          period: periodLabel(),
          defaultValue: `This will permanently delete ${total} attendance record(s) across ${perRow.length} employee(s) for ${periodLabel()}. This cannot be undone. Continue?`,
        })
      );
      if (!ok) return;
      let failed = 0;
      for (const { recs } of perRow) {
        for (const r of recs) {
          // One bad record must not abandon the rest of the batch.
          try {
            await att.remove(r.id);
          } catch {
            failed += 1;
          }
        }
      }
      setSelected(new Set());
      await run();
      if (failed) {
        window.alert(
          t("attendanceReports.deletePartial", {
            failed,
            defaultValue: `${failed} record(s) could not be deleted. The rest were removed.`,
          })
        );
      }
    } catch (e) {
      window.alert(t("attendanceReports.deleteFailed", "Failed to delete attendance records."));
    } finally {
      setBulkDeleting(false);
    }
  };

  const reportRows = report?.rows || [];
  const allSelected = reportRows.length > 0 && selected.size === reportRows.length;

  const toggleRow = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === reportRows.length ? new Set() : new Set(reportRows.map((r) => r.id))));

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
        {canDelete && selected.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
            <span className="text-sm font-medium text-red-800">
              {t("attendanceReports.selectedCount", {
                count: selected.size,
                defaultValue: `${selected.size} employee(s) selected`,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setSelected(new Set())} disabled={bulkDeleting}>
                {t("common.cancel")}
              </Button>
              <button
                onClick={deleteSelected}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {t("attendanceReports.deleteSelected", "Delete selected")}
              </button>
            </div>
          </div>
        )}
        <Table
          selectable={canDelete}
          selectedIds={selected}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
          allSelected={allSelected}
          empty={t("attendanceReports.noAttendance")}
          columns={[
            { key: "employee", header: t("header.employee") },
            { key: "farm_name", header: t("header.farm"), render: (r) => r.farm_name || "—" },
            { key: "present", header: t("header.present") },
            { key: "half_day", header: t("header.halfDay") },
            { key: "absent", header: t("header.absent") },
            { key: "leave", header: t("header.leave") },
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
                    onClick={() => openEdit(r)}
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
          rows={reportRows}
        />
        {report?.count > 0 && (
          <p className="mt-3 text-sm text-gray-500">{t("attendanceReports.workersSummarized", { count: report.count })}</p>
        )}
      </Card>

      {editOpen && editRow && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <h3 className="text-lg font-semibold text-gray-800">
                {`${editRow.employee || ""} · ${periodLabel()}`}
              </h3>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 p-5">
              {[
                { key: "present", label: t("header.present") },
                { key: "half_day", label: t("header.halfDay") },
                { key: "absent", label: t("header.absent") },
                { key: "leave", label: t("header.leave") },
              ].map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{f.label}</label>
                  {f.key === "absent" ? (
                    <>
                      <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                        {computedAbsent()}
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {t("attendanceReports.absentAuto", {
                          days: daysInPeriod(),
                          defaultValue: "Auto ({{days}} days − present/half/leave)",
                        })}
                      </p>
                    </>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editForm[f.key]}
                      onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 border-t p-5">
              <Button variant="secondary" onClick={closeEdit} disabled={savingRow}>
                {t("common.cancel")}
              </Button>
              <Button onClick={saveEdit} disabled={savingRow}>
                {savingRow ? (
                  <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {t("attendance.saving")}</span>
                ) : (
                  t("attendance.saveChanges")
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
