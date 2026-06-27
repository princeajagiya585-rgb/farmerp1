import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, MapPin, Check, X, LogIn, LogOut, Clock, Navigation, Camera, Loader2, Pencil, Trash2 } from "lucide-react";
import { api, resource, toFormData } from "../lib/api";
import { Badge, Button, Card, PageHeader, Table, Select, ToastContainer, useToast } from "../components/ui";
import { exportExcel } from "../lib/export";
import { useAuth } from "../context/AuthContext";

const repo = resource("workforce/attendance");
const empRepo = resource("workforce/employees");
const pingRepo = resource("gps/pings");

const getLocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

const statusColor = { PRESENT: "green", ABSENT: "red", HALF_DAY: "yellow", LEAVE: "blue" };
const apprColor = { PENDING: "yellow", APPROVED: "green", REJECTED: "red" };
const statusLabelMap = { PRESENT: "present", ABSENT: "absent", HALF_DAY: "halfDay", LEAVE: "leave" };
const apprLabelMap = { PENDING: "pendingOption", APPROVED: "approvedOption", REJECTED: "rejectedOption" };

const TODAY = new Date().toISOString().slice(0, 10);

export default function Attendance() {
  const { t } = useTranslation();
  const { user: currentUser, hasRole } = useAuth();
  const isEmployee = currentUser?.role === "EMPLOYEE";
  const canApprove = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const canDelete = hasRole("SUPER_ADMIN"); // only super admin may delete
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [myProfile, setMyProfile] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [empId, setEmpId] = useState("");
  const [msg, setMsg] = useState("");
  const [toasts, addToast, removeToast] = useToast();
  const [actionLoading, setActionLoading] = useState(false);
  const [checkinLoading, setCheckinLoading] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saveEditLoading, setSaveEditLoading] = useState(false);
  const [filters, setFilters] = useState({
    employee: "",
    date_from: "",
    date_to: "",
    status: "",
    approval_status: ""
  });
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkInTarget, setCheckInTarget] = useState(null);
  const [checkInPhoto, setCheckInPhoto] = useState(null);
  const [checkInPreview, setCheckInPreview] = useState(null);
  const [checkInPos, setCheckInPos] = useState(null);
  const [posLoading, setPosLoading] = useState(false);
  const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
  const [checkOutTarget, setCheckOutTarget] = useState(null);
  const [checkOutPhoto, setCheckOutPhoto] = useState(null);
  const [checkOutPreview, setCheckOutPreview] = useState(null);
  const [checkOutPos, setCheckOutPos] = useState(null);

  const load = () => {
    const params = { page_size: 50 };
    if (filters.employee) params.employee = filters.employee;
    if (filters.date_from) params.date_after = filters.date_from;
    if (filters.date_to) params.date_before = filters.date_to;
    if (filters.status) params.status = filters.status;
    if (filters.approval_status) params.approval_status = filters.approval_status;
    return repo.list(params).then((d) => {
      const data = Array.isArray(d) ? d : d.results || [];
      setRows(data);
    });
  };

  useEffect(() => {
    load();
    empRepo.list({ page_size: 200 }).then((d) => {
      const all = d.results || d;
      setEmployees(all);
      if (currentUser?.id) {
        const profile = all.find((e) => String(e.user) === String(currentUser.id));
        if (profile) {
          setMyProfile(profile);
          setEmpId(String(profile.id));
        }
      }
    });
  }, [currentUser]);

  useEffect(() => {
    if (!myProfile) return;
    repo.list({ employee: myProfile.id, date: TODAY, page_size: 1 }).then((d) => {
      const list = Array.isArray(d) ? d : d.results || [];
      setTodayAttendance(list[0] || null);
    }).catch(() => {});
  }, [myProfile, rows]);

  const openCheckInModal = async (emp) => {
    setCheckInTarget(emp);
    setCheckInPhoto(null);
    setCheckInPreview(null);
    setCheckInPos(null);
    setMsg("");
    setCheckInModalOpen(true);
    setPosLoading(true);
    const loc = await getLocation();
    setCheckInPos(loc && loc.lat != null ? loc : null);
    setPosLoading(false);
  };

  const handleCheckInPhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCheckInPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setCheckInPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const submitCheckIn = async () => {
    if (!checkInTarget) return;
    setActionLoading(true);
    setMsg("");
    let loc = checkInPos || (await getLocation());
    try {
      const payload = {
        employee: checkInTarget.id,
        farm: checkInTarget.farm,
        check_in_lat: loc?.lat,
        check_in_lng: loc?.lng,
      };
      const body = checkInPhoto ? toFormData({ ...payload, check_in_photo: checkInPhoto }) : payload;
      await api.post("/workforce/attendance/check_in/", body);
      addToast(t("attendance.checkinSuccess", { name: checkInTarget.name || t("common.employee") }), "success");
      setCheckInModalOpen(false);
      load();
      if (myProfile && checkInTarget.id === myProfile.id) {
        repo.list({ employee: myProfile.id, date: TODAY }).then((d) => {
          const list = Array.isArray(d) ? d : d.results || [];
          setTodayAttendance(list[0] || null);
        }).catch(() => {});
      }
    } catch (e) {
      const detail = e.response?.data?.detail || t("common.checkInFailed");
      setMsg(detail);
      addToast(detail, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const openCheckOutModal = async (row) => {
    setCheckOutTarget(row);
    setCheckOutPhoto(null);
    setCheckOutPreview(null);
    setCheckOutPos(null);
    setMsg("");
    setCheckOutModalOpen(true);
    setPosLoading(true);
    const loc = await getLocation();
    setCheckOutPos(loc && loc.lat != null ? loc : null);
    setPosLoading(false);
  };

  const handleCheckOutPhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCheckOutPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setCheckOutPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const submitCheckOut = async () => {
    if (!checkOutTarget) return;
    setActionLoading(true);
    setMsg("");
    let loc = checkOutPos || (await getLocation());
    try {
      const payload = {
        check_out_lat: loc?.lat,
        check_out_lng: loc?.lng,
      };
      const body = checkOutPhoto ? toFormData({ ...payload, check_out_photo: checkOutPhoto }) : payload;
      await repo.action(checkOutTarget.id, "check_out", body);
      addToast(t("attendance.checkoutSuccess", { name: checkOutTarget.employee_name || t("common.employee") }), "success");
      setCheckOutModalOpen(false);
      load();
      if (myProfile && checkOutTarget.employee === myProfile.id) {
        repo.list({ employee: myProfile.id, date: TODAY }).then((d) => {
          const list = Array.isArray(d) ? d : d.results || [];
          setTodayAttendance(list[0] || null);
        }).catch(() => {});
      }
    } catch (e) {
      const detail = e.response?.data?.detail || t("common.checkOutFailed");
      setMsg(detail);
      addToast(detail, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const approve = async (row) => {
    await repo.action(row.id, "approve");
    load();
  };

  const reject = async (row) => {
    await repo.action(row.id, "reject");
    load();
  };

  const openEdit = (row) => {
    setEditRow(row);
    setEditForm({
      status: row.status,
      approval_status: row.approval_status,
      check_in_time: row.check_in_time,
      check_out_time: row.check_out_time,
      remarks: row.remarks || ""
    });
    setEditModalOpen(true);
  };

  const deleteRow = async (row) => {
    if (window.confirm(t("attendance.confirmDelete"))) {
      try {
        await repo.remove(row.id);
        load();
        addToast(t("attendance.deleted"), "success");
      } catch (e) {
        addToast(t("attendance.deleteFailed"), "error");
      }
    }
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSaveEditLoading(true);
    try {
      await repo.update(editRow.id, editForm);
      setEditModalOpen(false);
      load();
      addToast(t("attendance.updated"), "success");
    } catch (e) {
      addToast(t("attendance.updateFailed"), "error");
    } finally {
      setSaveEditLoading(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <PageHeader
        title={t("attendance.titlePg")}
        subtitle={t("attendance.subtitlePg")}
        action={
          rows.length > 0 && (
            <Button variant="secondary" onClick={() => exportExcel(rows, [
              { key: "employee_name", header: t("attendance.employeeName") },
              { key: "date", header: t("attendance.date") },
              { key: "check_in_time", header: t("attendance.checkIn") },
              { key: "check_out_time", header: t("attendance.checkOut") },
              { key: "check_in_lat", header: t("header.inLat") },
              { key: "check_in_lng", header: t("header.inLng") },
              { key: "check_out_lat", header: t("header.outLat") },
              { key: "check_out_lng", header: t("header.outLng") },
              { key: "status", header: t("attendance.statusLabel") },
              { key: "approval_status", header: t("attendance.approval") }
            ], "attendance.xlsx", "Attendance")}>
              <Download size={15} /> {t("common.excel")}
            </Button>
          )
        }
      />

      {currentUser && (
        <Card className="mb-5 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-full ${
                todayAttendance?.check_in_time
                  ? "bg-green-100 text-green-600"
                  : "bg-gray-100 text-gray-400"
              }`}>
                {todayAttendance?.check_in_time ? (
                  <LogIn size={24} />
                ) : (
                  <Clock size={24} />
                )}
              </div>
              <div>
                <p className="text-sm text-gray-500">{t("attendance.today")}{today}</p>
                <p className="text-lg font-bold text-gray-800">
                  {myProfile?.name || currentUser?.first_name || currentUser?.username || t("common.employee")}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  {todayAttendance?.check_in_time ? (
                    <>
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <LogIn size={12} /> {t("attendance.in")}: {fmt(todayAttendance.check_in_time)}
                      </span>
                      {todayAttendance.check_out_time ? (
                        <span className="flex items-center gap-1 text-xs text-blue-600">
                          <LogOut size={12} /> {t("attendance.out")}: {fmt(todayAttendance.check_out_time)}
                        </span>
                      ) : (
                        <Badge color="green">{t("common.currentlyActive")}</Badge>
                      )}
                    </>
                  ) : (
                    <Badge color="gray">{t("common.notCheckedIn")}</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {!todayAttendance?.check_in_time && (
                <Button onClick={() => {
                  if (myProfile) {
                    openCheckInModal(myProfile);
                  } else {
                    if (empId) {
                      const emp = employees.find((e) => e.id === empId);
                      if (emp) openCheckInModal(emp);
                    } else if (employees.length) {
                      openCheckInModal(employees[0]);
                    }
                  }
                }} disabled={actionLoading || (!myProfile && !employees.length)}>
                  <Camera size={16} /> {t("attendance.checkIn")}
                </Button>
              )}
              {todayAttendance?.check_in_time && !todayAttendance?.check_out_time && (
                <Button onClick={() => openCheckOutModal(todayAttendance)} disabled={actionLoading}>
                  <LogOut size={16} /> {t("attendance.checkOut")}
                </Button>
              )}
            </div>
          </div>
          {todayAttendance?.check_in_lat && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-400 border-t border-gray-100 pt-3">
              <MapPin size={12} />
              <span>{t("attendance.checkIn")}: {Number(todayAttendance.check_in_lat).toFixed(4)}, {Number(todayAttendance.check_in_lng).toFixed(4)}</span>
              {todayAttendance.location_name && (
                <span className="text-gray-500 truncate max-w-[300px]">· {todayAttendance.location_name}</span>
              )}
              <a
                href={`https://www.google.com/maps?q=${todayAttendance.check_in_lat},${todayAttendance.check_in_lng}`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-brand-600 hover:text-brand-700"
              >
                <Navigation size={12} /> {t("common.view")}
              </a>
            </div>
          )}
        </Card>
      )}

      {!isEmployee && (
        <Card title={t("attendance.quickCheckIn")} className="mb-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px]">
              <Select label={t("attendance.employee")} value={empId} onChange={(e) => setEmpId(e.target.value)}>
                <option value="">{t("attendance.selectEmployee")}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              onClick={() => {
                const emp = employees.find((e) => e.id === empId);
                if (!emp) return setMsg(t("common.selectEmployeeFirst"));
                openCheckInModal(emp);
              }}
              disabled={actionLoading}
            >
              <Camera size={16} /> {t("attendance.gpsCheckIn")}
            </Button>
            {msg && <span className="text-sm text-gray-500">{msg}</span>}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            {t("attendance.browserInfo")}
          </p>
        </Card>
      )}

      <Card>
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg">
          {!isEmployee && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("attendance.employee")}</label>
              <select
                value={filters.employee}
                onChange={(e) => setFilters({ ...filters, employee: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                <option value="">{t("common.allEmployees")}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("common.fromDate")}</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("common.toDate")}</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("attendance.statusLabel")}</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              <option value="">{t("attendance.allStatus")}</option>
              <option value="PRESENT">{t("attendance.present")}</option>
              <option value="ABSENT">{t("attendance.absent")}</option>
              <option value="HALF_DAY">{t("attendance.halfDay")}</option>
              <option value="LEAVE">{t("attendance.leave")}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("attendance.approvalStatus")}</label>
            <select
              value={filters.approval_status}
              onChange={(e) => setFilters({ ...filters, approval_status: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              <option value="">{t("attendance.allApproval")}</option>
              <option value="PENDING">{t("common.pendingApproval")}</option>
              <option value="APPROVED">{t("common.approved")}</option>
              <option value="REJECTED">{t("common.rejected")}</option>
            </select>
          </div>
        </div>
        <div className="mb-4 flex gap-2 px-4">
          <Button onClick={load}>{t("common.applyFilters")}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setFilters({
                employee: "",
                date_from: "",
                date_to: "",
                status: "",
                approval_status: ""
              });
              load();
            }}
          >
            {t("common.reset")}
          </Button>
        </div>

        <Table
          columns={[
            { key: "employee_name", header: t("attendance.employeeName"), render: (r) => r.employee_name || r.employee },
            { key: "date", header: t("attendance.date") },
            { key: "check_in_time", header: t("attendance.in"), render: (r) => fmt(r.check_in_time) },
            { key: "check_out_time", header: t("attendance.out"), render: (r) => fmt(r.check_out_time) },
            {
              key: "check_in_coords",
              header: t("attendance.gpsIn"),
              render: (r) =>
                r.check_in_lat ? (
                  <span className="font-mono text-xs">
                    {Number(r.check_in_lat).toFixed(4)}, {Number(r.check_in_lng).toFixed(4)}
                  </span>
                ) : (
                  "—"
                ),
            },
            {
              key: "status",
              header: t("attendance.statusLabel"),
              render: (r) => <Badge color={statusColor[r.status]}>{t(`attendance.${statusLabelMap[r.status] || r.status}`)}</Badge>,
            },
            {
              key: "approval_status",
              header: t("attendance.approval"),
              render: (r) => <Badge color={apprColor[r.approval_status]}>{t(`attendance.${apprLabelMap[r.approval_status] || r.approval_status}`)}</Badge>,
            },
            {
              key: "_a",
              header: t("common.actions"),
              render: (r) => (
                <div className="flex gap-1">
                  {!isEmployee && !r.check_in_time && r.date === TODAY && (
                    <button
                      onClick={() => {
                        const emp = employees.find((e) => e.id === r.employee) || { id: r.employee, name: r.employee_name };
                        openCheckInModal(emp);
                      }}
                      disabled={checkinLoading === r.employee}
                      className="rounded p-1.5 text-green-600 hover:bg-green-50"
                      title={t("common.checkIn")}
                    >
                      <Camera size={15} />
                    </button>
                  )}
                  {r.check_in_lat && (
                    <a
                      href={`https://www.google.com/maps?q=${r.check_in_lat},${r.check_in_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                      title={t("common.viewOnMap")}
                    >
                      <Navigation size={15} />
                    </a>
                  )}
                  {r.check_in_photo && (
                    <a
                      href={r.check_in_photo}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded p-1.5 text-green-500 hover:bg-green-50"
                      title={t("common.viewPhoto")}
                    >
                      <Camera size={15} />
                    </a>
                  )}
                  {r.check_out_photo && (
                    <a
                      href={r.check_out_photo}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded p-1.5 text-blue-500 hover:bg-blue-50"
                      title={t("common.viewPhoto")}
                    >
                      <Camera size={15} />
                    </a>
                  )}
                  {!r.check_out_time && r.check_in_time && (
                    <button onClick={() => openCheckOutModal(r)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title={t("common.checkOut")} disabled={actionLoading}>
                      <LogOut size={15} />
                    </button>
                  )}
                  {canApprove && r.approval_status === "PENDING" && (
                    <>
                      <button onClick={() => approve(r)} className="rounded p-1.5 text-green-600 hover:bg-green-50" title={t("common.approve")}>
                        <Check size={15} />
                      </button>
                      <button onClick={() => reject(r)} className="rounded p-1.5 text-red-600 hover:bg-red-50" title={t("common.reject")}>
                        <X size={15} />
                      </button>
                    </>
                  )}
                  {!isEmployee && (
                    <>
                      <button onClick={() => openEdit(r)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title={t("common.edit")}>
                        <Pencil size={15} />
                      </button>
                      {canDelete && (
                        <button onClick={() => deleteRow(r)} className="rounded p-1.5 text-red-600 hover:bg-red-50" title={t("common.delete")}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      </Card>

      {checkInModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <h3 className="text-lg font-semibold text-gray-800">
                {t("attendance.checkIn")}{checkInTarget?.name ? ` · ${checkInTarget.name}` : ""}
              </h3>
              <button onClick={() => setCheckInModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {posLoading ? (
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                <Loader2 size={16} className="animate-spin text-brand-600" /> {t("common.gettingLocation")}
                </div>
              ) : checkInPos ? (
                <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-3">
                  <MapPin size={16} className="mt-0.5 text-brand-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t("common.currentLocation")}</p>
                    <p className="text-xs text-gray-600">
                      {checkInPos.lat.toFixed(6)}, {checkInPos.lng.toFixed(6)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 ring-1 ring-amber-200">
                  {t("common.locationUnavailable")}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">{t("common.checkInPhoto")}</label>
                {checkInPreview ? (
                  <div className="relative">
                    <img src={checkInPreview} alt="Preview" className="h-40 w-full rounded-lg object-cover" />
                    <button
                      onClick={() => { setCheckInPhoto(null); setCheckInPreview(null); }}
                      className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100">
                    <Camera size={24} className="mb-2 text-gray-400" />
                    <span className="text-sm text-gray-500">{t("common.clickPhoto")}</span>
                    <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleCheckInPhoto} />
                  </label>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t p-5">
              <Button variant="secondary" onClick={() => setCheckInModalOpen(false)} disabled={actionLoading}>
                {t("common.cancel")}
              </Button>
              <Button onClick={submitCheckIn} disabled={actionLoading}>
                {actionLoading ? (
                  <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {t("common.checkingIn")}</span>
                ) : (
                  <><LogIn size={16} /> {t("common.confirmCheckIn")}</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && editRow && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <h3 className="text-lg font-semibold text-gray-800">{t("common.editAttendance")}</h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("attendance.statusLabel")}</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("attendance.approvalStatus")}</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("attendance.checkInTime")}</label>
                <input
                  type="datetime-local"
                  value={
                    editForm.check_in_time
                      ? new Date(editForm.check_in_time).toISOString().slice(0, 16)
                      : ""
                  }
                  onChange={(e) => setEditForm({ ...editForm, check_in_time: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("attendance.checkOutTime")}</label>
                <input
                  type="datetime-local"
                  value={
                    editForm.check_out_time
                      ? new Date(editForm.check_out_time).toISOString().slice(0, 16)
                      : ""
                  }
                  onChange={(e) => setEditForm({ ...editForm, check_out_time: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("attendance.remarksLabel")}</label>
                <textarea
                  value={editForm.remarks}
                  onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t p-5">
              <Button
                variant="secondary"
                onClick={() => setEditModalOpen(false)}
                disabled={saveEditLoading}
              >
                {t("attendance.cancel")}
              </Button>
              <Button onClick={saveEdit} disabled={saveEditLoading}>
                {saveEditLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    {t("attendance.saving")}
                  </span>
                ) : (
                  t("attendance.saveChanges")
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {checkOutModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <h3 className="text-lg font-semibold text-gray-800">
                {t("attendance.checkOut")} {checkOutTarget?.employee_name || ""}
              </h3>
              <button onClick={() => setCheckOutModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {posLoading ? (
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                <Loader2 size={16} className="animate-spin text-brand-600" /> {t("common.gettingLocation")}
                </div>
              ) : checkOutPos ? (
                <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-3">
                  <MapPin size={16} className="mt-0.5 text-brand-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t("common.currentLocation")}</p>
                    <p className="text-xs text-gray-600">
                      {checkOutPos.lat.toFixed(6)}, {checkOutPos.lng.toFixed(6)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 ring-1 ring-amber-200">
                  {t("common.locationUnavailable")}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">{t("common.checkOutPhoto")}</label>
                {checkOutPreview ? (
                  <div className="relative">
                    <img src={checkOutPreview} alt="Preview" className="h-40 w-full rounded-lg object-cover" />
                    <button
                      onClick={() => { setCheckOutPhoto(null); setCheckOutPreview(null); }}
                      className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100">
                    <Camera size={24} className="mb-2 text-gray-400" />
                    <span className="text-sm text-gray-500">{t("common.clickPhoto")}</span>
                    <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleCheckOutPhoto} />
                  </label>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t p-5">
              <Button variant="secondary" onClick={() => setCheckOutModalOpen(false)} disabled={actionLoading}>
                {t("attendance.cancel")}
              </Button>
              <Button onClick={submitCheckOut} disabled={actionLoading}>
                {actionLoading ? (
                  <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {t("attendance.checkingOut")}</span>
                ) : (
                  <><LogOut size={16} /> {t("attendance.confirmCheckOut")}</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
