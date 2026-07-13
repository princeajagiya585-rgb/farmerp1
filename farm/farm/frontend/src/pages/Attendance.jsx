import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Download, MapPin, Check, X, LogIn, LogOut, Clock, Navigation, Camera, Loader2, Pencil, Trash2, Timer } from "lucide-react";
import { openMapUrl, hasValidCoords } from "../lib/maps";
import { api, resource, toFormData, normalizePhotoUrl } from "../lib/api";
import { Badge, Button, Card, PageHeader, PhotoThumb, Table, Select, ToastContainer, useToast } from "../components/ui";
import CameraCapture from "../components/CameraCapture";
import { exportExcel } from "../lib/export";
import { useAuth } from "../context/AuthContext";

const repo = resource("workforce/attendance");
const empRepo = resource("workforce/employees");

const getLocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        // Auto-detect address from GPS
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}&zoom=18&addressdetails=1`
          );
          const data = await response.json();
          if (data.display_name) loc.address = data.display_name;
        } catch (e) {
          console.log("Address lookup failed:", e);
        }
        resolve(loc);
      },
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

// Great-circle distance between two lat/lng points, in metres.
const haversineM = (lat1, lng1, lat2, lng2) => {
  const r = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lng2 - lng1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
};

// Ray-casting point-in-polygon. `polygon` is a list of [lat, lng] pairs.
const pointInPolygon = (lat, lng, polygon) => {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = Number(polygon[i][0]), xi = Number(polygon[i][1]);
    const yj = Number(polygon[j][0]), xj = Number(polygon[j][1]);
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

// Auto-pick which farm a multi-farm worker is checking into: the farm whose
// 4-corner area contains the GPS point, else the nearest farm by centre
// distance. Falls back to the worker's primary/first farm when coordinates
// aren't available. `farmsById` maps farm id → full farm record (lat/lng/geofence).
const pickBestFarm = (loc, emp, farmsById) => {
  const details = emp?.assigned_farm_details || [];
  const ids = details.map((f) => String(f.id));
  const primary = emp?.farm ? String(emp.farm) : (ids[0] || "");
  if (!loc || loc.lat == null || !ids.length) return primary;
  let best = null, bestDist = Infinity;
  for (const id of ids) {
    const f = farmsById[id];
    if (!f || f.latitude == null || f.longitude == null) continue;
    if (Array.isArray(f.geofence) && f.geofence.length >= 3 && pointInPolygon(loc.lat, loc.lng, f.geofence)) {
      return id; // inside this farm's area → definitive match
    }
    const d = haversineM(loc.lat, loc.lng, Number(f.latitude), Number(f.longitude));
    if (d < bestDist) { bestDist = d; best = id; }
  }
  return best || primary;
};

const statusColor = { PRESENT: "green", ABSENT: "red", HALF_DAY: "yellow", LEAVE: "blue", PRESENT_DONE: "purple" };
const apprColor = { PENDING: "yellow", APPROVED: "green", REJECTED: "red", FAILED: "red" };
const statusLabelMap = { PRESENT: "present", ABSENT: "absent", HALF_DAY: "halfDay", LEAVE: "leave", PRESENT_DONE: "presentDone" };
const apprLabelMap = { PENDING: "pendingOption", APPROVED: "approvedOption", REJECTED: "rejectedOption", FAILED: "failedOption" };

// Handle null/undefined status — show as Pending (no check-in yet)
function StatusBadge({ row }) {
  const { t } = useTranslation();
  if (!row.status) return <Badge color="gray">{t("attendance.pending")}</Badge>;
  return <Badge color={statusColor[row.status]}>{t(`attendance.${statusLabelMap[row.status] || row.status}`)}</Badge>;
}

const TODAY = new Date().toISOString().slice(0, 10);

// Format seconds to HH:MM:SS
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "00:00:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Calculate elapsed time in seconds from check-in time
function calculateElapsedSeconds(checkInTime) {
  if (!checkInTime) return 0;
  const checkIn = new Date(checkInTime);
  const now = new Date();
  return Math.floor((now - checkIn) / 1000);
}

export default function Attendance() {
  const { t } = useTranslation();
  const location = useLocation();
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
  const [farms, setFarms] = useState([]);
  const [filters, setFilters] = useState({
    // Pre-select an employee when arriving from the Attendance Reports "Edit" action.
    employee: location.state?.employeeId ? String(location.state.employeeId) : "",
    farm: "",
    date_from: "",
    date_to: "",
    status: "",
    approval_status: ""
  });
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkInTarget, setCheckInTarget] = useState(null);
  const [checkInPhoto, setCheckInPhoto] = useState(null);
  const [checkInPreview, setCheckInPreview] = useState(null);
  const [checkInCameraOpen, setCheckInCameraOpen] = useState(false);
  const [checkInPos, setCheckInPos] = useState(null);
  const [checkInNotes, setCheckInNotes] = useState("");
  // Which farm the worker is checking into (for multi-farm workers).
  const [checkInFarm, setCheckInFarm] = useState("");
  // Admin/manager only: optionally back-date a check-in. Blank = live (now).
  const [checkInDate, setCheckInDate] = useState("");
  const [checkInTime, setCheckInTime] = useState("");
  const [posLoading, setPosLoading] = useState(false);
  const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
  const [checkOutTarget, setCheckOutTarget] = useState(null);
  const [checkOutPhoto, setCheckOutPhoto] = useState(null);
  const [checkOutPreview, setCheckOutPreview] = useState(null);
  const [checkOutCameraOpen, setCheckOutCameraOpen] = useState(false);
  const [checkOutPos, setCheckOutPos] = useState(null);
  const [checkOutNotes, setCheckOutNotes] = useState("");
  // Timer state for live duration display
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  const load = () => {
    const params = { page_size: 50 };
    if (filters.employee) params.employee = filters.employee;
    if (filters.farm) params.farm = filters.farm;
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
    // Load farms — for the manager filter AND so the check-in flow can auto-pick
    // the farm a multi-farm worker is inside / nearest to (needs lat/lng/geofence).
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d)).catch(() => {});
  }, [currentUser, isEmployee]);

  useEffect(() => {
    if (!myProfile) return;
    // Use dedicated endpoint that returns attendance even without check-in
    api.get(`/workforce/attendance/today_status/?employee=${myProfile.id}`).then((d) => {
      setTodayAttendance(d.data?.has_attendance ? d.data : null);
    }).catch(() => {});
  }, [myProfile, rows]);

  // Timer effect - update elapsed seconds every second when checked in but not checked out
  useEffect(() => {
    if (todayAttendance?.check_in_time && !todayAttendance?.check_out_time) {
      // Initial calculation
      setElapsedSeconds(calculateElapsedSeconds(todayAttendance.check_in_time));

      // Start interval
      timerRef.current = setInterval(() => {
        setElapsedSeconds(calculateElapsedSeconds(todayAttendance.check_in_time));
      }, 1000);
    } else if (todayAttendance?.check_out_time) {
      // Calculate final duration when checked out
      const checkIn = new Date(todayAttendance.check_in_time);
      const checkOut = new Date(todayAttendance.check_out_time);
      setElapsedSeconds(Math.floor((checkOut - checkIn) / 1000));
      // Clear interval
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } else {
      // Reset when not checked in
      setElapsedSeconds(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [todayAttendance]);

  // Re-resolve my employee profile + today's attendance. Needed right after a
  // first-ever check-in: the backend links the Employee to this user during
  // check_in, so the profile (and the Check Out button) only appears after a
  // refetch.
  const refreshMyToday = async () => {
    try {
      const d = await empRepo.list({ page_size: 200 });
      const all = d.results || d;
      setEmployees(all);
      const profile = all.find((e) => String(e.user) === String(currentUser?.id));
      if (!profile) return;
      setMyProfile(profile);
      setEmpId(String(profile.id));
      // Use dedicated endpoint for today's status
      const ad = await api.get(`/workforce/attendance/today_status/?employee=${profile.id}`);
      setTodayAttendance(ad.data?.has_attendance ? ad.data : null);
    } catch {
      /* ignore */
    }
  };

  const openCheckInModal = async (emp) => {
    setCheckInTarget(emp);
    setCheckInPhoto(null);
    setCheckInPreview(null);
    setCheckInPos(null);
    setCheckInNotes("");
    // Default to the worker's primary farm (or first assigned farm).
    setCheckInFarm(emp?.farm || emp?.assigned_farm_details?.[0]?.id || "");
    setCheckInDate("");
    setCheckInTime("");
    setMsg("");
    setCheckInModalOpen(true);
    setPosLoading(true);
    const loc = await getLocation();
    setCheckInPos(loc && loc.lat != null ? loc : null);
    setPosLoading(false);
    // Auto-attribute to the farm the worker is inside / nearest to — no manual
    // farm picker. Falls back to the primary farm if GPS/coords are missing.
    if (loc && loc.lat != null) {
      const byId = {};
      farms.forEach((f) => { byId[String(f.id)] = f; });
      setCheckInFarm(pickBestFarm(loc, emp, byId));
    }
  };

  const applyCheckInPhoto = (file) => {
    if (!file) return;
    setCheckInPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setCheckInPreview(reader.result);
    reader.readAsDataURL(file);
  };
  const handleCheckInPhoto = (e) => applyCheckInPhoto(e.target.files[0]);

  const submitCheckIn = async () => {
    if (!checkInTarget) return;
    setActionLoading(true);
    setMsg("");
    let loc = checkInPos || (await getLocation());
    try {
      const payload = {
        employee: checkInTarget.id,
        farm: checkInFarm || checkInTarget.farm,
        check_in_lat: loc?.lat,
        check_in_lng: loc?.lng,
        check_in_notes: checkInNotes,
      };
      // Only admins/managers may set a custom date/time; employees are always live.
      // (The backend enforces this too — an employee's date/time is ignored.)
      if (canApprove) {
        if (checkInDate) payload.date = checkInDate;
        if (checkInTime) payload.check_in_time = checkInTime;
      }
      const body = checkInPhoto ? toFormData({ ...payload, check_in_photo: checkInPhoto }) : payload;
      await api.post("/workforce/attendance/check_in/", body);
      addToast(t("attendance.checkinSuccess", { name: checkInTarget.name || t("common.employee") }), "success");
      setCheckInModalOpen(false);
      load();
      // Refresh the "today" card so the Check Out button appears immediately —
      // also covers the first-ever check-in where the profile link is created
      // server-side during check_in.
      if (!myProfile || checkInTarget.id === myProfile.id) {
        refreshMyToday();
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
    setCheckOutNotes("");
    setMsg("");
    setCheckOutModalOpen(true);
    setPosLoading(true);
    const loc = await getLocation();
    setCheckOutPos(loc && loc.lat != null ? loc : null);
    setPosLoading(false);
  };

  const applyCheckOutPhoto = (file) => {
    if (!file) return;
    setCheckOutPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setCheckOutPreview(reader.result);
    reader.readAsDataURL(file);
  };
  const handleCheckOutPhoto = (e) => applyCheckOutPhoto(e.target.files[0]);

  const submitCheckOut = async () => {
    if (!checkOutTarget) return;
    setActionLoading(true);
    setMsg("");
    let loc = checkOutPos || (await getLocation());
    try {
      const payload = {
        check_out_lat: loc?.lat,
        check_out_lng: loc?.lng,
        check_out_notes: checkOutNotes,
      };
      const body = checkOutPhoto ? toFormData({ ...payload, check_out_photo: checkOutPhoto }) : payload;
      await repo.action(checkOutTarget.id, "check_out", body);
      addToast(t("attendance.checkoutSuccess", { name: checkOutTarget.employee_name || t("common.employee") }), "success");
      setCheckOutModalOpen(false);
      load();
      if (!myProfile || checkOutTarget.employee === myProfile.id) {
        refreshMyToday();
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
      remarks: row.remarks || "",
      overtime_hours: row.overtime_hours || 0
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
                  ? todayAttendance?.check_out_time
                    ? "bg-purple-100 text-purple-600"
                    : "bg-green-100 text-green-600"
                  : "bg-gray-100 text-gray-400"
              }`}>
                {todayAttendance?.check_in_time ? (
                  todayAttendance?.check_out_time ? (
                    <Check size={24} />
                  ) : (
                    <LogIn size={24} />
                  )
                ) : (
                  <Clock size={24} />
                )}
              </div>
              <div>
                <p className="text-sm text-gray-500">{t("attendance.today")}{today}</p>
                <p className="text-lg font-bold text-gray-800">
                  {myProfile?.name || currentUser?.first_name || currentUser?.username || t("common.employee")}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {todayAttendance?.check_in_time ? (
                    <>
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <LogIn size={12} /> {fmt(todayAttendance.check_in_time)}
                      </span>
                      {todayAttendance.check_out_time ? (
                        <span className="flex items-center gap-1 text-xs text-purple-600">
                          <LogOut size={12} /> {fmt(todayAttendance.check_out_time)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-orange-600 font-mono font-bold">
                          <Timer size={12} /> {formatDuration(elapsedSeconds)}
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge color="gray">{t("common.notCheckedIn")}</Badge>
                  )}
                  {todayAttendance?.check_in_distance != null && (
                    <Badge color={todayAttendance.geofence_status ? "green" : "red"}>
                      <MapPin size={10} /> {todayAttendance.geofence_status ? (todayAttendance.farm_name || t("gps.inFence")) : t("gps.outside")} ({Math.round(todayAttendance.check_in_distance)}m)
                    </Badge>
                  )}
                  {todayAttendance?.status && (
                    <Badge color={statusColor[todayAttendance.status]}>
                      {t(`attendance.${statusLabelMap[todayAttendance.status] || todayAttendance.status}`)}
                    </Badge>
                  )}
                  {todayAttendance?.working_hours_formatted && (
                    <span className="flex items-center gap-1 text-xs text-gray-600 font-mono">
                      <Clock size={12} /> {todayAttendance.working_hours_formatted}
                    </span>
                  )}
                  {todayAttendance?.overtime_hours_formatted && (
                    <Badge color="red">OT: {todayAttendance.overtime_hours_formatted}</Badge>
                  )}
                </div>
                {/* Show address and geofence details */}
                {todayAttendance?.check_in_address && (
                  <p className="text-xs text-gray-400 mt-1 truncate max-w-md">
                    📍 {todayAttendance.check_in_address.substring(0, 120)}
                  </p>
                )}
                {todayAttendance?.check_out_address && todayAttendance?.check_out_time && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">
                    📍 Check-out: {todayAttendance.check_out_address.substring(0, 120)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {!todayAttendance?.check_in_time && (
                <Button
                  onClick={() => {
                    if (myProfile) {
                      openCheckInModal(myProfile);
                    } else {
                      if (empId) {
                        const emp = employees.find((e) => String(e.id) === String(empId));
                        if (emp) openCheckInModal(emp);
                      } else if (employees.length) {
                        openCheckInModal(employees[0]);
                      }
                    }
                  }}
                  disabled={actionLoading || (!myProfile && !employees.length)}
                  className="bg-green-600 hover:bg-green-700 active:bg-green-800 text-white shadow-sm"
                >
                  <Camera size={16} /> {t("attendance.checkIn")}
                </Button>
              )}
              {todayAttendance?.check_in_time && !todayAttendance?.check_out_time && (
                <Button
                  onClick={() => openCheckOutModal(todayAttendance)}
                  disabled={actionLoading}
                  className="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white shadow-sm"
                >
                  <LogOut size={16} /> {t("attendance.checkOut")}
                </Button>
              )}
              {todayAttendance?.check_in_time && todayAttendance?.check_out_time && (
                <Button disabled className="bg-purple-100 text-purple-700 cursor-not-allowed shadow-sm">
                  <Check size={16} /> {t("attendance.doneAttendance", "Done Attendance")}
                </Button>
              )}
            </div>
          </div>
          {todayAttendance?.check_in_lat && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-400 border-t border-gray-100 pt-3">
              <MapPin size={12} />
              <span>{t("attendance.checkIn")}: {Number(todayAttendance.check_in_lat).toFixed(4)}, {Number(todayAttendance.check_in_lng).toFixed(4)}</span>
              {todayAttendance.location_name && (
                <span className="text-gray-500 truncate max-w-[240px]">· {todayAttendance.location_name}</span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  openMapUrl(todayAttendance.check_in_lat, todayAttendance.check_in_lng);
                }}
                className="ml-auto inline-flex items-center gap-1 text-brand-600 hover:text-brand-700"
              >
                <Navigation size={12} /> {t("common.view")}
              </button>
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
                const emp = employees.find((e) => String(e.id) === String(empId));
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
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-gray-50 rounded-lg">
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
          {!isEmployee && farms.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("header.farm")}</label>
              <select
                value={filters.farm}
                onChange={(e) => setFilters({ ...filters, farm: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                <option value="">{t("workforce.allFarms")}</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
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
                farm: "",
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
            { key: "farm_name", header: t("header.farm"), render: (r) => r.farm_name || "—" },
            { key: "date", header: t("attendance.date") },
            { key: "check_in_time", header: t("attendance.in"), render: (r) => fmt(r.check_in_time) },
            { key: "check_out_time", header: t("attendance.out"), render: (r) => fmt(r.check_out_time) },
            {
              key: "check_in_photo_url",
              header: t("header.photo"),
              render: (r) => {
                const cin = normalizePhotoUrl(r.check_in_photo_url);
                const cout = normalizePhotoUrl(r.check_out_photo_url);
                if (!cin && !cout) return "—";
                return (
                  <div className="flex items-center gap-1">
                    {cin && <PhotoThumb url={cin} alt={t("attendance.checkIn")} size={40} />}
                    {cout && <PhotoThumb url={cout} alt={t("attendance.checkOut")} size={40} />}
                  </div>
                );
              },
            },
            {
              key: "geofence_status",
              header: t("header.geofence"),
              render: (r) => {
                const checkInStatus = r.geofence_status_display || r.geofence_status;
                const checkOutStatus = r.check_out_geofence_status_display ?? r.check_out_geofence_status;
                const isInside = checkInStatus === "YES" || checkInStatus === true;
                const isOutside = checkInStatus === "NO" || checkInStatus === false;
                const outInside = checkOutStatus === "YES" || checkOutStatus === true;
                const outOutside = checkOutStatus === "NO" || checkOutStatus === false;

                // Inside the geofence → show the farm name; outside → "Outside".
                const farmLabel = r.farm_name || t("gps.inFence");
                if (isInside && outOutside) {
                  return (
                    <div className="flex items-center gap-1">
                      <Badge color="green">{farmLabel}</Badge>
                      <span className="text-xs text-gray-400">→</span>
                      <Badge color="red">{t("gps.outside")}</Badge>
                    </div>
                  );
                }
                if (isInside) return <Badge color="green">{farmLabel}</Badge>;
                if (isOutside) return <Badge color="red">{t("gps.outside")}</Badge>;
                return <span className="text-gray-400">—</span>;
              },
            },
            // Distance from the farm — how far the worker is from the farm centre.
            // Only shown to managers / super admins.
            ...(canApprove ? [{
              key: "check_in_distance",
              header: t("attendance.distance", "Distance"),
              render: (r) => {
                const d = r.check_in_distance;
                if (d == null) return <span className="text-gray-400">—</span>;
                const outside = r.geofence_status === false || r.geofence_status_display === "NO";
                return (
                  <Badge color={outside ? "red" : "green"}>
                    {outside ? t("gps.outside") : t("gps.inFence")} ({Math.round(Number(d))}m)
                  </Badge>
                );
              },
            }] : []),
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
              render: (r) => <StatusBadge row={r} />,
            },
            {
              key: "approval_status",
              header: t("attendance.approval"),
              render: (r) => {
                // Outside the farm → not approved; show "—".
                const outside = r.geofence_status === false || r.geofence_status_display === "NO";
                if (outside && r.approval_status !== "APPROVED") {
                  return <span className="text-gray-400">—</span>;
                }
                return <Badge color={apprColor[r.approval_status]}>{t(`attendance.${apprLabelMap[r.approval_status] || r.approval_status}`)}</Badge>;
              },
            },
            {
              key: "overtime_hours",
              header: t("header.otHrs"),
              render: (r) => r.overtime_hours_formatted || r.overtime_hours || "0"
            },
            {
              key: "working_hours",
              header: t("attendance.workingHours") || "Work Hours",
              render: (r) => r.working_hours_formatted || "—"
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
                  {hasValidCoords(r.check_in_lat, r.check_in_lng) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        openMapUrl(r.check_in_lat, r.check_in_lng);
                      }}
                      className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                      title={t("common.viewOnMap")}
                    >
                      <Navigation size={15} />
                    </button>
                  )}
                  {r.check_in_photo_url && (
                    <a
                      href={normalizePhotoUrl(r.check_in_photo_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded p-1.5 text-green-500 hover:bg-green-50"
                      title={t("common.viewPhoto")}
                    >
                      <Camera size={15} />
                    </a>
                  )}
                  {r.check_out_photo_url && (
                    <a
                      href={normalizePhotoUrl(r.check_out_photo_url)}
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
              {/* Multi-farm workers no longer pick a farm — the attendance is
                  auto-attributed to the farm they are inside / nearest to (by
                  GPS). Employees see nothing; managers/admins get a small
                  read-only note of the detected farm. */}
              {!isEmployee && (checkInTarget?.assigned_farm_details?.length || 0) > 1 && (
                <div className="rounded-lg bg-brand-50 p-3 ring-1 ring-brand-200">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-800">
                    <MapPin size={14} className="text-brand-600" />
                    {t("attendance.detectedFarm", "Detected farm")}:{" "}
                    <span className="font-bold">
                      {checkInTarget.assigned_farm_details.find((f) => String(f.id) === String(checkInFarm))?.name
                        || (posLoading ? t("common.gettingLocation") : "—")}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-brand-600">
                    {t("attendance.autoFarmHint", "Automatically set to the farm you are in or closest to.")}
                  </p>
                </div>
              )}
              {posLoading ? (
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                <Loader2 size={16} className="animate-spin text-brand-600" /> {t("common.gettingLocation")}
                </div>
              ) : checkInPos ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-3 rounded-lg bg-green-50 p-3 border border-green-200">
                    <MapPin size={16} className="mt-0.5 text-green-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{t("common.currentLocation")}</p>
                      <p className="text-xs text-gray-600 font-mono">
                        {checkInPos.lat.toFixed(6)}, {checkInPos.lng.toFixed(6)}
                      </p>
                      {checkInPos.accuracy != null && (
                        <p className="text-xs text-green-500">±{Math.round(checkInPos.accuracy)}m {t("common.accuracy")}</p>
                      )}
                    </div>
                  </div>
                  {checkInPos.address && (
                    <p className="text-xs text-gray-500 px-1" title={checkInPos.address}>
                      📍 {checkInPos.address.substring(0, 100)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
                  {t("common.locationUnavailable")}
                </div>
              )}

              {/* Admin/manager only: optionally back-date the attendance.
                  Employees never see this — their check-in is always live. */}
              {canApprove && (
                <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 ring-1 ring-gray-200">
                  <p className="col-span-2 text-xs text-gray-500">
                    {t("attendance.backdateHint", "Leave blank for a live check-in (now). Set a date/time to record past attendance.")}
                  </p>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">{t("attendance.date")}</label>
                    <input
                      type="date"
                      value={checkInDate}
                      max={today}
                      onChange={(e) => setCheckInDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">{t("attendance.time", "Time")}</label>
                    <input
                      type="time"
                      value={checkInTime}
                      onChange={(e) => setCheckInTime(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t("common.checkInPhoto")}{" "}
                  {canApprove
                    ? <span className="text-gray-400">({t("common.optional")})</span>
                    : <span className="text-red-500">*</span>}
                </label>
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
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setCheckInCameraOpen(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700"
                    >
                      <Camera size={18} /> {t("common.takePhoto")}
                    </button>
                    <label className="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100">
                      <span className="text-sm text-gray-500">{t("common.orChooseFile")}</span>
                      <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleCheckInPhoto} />
                    </label>
                  </div>
                )}
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700">{t("attendance.remarks")} ({t("common.optional")})</label>
                <textarea
                  value={checkInNotes}
                  onChange={(e) => setCheckInNotes(e.target.value)}
                  placeholder={t("attendance.remarksPlaceholder") || "Add any notes..."}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t p-5">
              <Button variant="secondary" onClick={() => setCheckInModalOpen(false)} disabled={actionLoading}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={submitCheckIn}
                disabled={actionLoading || !checkInPos || (!canApprove && !checkInPhoto)}
                className={!checkInPos || (!canApprove && !checkInPhoto) ? "opacity-50" : "bg-green-600 hover:bg-green-700"}
                title={!checkInPos ? "Location required" : (!canApprove && !checkInPhoto) ? "Photo required" : "Click to check in"}
              >
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
                    toLocalInput(editForm.check_in_time)
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
                    toLocalInput(editForm.check_out_time)
                  }
                  onChange={(e) => setEditForm({ ...editForm, check_out_time: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("header.otHrs")}</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.overtime_hours}
                  onChange={(e) => setEditForm({ ...editForm, overtime_hours: Number(e.target.value) })}
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
                <div className="space-y-2">
                  <div className="flex items-start gap-3 rounded-lg bg-green-50 p-3 border border-green-200">
                    <MapPin size={16} className="mt-0.5 text-green-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{t("common.currentLocation")}</p>
                      <p className="text-xs text-gray-600 font-mono">
                        {checkOutPos.lat.toFixed(6)}, {checkOutPos.lng.toFixed(6)}
                      </p>
                      {checkOutPos.accuracy != null && (
                        <p className="text-xs text-green-500">±{Math.round(checkOutPos.accuracy)}m {t("common.accuracy")}</p>
                      )}
                    </div>
                  </div>
                  {checkOutPos.address && (
                    <p className="text-xs text-gray-500 px-1" title={checkOutPos.address}>
                      📍 {checkOutPos.address.substring(0, 100)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
                  {t("common.locationUnavailable")}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t("common.checkOutPhoto")}{" "}
                  {canApprove
                    ? <span className="text-gray-400">({t("common.optional")})</span>
                    : <span className="text-red-500">*</span>}
                </label>
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
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setCheckOutCameraOpen(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700"
                    >
                      <Camera size={18} /> {t("common.takePhoto")}
                    </button>
                    <label className="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100">
                      <span className="text-sm text-gray-500">{t("common.orChooseFile")}</span>
                      <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleCheckOutPhoto} />
                    </label>
                  </div>
                )}
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700">{t("attendance.remarks")} ({t("common.optional")})</label>
                <textarea
                  value={checkOutNotes}
                  onChange={(e) => setCheckOutNotes(e.target.value)}
                  placeholder={t("attendance.remarksPlaceholder") || "Add any notes..."}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t p-5">
              <Button variant="secondary" onClick={() => setCheckOutModalOpen(false)} disabled={actionLoading}>
                {t("attendance.cancel")}
              </Button>
              <Button
                onClick={submitCheckOut}
                disabled={actionLoading || !checkOutPos || (!canApprove && !checkOutPhoto)}
                className={!checkOutPos || (!canApprove && !checkOutPhoto) ? "opacity-50" : "bg-orange-500 hover:bg-orange-600"}
                title={!checkOutPos ? "Location required" : (!canApprove && !checkOutPhoto) ? "Photo required" : "Click to check out"}
              >
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

      <CameraCapture
        open={checkInCameraOpen}
        title={t("common.checkInPhoto")}
        onClose={() => setCheckInCameraOpen(false)}
        onCapture={(file) => { applyCheckInPhoto(file); setCheckInCameraOpen(false); }}
      />
      <CameraCapture
        open={checkOutCameraOpen}
        title={t("common.checkOutPhoto")}
        onClose={() => setCheckOutCameraOpen(false)}
        onCapture={(file) => { applyCheckOutPhoto(file); setCheckOutCameraOpen(false); }}
      />
    </div>
  );
}

// Format a datetime for <input type="datetime-local"> in LOCAL time
// (toISOString() shifts to UTC, showing wrong times for IST users)
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
