import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import { Clock, Lock, Play, LogIn, Square, CheckCircle, Plus, Pencil, Trash2, Search, Filter, X, AlertTriangle, UserMinus } from "lucide-react";
import LoadingSpinner from "../components/LoadingSpinner";
import { api, resource, toFormData } from "../lib/api";
import { Badge, Button, Card, Input, Modal, MultiSelect, PhotoThumb, Select, ToastContainer, useToast } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import i18n from "../i18n";
import { roleLabels } from "../config/nav";

const sessionsRepo = resource("tasks/sessions");
const attRepo = resource("workforce/attendance");
const empRepo = resource("workforce/employees");
const usersRepo = resource("auth/users");
const farmsRepo = resource("farms");

const LANG_LABELS = { en: "English", hi: "हिन्दी", gu: "ગુજરાતી" };

const TODAY = new Date().toISOString().slice(0, 10);

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

export default function Users() {
  const { t } = useTranslation();
  const { hasRole, user: currentUser } = useAuth();
  const canManage = hasRole("SUPER_ADMIN");
  const canDelete = hasRole("SUPER_ADMIN"); // only super admin may delete
  const [activeSessions, setActiveSessions] = useState([]);
  const [stoppingId, setStoppingId] = useState(null);
  const [userEmpMap, setUserEmpMap] = useState({}); // userId → employee
  const [todayAttMap, setTodayAttMap] = useState({});  // employeeId → attendance
  const [checkinLoading, setCheckinLoading] = useState(null); // employeeId being checked in
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [farms, setFarms] = useState([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [farmFilter, setFarmFilter] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(null); // 'create' or { edit: id }
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [toasts, addToast, removeToast] = useToast();
  const [suspendConfirm, setSuspendConfirm] = useState(null); // user to suspend
  const [removeAllConfirm, setRemoveAllConfirm] = useState(false); // confirm remove all non-admin users
  const [removingAll, setRemovingAll] = useState(false);

  // Load users, farms, employees & attendance
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load users
      const usersData = await usersRepo.list({ page_size: 200 });
      setUsers(Array.isArray(usersData) ? usersData : usersData.results || []);

      // Load farms for form options
      const farmsData = await farmsRepo.list({ page_size: 200 });
      setFarms(Array.isArray(farmsData) ? farmsData : farmsData.results || []);

      // Build user → employee mapping
      const ed = await empRepo.list({ page_size: 200 });
      const allEmps = ed.results || ed || [];
      const map = {};
      allEmps.forEach((e) => {
        if (e.user) map[e.user] = e;
      });
      setUserEmpMap(map);

      // Load today's attendance
      const ad = await attRepo.list({ date: TODAY, page_size: 200 });
      const allAtt = ad.results || ad || [];
      const attMap = {};
      allAtt.forEach((a) => {
        attMap[a.employee] = a;
      });
      setTodayAttMap(attMap);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

  const doCheckIn = async (emp) => {
    if (!emp) return;
    setCheckinLoading(emp.id);
    const loc = await getLocation();
    try {
      await api.post("/workforce/attendance/check_in/", {
        employee: emp.id,
        farm: emp.farm,
        check_in_lat: loc.lat,
        check_in_lng: loc.lng,
      });
      // Refresh today's attendance
      const ad = await attRepo.list({ date: TODAY, page_size: 200 });
      const allAtt = ad.results || ad || [];
      const attMap = {};
      allAtt.forEach((a) => {
        attMap[a.employee] = a;
      });
      setTodayAttMap(attMap);
    } catch (e) {
      // ignore
    } finally {
      setCheckinLoading(null);
    }
  };

  const loadSessions = useCallback(async () => {
    try {
      const data = await sessionsRepo.list({ page_size: 100 });
      const all = Array.isArray(data) ? data : data.results || [];
      setActiveSessions(all.filter((s) => s.is_active));
    } catch {
      // ignore
    }
  }, []);

  // Fetch active sessions and tick every 120s for live counter
  // (Reduced to avoid Railway 429 rate limits. Live sessions don't need
  // sub-minute granularity — the timer counters update locally via JS.)
  useEffect(() => {
    loadSessions();
    const base = 120000;
    const jitter = Math.floor(Math.random() * base * 0.4) - Math.floor(base * 0.2); // ±20%
    const id = setInterval(loadSessions, base + jitter);
    return () => clearInterval(id);
  }, [loadSessions]);

  const forceStop = async (sessionId) => {
    setStoppingId(sessionId);
    try {
      await api.post(`/tasks/sessions/${sessionId}/force_stop/`);
      await loadSessions();
    } catch {
      // ignore
    } finally {
      setStoppingId(null);
    }
  };

  // User form handlers
  const openCreate = () => {
    setFormData({
      username: "",
      email: "",
      password: "",
      password2: "",
      first_name: "",
      last_name: "",
      role: "EMPLOYEE",
      phone: "",
      farms: [], // Multiple farms
      preferred_language: "en",
      aadhaar_number: "",
      aadhaar_photo: null,
    });
    setModalOpen({ mode: "create" });
  };

  const openEdit = (user) => {
    setFormData({
      username: user.username,
      email: user.email || "",
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      role: user.role,
      phone: user.phone || "",
      farms: Array.isArray(user.farms) ? user.farms.map(String) : [], // Multiple farms
      preferred_language: user.preferred_language || "en",
      aadhaar_number: user.aadhaar_number || "",
      aadhaar_photo: null,
    });
    setModalOpen({ mode: "edit", id: user.id });
  };



  const activateUser = async (user) => {
    try {
      await usersRepo.action(user.id, "activate");
      addToast(`User "${user.username}" activated successfully.`, "success");
      loadData();
    } catch (e) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || e?.message || "Failed to activate user.";
      const msg = status ? `[${status}] ${detail}` : detail;
      addToast(typeof msg === "string" ? msg : JSON.stringify(msg), "error");
    }
  };

  const confirmSuspendUser = (user) => {
    // Prevent suspending the logged-in Super Admin
    if (user.id === currentUser?.id) {
      addToast("You cannot suspend your own account.", "error");
      return;
    }
    // Prevent suspending the last remaining active Super Admin
    const superAdmins = users.filter((u) => u.role === "SUPER_ADMIN" && u.is_active);
    if (user.role === "SUPER_ADMIN" && superAdmins.length <= 1) {
      addToast("Cannot suspend the last active Super Administrator.", "error");
      return;
    }
    setSuspendConfirm(user);
  };

  const executeSuspend = async () => {
    if (!suspendConfirm) return;
    const user = suspendConfirm;
    setSuspendConfirm(null);
    try {
      await usersRepo.action(user.id, "suspend");
      addToast(`User "${user.username}" suspended successfully.`, "success");
      loadData();
    } catch (e) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || e?.message || "Failed to suspend user.";
      const msg = status ? `[${status}] ${detail}` : detail;
      addToast(typeof msg === "string" ? msg : JSON.stringify(msg), "error");
    }
  };

  const executeRemoveAll = async () => {
    setRemovingAll(true);
    try {
      // Remove all users except SUPER_ADMIN
      const nonAdminUsers = otherUsers;
      for (const user of nonAdminUsers) {
        await usersRepo.destroy(user.id);
      }
      addToast(`Successfully removed ${nonAdminUsers.length} non-admin users.`, "success");
      loadData();
    } catch (e) {
      const detail = e?.response?.data?.detail || "Failed to remove users.";
      addToast(typeof detail === "string" ? detail : JSON.stringify(detail), "error");
    } finally {
      setRemovingAll(false);
      setRemoveAllConfirm(false);
    }
  };

  const saveUser = async (e) => {
    e.preventDefault();
    // Validate password confirmation
    if (formData.password && formData.password !== formData.password2) {
      alert(t("users.passwordMismatch"));
      return;
    }
    setSaving(true);
    try {
      let dataToSend = { ...formData };
      // Farms — a user can be assigned to multiple farms
      const farmList = (Array.isArray(dataToSend.farms) ? dataToSend.farms : (dataToSend.farms ? [dataToSend.farms] : [])).filter(Boolean);
      // Drop empty file field (only send the Aadhaar photo when one was picked)
      if (!(dataToSend.aadhaar_photo instanceof File)) delete dataToSend.aadhaar_photo;
      // The backend matches password against password2 — only send them together
      // when a password is actually being set, otherwise drop both.
      if (!dataToSend.password) {
        delete dataToSend.password;
        delete dataToSend.password2;
      }
      const hasFile = dataToSend.aadhaar_photo instanceof File;
      // FormData can't carry a JS array cleanly — send farms comma-joined; JSON keeps the array
      dataToSend.farms = hasFile ? farmList.join(",") : farmList;
      if (modalOpen.mode === "create") {
        await usersRepo.create(hasFile ? toFormData(dataToSend) : dataToSend);
      } else {
        const data = { ...dataToSend };
        await usersRepo.update(modalOpen.id, hasFile ? toFormData(data) : data);
        // If the admin changed their OWN language, apply it immediately.
        if (currentUser?.id === modalOpen.id && formData.preferred_language) {
          i18n.changeLanguage(formData.preferred_language);
          const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
          localStorage.setItem("user", JSON.stringify({ ...storedUser, preferred_language: formData.preferred_language }));
        }
      }
      setModalOpen(null);
      loadData();        } catch (e) {
          console.error("Save failed", e);
          const errMsg = e?.response?.data?.detail || e?.response?.data || e?.message || "Failed to save user.";
          addToast(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg), "error");
        } finally {
      setSaving(false);
    }
  };

  // Apply search + filters
  const filteredUsers = users.filter((u) => {
    // Search text filter
    const matchesSearch =
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.last_name?.toLowerCase().includes(search.toLowerCase()));
    if (!matchesSearch) return false;

    // Role filter
    if (roleFilter && u.role !== roleFilter) return false;

    // Active status filter
    if (activeFilter === "active" && !u.is_active) return false;
    if (activeFilter === "inactive" && u.is_active) return false;

    // Farm filter
    if (farmFilter) {
      const userFarms = u.farms || [];
      if (!userFarms.includes(farmFilter) && u.farm !== farmFilter) return false;
    }

    return true;
  });

  // Only show active super admins in the Administrators table
  const adminUsers = filteredUsers.filter(u => u.role === "SUPER_ADMIN" && u.is_active);
  const otherUsers = filteredUsers.filter(u => u.role !== "SUPER_ADMIN");

  const renderUserRow = (user) => {
    const emp = userEmpMap[user.id];
    const today = emp ? todayAttMap[emp.id] : null;
    const isCheckedIn = !!today?.check_in_time;
    const isCheckedOut = !!today?.check_out_time;

    const getRowStyle = () => {
      if (!user.is_active) {
        return "bg-gradient-to-r from-gray-100 to-gray-200 border-gray-300 opacity-50";
      }
      if (user.role === "SUPER_ADMIN") {
        return "bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-300";
      } else if (user.role === "FARM_MANAGER") {
        return "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-300";
      } else {
        return "bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200";
      }
    };

    return (
      <tr key={user.id} className={`border-b ${getRowStyle()} hover:bg-opacity-80`}>
        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{user.full_name || "—"}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{user.role === "SUPER_ADMIN" ? user.email : "—"}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{user.role === "SUPER_ADMIN" ? user.phone : "—"}</td>
        <td className="px-4 py-3 whitespace-nowrap">
          {user.role === "SUPER_ADMIN" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm ring-1 ring-purple-600/30">
              <Lock size={10} />
              {t("role.superAdmin")}
            </span>
          ) : (
            <Badge color="purple">{roleLabels[user.role] || user.role}</Badge>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{LANG_LABELS[user.preferred_language] || user.preferred_language || "—"}</td>
        <td className="px-4 py-3 whitespace-nowrap">
          <Badge color={user.is_active ? "green" : "gray"}>{user.is_active ? t("users.yesLabel") : t("users.noLabel")}</Badge>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center justify-end gap-2">
            {emp && (
              isCheckedIn ? (
                <>
                  {isCheckedOut ? (                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-1 text-[10px] font-medium text-gray-500">
                      <CheckCircle size={12} className="text-green-600" />
                      {t("users.doneStatus")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-1.5 py-1 text-[10px] font-medium text-green-700">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                      </span>
                      {t("users.activeStatus")}
                    </span>
                  )}
                </>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={checkinLoading === emp.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    doCheckIn(emp);
                  }}
                  className="!px-2 !py-1 text-[11px]"
                >
                  <LogIn size={12} />
                  {checkinLoading === emp.id ? "…" : t("users.checkInStatus")}
                </Button>
              )
            )}
            {canManage && (
              <>
                {/* Edit */}
                <button
                  onClick={() => openEdit(user)}
                  className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                  title={t("common.edit")}
                >
                  <Pencil size={15} />
                </button>
                {canDelete && (
                  <>
                    {/* Toggle Activate / Deactivate */}
                    <button
                      onClick={() =>
                        user.is_active
                          ? confirmSuspendUser(user)
                          : activateUser(user)
                      }
                      className={`rounded p-1.5 transition ${
                        user.is_active
                          ? "text-green-600 hover:bg-green-50"
                          : "text-gray-400 hover:bg-gray-100"
                      }`}
                      title={
                        user.is_active
                          ? t("users.deactivate")
                          : t("users.activate")
                      }
                    >
                      {/* Toggle switch visual */}
                      <span
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          user.is_active ? "bg-green-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                            user.is_active ? "translate-x-[18px]" : "translate-x-[2px]"
                          }`}
                        />
                      </span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const renderOtherUserRow = (user) => {
    const emp = userEmpMap[user.id];
    const today = emp ? todayAttMap[emp.id] : null;
    const isCheckedIn = !!today?.check_in_time;
    const isCheckedOut = !!today?.check_out_time;

    const getRowStyle = () => {
      if (!user.is_active) {
        return "bg-gradient-to-r from-gray-100 to-gray-200 border-gray-300 opacity-50";
      }
      if (user.role === "FARM_MANAGER") {
        return "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-300";
      } else {
        return "bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200";
      }
    };

    return (
      <tr key={user.id} className={`border-b ${getRowStyle()} hover:bg-opacity-80`}>
        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{user.full_name || "—"}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
          {user.farm_names && user.farm_names.length > 0 ? user.farm_names.join(", ") : "—"}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <Badge color="purple">{roleLabels[user.role] || user.role}</Badge>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{LANG_LABELS[user.preferred_language] || user.preferred_language || "—"}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
          {user.aadhaar_submitted ? (
            <div className="flex items-center gap-2">
              {user.aadhaar_photo_url && <PhotoThumb url={user.aadhaar_photo_url} alt="Aadhaar" size={32} />}
              <span className="font-mono text-xs text-gray-700">{user.aadhaar_number || "—"}</span>
            </div>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {t("users.aadhaarNotSubmitted")}
            </span>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <Badge color={user.is_active ? "green" : "gray"}>{user.is_active ? t("users.yesLabel") : t("users.noLabel")}</Badge>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center justify-end gap-2">
            {emp && (
              isCheckedIn ? (
                <>
                  {isCheckedOut ? (                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-1 text-[10px] font-medium text-gray-500">
                      <CheckCircle size={12} className="text-green-600" />
                      {t("users.doneStatus")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-1.5 py-1 text-[10px] font-medium text-green-700">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                      </span>
                      {t("users.activeStatus")}
                    </span>
                  )}
                </>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={checkinLoading === emp.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    doCheckIn(emp);
                  }}
                  className="!px-2 !py-1 text-[11px]"
                >
                  <LogIn size={12} />
                  {checkinLoading === emp.id ? "…" : t("users.checkInStatus")}
                </Button>
              )
            )}
            {canManage && (
              <>
                {/* Edit */}
                <button
                  onClick={() => openEdit(user)}
                  className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                  title={t("common.edit")}
                >
                  <Pencil size={15} />
                </button>
                {canDelete && (
                  <>
                    {/* Toggle Activate / Deactivate */}
                    <button
                      onClick={() =>
                        user.is_active
                          ? confirmSuspendUser(user)
                          : activateUser(user)
                      }
                      className={`rounded p-1.5 transition ${
                        user.is_active
                          ? "text-green-600 hover:bg-green-50"
                          : "text-gray-400 hover:bg-gray-100"
                      }`}
                      title={
                        user.is_active
                          ? t("users.deactivate")
                          : t("users.activate")
                      }
                    >
                      {/* Toggle switch visual */}
                      <span
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          user.is_active ? "bg-green-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                            user.is_active ? "translate-x-[18px]" : "translate-x-[2px]"
                          }`}
                        />
                      </span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div>
      {/* Live Work Sessions Timer Counter */}
      {activeSessions.length > 0 && (
        <div className="mb-5 rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Play size={18} className="text-green-600" />
            <h3 className="font-semibold text-green-800">
              {t("users.liveWorkSessions", { count: activeSessions.length })}
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeSessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 shadow-sm"
              >
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">
                    {s.user_name || s.username}
                  </p>                    <p className="truncate text-xs text-gray-500" title={`${t("users.workingOnTask")}: ${s.task}`}>
                    {t("users.workingOnTask")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-700">
                    <Clock size={14} className="mr-1 inline" />
                    {formatElapsed(s.start_time)}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {t("users.startedTime", { time: new Date(s.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
                  </p>
                </div>
                {canManage && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={stoppingId === s.id}
                    onClick={() => forceStop(s.id)}
                    className="!px-2.5 !py-1.5 text-xs"
                  >
                    {stoppingId === s.id ? "…" : <Square size={12} />}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t("users.userManagement")}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {t("users.createUsers")}{" "}
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-600/30">
                <Lock size={12} />
                {t("users.superAdminOnly")}
              </span>
            </p>
          </div>
          {canManage && (
            <div className="flex items-center gap-3">
              <Button variant="danger" onClick={() => setRemoveAllConfirm(true)} disabled={otherUsers.length === 0}>
                <UserMinus size={16} />
                Remove Users Data
              </Button>
              <Button onClick={openCreate}>
                <Plus size={16} />
                {t("common.new")}
              </Button>
            </div>
          )}
        </div>

        <div className="px-6 py-4">
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder={t("users.searchUsers")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
            />
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3">
            <Filter size={15} className="text-gray-500" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="min-w-[160px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              <option value="">{t("users.allRoles")}</option>
              <option value="SUPER_ADMIN">{t("users.superAdminOption")}</option>
              <option value="FARM_MANAGER">{t("users.farmManagerOption")}</option>
              <option value="EMPLOYEE">{t("users.employeeOption")}</option>
            </select>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="min-w-[140px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              <option value="">{t("common.allStatus")}</option>
              <option value="active">{t("header.active")}</option>
              <option value="inactive">{t("users.inactive")}</option>
            </select>
            <select
              value={farmFilter}
              onChange={(e) => setFarmFilter(e.target.value)}
              className="min-w-[180px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              <option value="">{t("workforce.allFarms")}</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {(roleFilter || activeFilter || farmFilter) && (
              <button
                onClick={() => { setRoleFilter(""); setActiveFilter(""); setFarmFilter(""); }}
                className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-red-600"
              >
                <X size={15} /> {t("workforce.clear")}
              </button>
            )}
            <span className="ml-auto text-xs text-gray-400">
              {t("users.userCount", { count: filteredUsers.length, plural: filteredUsers.length !== 1 ? "s" : "" })}
            </span>
          </div>

          {loading ? (
            <LoadingSpinner fullScreen={false} size="md" message={t("common.loading")} />
          ) : (
            <div className="space-y-8">
              {/* Admin Users Section */}
              {adminUsers.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-purple-800">{t("users.administrators")}</h3>
                  <div className="overflow-hidden rounded-xl border border-purple-300 bg-gradient-to-r from-purple-100 to-indigo-100">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-purple-300">
                        <thead className="bg-gradient-to-r from-purple-200 to-indigo-200">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-purple-900">{t("header.username")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-purple-900">{t("header.name")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-purple-900">{t("header.email")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-purple-900">{t("header.phone")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-purple-900">{t("header.role")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-purple-900">{t("users.language")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-purple-900">{t("header.active")}</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-purple-900">{t("header.actions")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-purple-300">
                          {adminUsers.map(renderUserRow)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Users Section */}
              {otherUsers.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-blue-800">{t("users.otherUsers")}</h3>
                  <div className="overflow-hidden rounded-xl border border-blue-300 bg-gradient-to-r from-blue-100 to-slate-100">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-blue-300">
                        <thead className="bg-gradient-to-r from-blue-200 to-slate-200">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-blue-900">{t("header.username")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-blue-900">{t("header.name")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-blue-900">{t("header.farm")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-blue-900">{t("header.role")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-blue-900">{t("users.language")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-blue-900">{t("header.aadhaar")}</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-blue-900">{t("header.active")}</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-blue-900">{t("header.actions")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-300">
                          {otherUsers.map(renderOtherUserRow)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* ── Suspend Confirmation Modal ────────────────────────────────── */}
      <Modal open={!!suspendConfirm} onClose={() => setSuspendConfirm(null)} title={t("users.suspendUser")} width="max-w-sm">
        {suspendConfirm && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle size={20} className="shrink-0 text-amber-600" />
              <p>{t("users.confirmSuspend", { username: suspendConfirm.username })}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <p><span className="font-medium text-gray-700">Username:</span> {suspendConfirm.username}</p>
              <p><span className="font-medium text-gray-700">Name:</span> {suspendConfirm.full_name || "—"}</p>
              <p><span className="font-medium text-gray-700">Role:</span> {roleLabels[suspendConfirm.role] || suspendConfirm.role}</p>
              <p><span className="font-medium text-gray-700">Current:</span> <Badge color="green">Active</Badge></p>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setSuspendConfirm(null)}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={executeSuspend}>
                <AlertTriangle size={15} /> Suspend
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Remove All Non-Admin Confirmation Modal ───────────────────── */}
      <Modal open={removeAllConfirm} onClose={() => setRemoveAllConfirm(false)} title="Remove All Non-Admin Users" width="max-w-md">
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle size={20} className="shrink-0 text-amber-600" />
            <p>Are you sure you want to remove ALL non-admin users?</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p><span className="font-medium text-gray-700">Number of users to remove:</span> <strong>{otherUsers.length}</strong></p>
            <p><span className="font-medium text-gray-700">This will remove:</span> All FARM_MANAGER and EMPLOYEE users</p>
            <p><span className="font-medium text-gray-700">This will NOT remove:</span> SUPER_ADMIN users</p>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">
            <strong>Note:</strong> User accounts will be permanently deleted, but all work history (attendance, tasks, payroll, etc.) will remain intact linked to their employee records.
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setRemoveAllConfirm(false)} disabled={removingAll}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={executeRemoveAll} disabled={removingAll}>
              {removingAll ? "Removing..." : <><UserMinus size={15} /> Remove Users Data</>}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* User Form Modal */}
      {modalOpen && (
        <Modal open={!!modalOpen} onClose={() => setModalOpen(null)} title={modalOpen.mode === "create" ? t("users.newUser") : t("users.editUser")}>
          <form onSubmit={saveUser} className="space-y-3">
            <div>                <label className="mb-1 block text-sm font-medium text-gray-700">{t("users.username")}</label>
              <input
                required
                disabled={modalOpen.mode === "edit" && adminUsers.some(a => a.id === modalOpen.id)}
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("common.firstName")}</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("common.lastName")}</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
            </div>
            {modalOpen.mode === "edit" && adminUsers.some(a => a.id === modalOpen.id) && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("users.email")}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("users.phone")}</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              </>
            )}
            {!(modalOpen.mode === "edit" && adminUsers.some(a => a.id === modalOpen.id)) && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("users.role")}</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                >
                  {hasRole("SUPER_ADMIN") && <option value="FARM_MANAGER">{t("users.farmManagerOption")}</option>}
                  <option value="EMPLOYEE">{t("users.employeeOption")}</option>
                </select>
              </div>
            )}
            {!(modalOpen.mode === "edit" && adminUsers.some(a => a.id === modalOpen.id)) && (
              <MultiSelect
                label={t("users.assignedFarm")}
                options={farms.map((farm) => ({ value: String(farm.id), label: farm.name }))}
                value={Array.isArray(formData.farms) ? formData.farms.map(String) : []}
                onChange={(next) => setFormData({ ...formData, farms: next })}
                placeholder={t("users.selectFarm")}
              />
            )}
            {modalOpen.mode === "create" && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("users.password")}</label>
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("users.confirmPassword")}</label>
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={formData.password2}
                    onChange={(e) => setFormData({ ...formData, password2: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              </>
            )}
            {modalOpen.mode === "edit" && (
              <div className="border-t border-gray-200 pt-3">
                <h4 className="mb-2 text-sm font-semibold text-gray-800">{t("users.updatePassword")}</h4>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t("users.newPassword")}</label>
                    <input
                      type="password"
                      minLength={6}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t("users.confirmNewPassword")}</label>
                    <input
                      type="password"
                      minLength={6}
                      value={formData.password2}
                      onChange={(e) => setFormData({ ...formData, password2: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              </div>
            )}
            {/* Admin-managed identity details (users can only view these) */}
            <div className="space-y-3 border-t border-gray-200 pt-3">
              <h4 className="text-sm font-semibold text-gray-800">{t("users.identityDetails")}</h4>
              <Select
                label={t("users.language")}
                value={formData.preferred_language || "en"}
                onChange={(e) => setFormData({ ...formData, preferred_language: e.target.value })}
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="gu">ગુજરાતી</option>
              </Select>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("users.aadhaarNumber")}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  value={formData.aadhaar_number || ""}
                  onChange={(e) => setFormData({ ...formData, aadhaar_number: e.target.value.replace(/\D/g, "") })}
                  placeholder="123412341234"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("users.aadhaarPhoto")}</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setFormData({ ...formData, aadhaar_photo: e.target.files[0] || null })}
                  className="w-full rounded-lg border border-gray-300 text-sm file:mr-3 file:rounded-l-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
                />
                {formData.aadhaar_photo instanceof File && <p className="mt-1 text-xs text-gray-500">{formData.aadhaar_photo.name}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
