import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Navigation, Users, Clock, Check, X, Crosshair, Download, Target, Camera, Loader2, Pencil, Trash2 } from "lucide-react";
import { api, resource, toFormData } from "../lib/api";
import { connectLocationStream } from "../lib/realtime";
import { Badge, Button, Card, PageHeader, Table, ToastContainer, useToast } from "../components/ui";
import { exportExcel } from "../lib/export";
import LiveMap from "../components/LiveMap";
import { useAuth } from "../context/AuthContext";

const pingRepo = resource("gps/pings");
const actRepo = resource("gps/activities");
const attRepo = resource("workforce/attendance");

const activityLabelMap = { CHECKIN: "gps.activityCheckin", CHECKOUT: "gps.activityCheckout", DURING_WORK: "gps.duringWork", TASK: "gps.activityTask", PATROL: "gps.activityPatrol", TRACK: "gps.activityTrack" };
const activityColorMap = { CHECKIN: "green", CHECKOUT: "red", DURING_WORK: "purple", TASK: "blue", TRACK: "purple", PATROL: "gray" };

/** Photo thumbnail with broken-image fallback. */
function PhotoWithFallbackInline({ url, noPhotoLabel, size = 40 }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-md bg-gray-100 text-xs text-gray-400"
        style={{ width: size, height: size }}
      >
        {noPhotoLabel || "—"}
      </span>
    );
  }
  return (
    <div className="relative group">
      <img
        src={url}
        alt="Photo"
        className="object-cover rounded-md cursor-pointer ring-1 ring-gray-200"
        style={{ width: size, height: size }}
        onClick={() => window.open(url, "_blank")}
        onError={() => setFailed(true)}
      />
      <span
        className="hidden group-hover:flex absolute inset-0 items-center justify-center rounded-md bg-black/50 text-[10px] text-white cursor-pointer"
        onClick={() => window.open(url, "_blank")}
      >
        {noPhotoLabel || "View"}
      </span>
    </div>
  );
}

/** Append a new ping to the live array (keeps ALL pings, no dedup). */
function appendPing(list, ping) {
  return [ping, ...list];
}

/** Derive current work-session info for each user from a list of pings. */
function getUserWorkInfo(pings) {
  const workMap = {};
  for (const ping of pings) {
    const uid = String(ping.user);
    if (!workMap[uid]) {
      workMap[uid] = { checkin: null, checkout: null, duringWork: [], isActive: false };
    }
    const w = workMap[uid];
    if (ping.activity === "CHECKIN" && (!w.checkin || new Date(ping.recorded_at) > new Date(w.checkin.recorded_at))) {
      w.checkin = ping;
    }
    if (ping.activity === "CHECKOUT" && (!w.checkout || new Date(ping.recorded_at) > new Date(w.checkout.recorded_at))) {
      w.checkout = ping;
    }
    if (ping.activity === "DURING_WORK") {
      w.duringWork.push(ping);
    }
  }
  for (const w of Object.values(workMap)) {
    if (w.checkin && (!w.checkout || new Date(w.checkout.recorded_at) < new Date(w.checkin.recorded_at))) {
      w.isActive = true;
    }
  }
  return workMap;
}

// Activity filter options — limit to work-related activities only
const workFilterOptions = [
  { value: "CHECKIN", labelKey: "gps.activityCheckin" },
  { value: "DURING_WORK", labelKey: "gps.duringWork" },
  { value: "CHECKOUT", labelKey: "gps.activityCheckout" },
];

export default function GPS() {
  const { t } = useTranslation();
  const { user: currentUser, hasRole } = useAuth();
  const isEmployee = currentUser?.role === "EMPLOYEE";
  const canVerify = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const canEdit = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const canDelete = hasRole("SUPER_ADMIN"); // only super admin may delete
  const [live, setLive] = useState([]);
  const [activities, setActivities] = useState([]);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [duringWorkOpen, setDuringWorkOpen] = useState(false);
  const [duringWorkPhoto, setDuringWorkPhoto] = useState(null);
  const [duringWorkPhotoPreview, setDuringWorkPhotoPreview] = useState(null);
  const [duringWorkMsg, setDuringWorkMsg] = useState(null);
  const [sendingDuringWork, setSendingDuringWork] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState(null);
  const [checkoutMsg, setCheckoutMsg] = useState(null);
  const [lastCheckin, setLastCheckin] = useState(null);
  const [lastCheckout, setLastCheckout] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [watchError, setWatchError] = useState(null);
  const watchId = useRef(null);
  const wsCleanup = useRef(null);

  // Modal state
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
  const [checkInPhoto, setCheckInPhoto] = useState(null);
  const [checkInPhotoPreview, setCheckInPhotoPreview] = useState(null);
  const [checkOutPhoto, setCheckOutPhoto] = useState(null);
  const [checkOutPhotoPreview, setCheckOutPhotoPreview] = useState(null);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPing, setEditingPing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [allRecentPings, setAllRecentPings] = useState([]);
  const [historyPings, setHistoryPings] = useState([]);
  const [myEmployeeProfile, setMyEmployeeProfile] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);

  // Date range filter state
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filteredPings, setFilteredPings] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // User & Activity filter state
  const [filterUser, setFilterUser] = useState("");
  const [filterActivity, setFilterActivity] = useState("");
  const [usersList, setUsersList] = useState([]);

  // Map of user_id → ongoing/to-do task titles for the Work column
  const [userTaskMap, setUserTaskMap] = useState({});
  // The current user's selectable tasks + the one picked for a work submit
  const [myTasks, setMyTasks] = useState([]);
  const [workTask, setWorkTask] = useState("");

  // Toast notifications
  const [toasts, addToast, removeToast] = useToast();

  // Build the Work column data: each user's ongoing / to-do task titles.
  // Re-runnable so it stays fresh.
  const loadWorkTasks = useCallback(async () => {
    try {
      const [tasksData, employeesData] = await Promise.all([
        resource("tasks").list({ page_size: 200 }),
        resource("workforce/employees").list({ page_size: 200 }),
      ]);
      const tasks = Array.isArray(tasksData) ? tasksData : tasksData.results || [];
      const employees = Array.isArray(employeesData) ? employeesData : employeesData.results || [];

      // Build employee -> user mapping (employee.user is the user ID)
      const empUserMap = {};
      for (const e of employees) {
        if (e.user) empUserMap[String(e.id)] = String(e.user);
      }

      const userTasksMap = {};
      const todayStr = new Date().toISOString().slice(0, 10);

      const addTaskToUser = (uid, title) => {
        if (!uid) return;
        if (!userTasksMap[uid]) userTasksMap[uid] = [];
        if (!userTasksMap[uid].includes(title)) userTasksMap[uid].push(title);
      };

      for (const tk of tasks) {
        // Show task only after it has started (start_date <= today)
        if (tk.start_date && todayStr < tk.start_date) continue;
        // Only show ONGOING / to-do work — skip submitted, finished or cancelled
        if (["CANCELLED", "COMPLETED", "VERIFIED", "SUBMITTED"].includes(tk.status)) continue;

        if (tk.assigned_to) addTaskToUser(String(tk.assigned_to), tk.title);
        if (tk.assigned_employee) addTaskToUser(empUserMap[String(tk.assigned_employee)], tk.title);
      }
      setUserTaskMap(userTasksMap);
    } catch {
      /* ignore */
    }
  }, []);

  // Load the employee profile linked to the current user & users list for filters
  useEffect(() => {
    if (!currentUser?.id) return;
    resource("workforce/employees")
      .list({ page_size: 200 })
      .then((d) => {
        const all = Array.isArray(d) ? d : d.results || [];
        const profile = all.find(
          (e) => String(e.user) === String(currentUser.id)
        );
        if (profile) setMyEmployeeProfile(profile);
      })
      .catch(() => {});
    // Load users for the User filter dropdown
    resource("auth/users")
      .list({ page_size: 200 })
      .then((d) => {
        const all = Array.isArray(d) ? d : d.results || [];
        setUsersList(all);
      })
      .catch(() => {});

    // Build the Work column maps (pending tasks + live active task per user)
    loadWorkTasks();
  }, [currentUser, loadWorkTasks]);

  // Load the current user's own ongoing/to-do tasks for the work task picker
  useEffect(() => {
    if (!currentUser?.id) return;
    resource("tasks")
      .list({ page_size: 200 })
      .then((d) => {
        const all = Array.isArray(d) ? d : d.results || [];
        const mine = all.filter((tk) => {
          if (["CANCELLED", "COMPLETED", "VERIFIED"].includes(tk.status)) return false;
          const byUser = String(tk.assigned_to) === String(currentUser.id);
          const byEmp = myEmployeeProfile && String(tk.assigned_employee) === String(myEmployeeProfile.id);
          return byUser || byEmp;
        });
        setMyTasks(mine);
      })
      .catch(() => {});
  }, [currentUser, myEmployeeProfile]);

  const loadHistory = useCallback(async (from, to) => {
    setLoadingHistory(true);
    try {
      const params = { page_size: 100, ordering: "-recorded_at" };
      if (from) params.date_from = from;
      if (to) params.date_to = to;
      const d = await pingRepo.list(params);
      setFilteredPings(Array.isArray(d) ? d : d.results || []);
    } catch {
      setFilteredPings([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const load = useCallback(() => {
    // Load live (latest per user — used for map markers)
    pingRepo
      .collectionAction("live")
      .then((d) => setLive(Array.isArray(d) ? d : d.results || []))
      .catch(() => {});
    // Load ALL recent pings (today's) — shown in the Live Locations table
    const today = new Date().toISOString().slice(0, 10);
    pingRepo
      .list({ date_from: today, ordering: "-recorded_at", page_size: 100 })
      .then((d) => setAllRecentPings(Array.isArray(d) ? d : d.results || []))
      .catch(() => {});
    // Load full history (unfiltered)
    pingRepo
      .list({ page_size: 50, ordering: "-recorded_at" })
      .then((d) => setHistoryPings(Array.isArray(d) ? d : d.results || []))
      .catch(() => {});
    if (!isEmployee) {
      actRepo
        .list({ page_size: 20 })
        .then((d) => setActivities(Array.isArray(d) ? d : d.results || []))
        .catch(() => {});
    }
    // Refresh the Work column (pending + active tasks) alongside pings
    loadWorkTasks();
  }, [isEmployee, loadWorkTasks]);

  // Reload filtered pings whenever date range changes
  useEffect(() => {
    if (dateFrom || dateTo) {
      loadHistory(dateFrom, dateTo);
    } else {
      setFilteredPings([]);
    }
  }, [dateFrom, dateTo, loadHistory]);

  // Helper to get location once
  const getCurrentPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported by your browser"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  }, []);

  useEffect(() => {
    load();

    wsCleanup.current = connectLocationStream({
      onMessage: (data) => {
        if (data._type === "field_activity") {
          // New FieldActivity created — reload the pending activities list
          if (!isEmployee) {
            actRepo
              .list({ page_size: 20 })
              .then((d) => setActivities(Array.isArray(d) ? d : d.results || []))
              .catch(() => {});
          }
        } else {
          // Regular location ping — append to all recent & update live for map
          setAllRecentPings((prev) => appendPing(prev, data));
          // Keep live deduplicated for map markers
          setLive((prev) => {
            const idx = prev.findIndex((p) => String(p.user) === String(data.user));
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = data;
              return updated;
            }
            return [data, ...prev];
          });
        }
      },
      onStatus: (status) => setWsStatus(status),
    });

    // Request initial location immediately
    setLocationLoading(true);
    setWatchError(null);
    getCurrentPosition()
      .then((pos) => {
        setCurrentPos(pos);
        setLocationLoading(false);
      })
      .catch((err) => {
        setLocationLoading(false);
        const msgs = {
          1: t("gps.locationDenied"),
          2: t("gps.locationUnavailable"),
          3: t("gps.locationTimedOut"),
        };
        setWatchError(msgs[err.code] || t("gps.locationFailed"));
      });

    // Start continuous tracking
    if (navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          setCurrentPos({ lat: latitude, lng: longitude, accuracy });
          setWatchError(null);
          setLocationLoading(false);
        },
        (err) => {
          const msgs = {
            1: t("gps.locationDenied"),
            2: t("gps.locationUnavailable"),
            3: t("gps.locationTimedOut"),
          };
          setWatchError(msgs[err.code] || t("gps.locationFailed"));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      );
    }

    // Keep the Work column (pending + active tasks) fresh while the page is open
    // Using a long interval (5 min + jitter) since tasks rarely change mid-session.
    // Live location updates come via WebSocket, not polling.
    const base = 300000;
    const jitter = Math.floor(Math.random() * base * 0.4) - Math.floor(base * 0.2); // ±20%
    const workTasksTimer = setInterval(() => loadWorkTasks(), base + jitter);

    return () => {
      if (wsCleanup.current) wsCleanup.current();
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      clearInterval(workTasksTimer);
    };
  }, [load, getCurrentPosition, loadWorkTasks]);

  // Employees only see THEIR data
  const visibleLivePings = isEmployee
    ? live.filter((p) => String(p.user) === String(currentUser?.id))
    : live;

  const visibleAllPings = isEmployee
    ? allRecentPings.filter((p) => String(p.user) === String(currentUser?.id))
    : allRecentPings;

  const visibleHistoryPings = isEmployee
    ? historyPings.filter((p) => String(p.user) === String(currentUser?.id))
    : historyPings;

  // Markers to plot on the live tracking map (use deduplicated live positions).
  const mapMarkers = [
    ...visibleLivePings
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({
        id: p.id || `u${p.user}`,
        lat: p.latitude,
        lng: p.longitude,
        label: p.user_name || p.user,
        sublabel: [t(activityLabelMap[p.activity] || p.activity), p.recorded_at && new Date(p.recorded_at).toLocaleTimeString()]
          .filter(Boolean)
          .join(" · "),
      })),
    // Always include the viewer's own current position when available.
    ...(currentPos
      ? [{ id: "me", lat: currentPos.lat, lng: currentPos.lng, label: t("gps.youCurrent"), sublabel: t("gps.livePosition") }]
      : []),
  ];

  const verify = async (id, verb) => {
    await actRepo.action(id, verb);
    load();
  };

  const openEditPingModal = (ping) => {
    setEditingPing(ping);
    setEditForm({
      activity: ping.activity,
      latitude: ping.latitude,
      longitude: ping.longitude,
      accuracy: ping.accuracy,
    });
    setEditModalOpen(true);
  };

  const deletePing = async (pingId) => {
    if (window.confirm(t("gps.confirmDelete"))) {
      try {
        await pingRepo.remove(pingId);
        addToast(t("gps.pingDeleted"), "success");
        load();
      } catch (err) {
        addToast(t("gps.pingDeleteFailed"), "error");
      }
    }
  };

  // ── Clear all location data ────────────────────────────────────────
  const clearAllData = async () => {
    if (!window.confirm(t("gps.clearAllConfirm"))) return;

    setClearingAll(true);
    try {
      const res = await api.post("/gps/pings/clear-all/");
      const msg = res.data?.detail || t("gps.clearAllResult", { count: res.data?.deleted || 0 });
      addToast(msg, "success");
      load();
    } catch (err) {
      const detail =
        err.response?.data?.detail ||
        err.message ||
        `Request failed (${err.response?.status || "unknown"}).`;
      addToast(detail, "error");
    } finally {
      setClearingAll(false);
    }
  };

  const saveEditPing = async () => {
    if (!editingPing) return;
    setSavingEdit(true);
    try {
      await pingRepo.update(editingPing.id, editForm);
      setEditModalOpen(false);
      addToast(t("gps.pingUpdated"), "success");
      load();
    } catch (err) {
      addToast(t("gps.pingUpdateFailed"), "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const openCheckInModal = useCallback(async () => {
    setCheckInModalOpen(true);
    setCheckInPhoto(null);
    setCheckInPhotoPreview(null);
    setCheckinMsg(null);
    setWorkTask("");
    // Always try to get a fresh location when opening modal
    setLocationLoading(true);
    try {
      const pos = await getCurrentPosition();
      setCurrentPos(pos);
    } catch (err) {
      // Keep previous position as fallback, show warning
    } finally {
      setLocationLoading(false);
    }
  }, [getCurrentPosition]);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCheckInPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCheckInPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const doCheckIn = async () => {
    setCheckingIn(true);
    setCheckinMsg(null);

    try {
      // Get the freshest location possible right before sending
      let pos = currentPos;
      try {
        const fresh = await getCurrentPosition();
        pos = fresh;
        setCurrentPos(fresh);
      } catch {
        if (!pos) {
          setCheckinMsg({ type: "error", text: t("gps.noLocation") });
          setCheckingIn(false);
          return;
        }
      }

      const lat = Number(pos.lat.toFixed(6));
      const lng = Number(pos.lng.toFixed(6));

      let result;
      // Use linked profile if available, otherwise record a LocationPing
      if (myEmployeeProfile) {
        // Create Attendance record using linked profile
        const payload = {
          employee: myEmployeeProfile.id,
          check_in_lat: lat,
          check_in_lng: lng,
          ...(workTask ? { task: workTask } : {}),
        };
        if (checkInPhoto) {
          result = await api.post(
            "/workforce/attendance/check_in/",
            toFormData({ ...payload, check_in_photo: checkInPhoto })
          );
        } else {
          result = await api.post("/workforce/attendance/check_in/", payload);
        }
        const attRecord = result.data;
        setLastCheckin({
          recorded_at: attRecord.check_in_time,
          ...attRecord,
        });

        setCheckinMsg({
          type: "success",
          text: t("gps.checkinSuccess"),
        });
      } else {
        // No linked profile — just record a LocationPing
        const data = {
          latitude: lat,
          longitude: lng,
          accuracy: pos.accuracy != null ? Math.round(pos.accuracy) : null,
          activity: "CHECKIN",
          ...(workTask ? { task: workTask } : {}),
        };
        if (checkInPhoto) {
          result = await pingRepo.create(
            toFormData({ ...data, photo: checkInPhoto })
          );
        } else {
          result = await pingRepo.create(data);
        }
        setLastCheckin({ recorded_at: result.recorded_at, ...result });

        setCheckinMsg({
          type: "success",
          text: t("gps.locationRecorded"),
        });
      }

      setCheckInModalOpen(false);
      load();
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || t("gps.checkinFailed");
      setCheckinMsg({
        type: "error",
        text: detail,
      });
    } finally {
      setCheckingIn(false);
    }
  };

  const openCheckOutModal = useCallback(async () => {
    setCheckOutModalOpen(true);
    setCheckOutPhoto(null);
    setCheckOutPhotoPreview(null);
    setCheckoutMsg(null);
    setWorkTask("");
    // Always try to get a fresh location when opening modal
    setLocationLoading(true);
    try {
      const pos = await getCurrentPosition();
      setCurrentPos(pos);
    } catch (err) {
      // Keep previous position as fallback, show warning
    } finally {
      setLocationLoading(false);
    }
  }, [getCurrentPosition]);

  const handleCheckOutPhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCheckOutPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCheckOutPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDuringWorkPhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setDuringWorkPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setDuringWorkPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const doDuringWork = async () => {
    setSendingDuringWork(true);
    setDuringWorkMsg(null);

    try {
      let pos = currentPos;
      try {
        const fresh = await getCurrentPosition();
        pos = fresh;
        setCurrentPos(fresh);
      } catch {
        if (!pos) {
          setDuringWorkMsg({ type: "error", text: t("gps.noLocation") });
          setSendingDuringWork(false);
          return;
        }
      }

      const lat = Number(pos.lat.toFixed(6));
      const lng = Number(pos.lng.toFixed(6));

      if (myEmployeeProfile) {
        // Use the attendance during_work API (same pattern as check_in/check_out)
        const payload = {
          employee: myEmployeeProfile.id,
          latitude: lat,
          longitude: lng,
          ...(workTask ? { task: workTask } : {}),
        };
        let result;
        if (duringWorkPhoto) {
          result = await api.post(
            "/workforce/attendance/during_work/",
            toFormData({ ...payload, photo: duringWorkPhoto })
          );
        } else {
          result = await api.post("/workforce/attendance/during_work/", payload);
        }
        const attRecord = result.data;
        setDuringWorkMsg({ type: "success", text: t("gps.duringWorkSuccess") });
      } else {
        // No linked profile — record a LocationPing directly
        const data = {
          latitude: lat,
          longitude: lng,
          accuracy: pos.accuracy != null ? Math.round(pos.accuracy) : null,
          activity: "DURING_WORK",
          ...(workTask ? { task: workTask } : {}),
        };
        if (duringWorkPhoto) {
          await pingRepo.create(toFormData({ ...data, photo: duringWorkPhoto }));
        } else {
          await pingRepo.create(data);
        }
        setDuringWorkMsg({ type: "success", text: t("gps.locationRecorded") });
      }

      setDuringWorkOpen(false);
      load();
    } catch (err) {
      setDuringWorkMsg({ type: "error", text: err.response?.data?.detail || err.message || t("gps.checkinFailed") });
    } finally {
      setSendingDuringWork(false);
    }
  };

  const doCheckOut = async () => {
    setCheckingOut(true);
    setCheckoutMsg(null);

    try {
      // Get the freshest location possible right before sending
      let pos = currentPos;
      try {
        const fresh = await getCurrentPosition();
        pos = fresh;
        setCurrentPos(fresh);
      } catch {
        if (!pos) {
          setCheckoutMsg({ type: "error", text: t("gps.noLocation") });
          setCheckingOut(false);
          return;
        }
      }

      const lat = Number(pos.lat.toFixed(6));
      const lng = Number(pos.lng.toFixed(6));

      let result;
      if (myEmployeeProfile) {
        // Find today's attendance record for this employee
        const attList = await resource("workforce/attendance").list({
          employee: myEmployeeProfile.id,
          date: new Date().toISOString().slice(0, 10),
          page_size: 1,
        });
        const attRows = Array.isArray(attList)
          ? attList
          : attList.results || [];
        const attendance = attRows[0];

        if (attendance) {
          // Check out via attendance endpoint (also creates a LocationPing)
          const data = {
            check_out_lat: lat,
            check_out_lng: lng,
            ...(workTask ? { task: workTask } : {}),
          };
          const body = checkOutPhoto ? toFormData({ ...data, check_out_photo: checkOutPhoto }) : data;
          result = await attRepo.action(attendance.id, "check_out", body);
          setLastCheckout({
            recorded_at: result.check_out_time,
            ...result
          });
        } else {
          // No attendance record yet — fallback to LocationPing only
          const data = {
            latitude: lat,
            longitude: lng,
            accuracy: pos.accuracy != null ? Math.round(pos.accuracy) : null,
            activity: "CHECKOUT",
            ...(workTask ? { task: workTask } : {}),
          };
          result = await pingRepo.create(data);
          setLastCheckout(result);
        }
      } else {
        // No linked profile — just record a LocationPing
        const data = {
          latitude: lat,
          longitude: lng,
          accuracy: pos.accuracy != null ? Math.round(pos.accuracy) : null,
          activity: "CHECKOUT",
          ...(workTask ? { task: workTask } : {}),
        };
        if (checkOutPhoto) {
          result = await pingRepo.create(
            toFormData({ ...data, photo: checkOutPhoto })
          );
        } else {
          result = await pingRepo.create(data);
        }
        setLastCheckout(result);
      }

      setCheckoutMsg({
        type: "success",
        text: t("gps.checkoutSuccess"),
      });
      setCheckOutModalOpen(false);
      load();
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || t("gps.checkoutFailed");
      setCheckoutMsg({
        type: "error",
        text: detail,
      });
    } finally {
      setCheckingOut(false);
    }
  };

  // Task picker shown in the Before/During/Completed Work modals
  const taskPicker = (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{t("gps.selectTask")}</label>
      <select
        value={workTask}
        onChange={(e) => setWorkTask(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
      >
        <option value="">{t("gps.noTaskSelected")}</option>
        {myTasks.map((tk) => <option key={tk.id} value={tk.id}>{tk.title}</option>)}
      </select>
      {!myTasks.length && <p className="text-xs text-gray-400">{t("gps.noTasksAssigned")}</p>}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={t("gps.titlePg")}
        subtitle={
          isEmployee
            ? t("gps.subtitleEmployee")
            : t("gps.subtitleAdmin")
        }
        action={
          <div className="flex items-center gap-2 flex-wrap">
          {(isEmployee ? visibleHistoryPings.length > 0 : historyPings.length > 0) && (
            <Button variant="secondary" onClick={() => {
              const data = isEmployee ? visibleHistoryPings : historyPings;
              exportExcel(data, [{key:"user_name",header:t("header.user")},{key:"latitude",header:t("header.latitude")},{key:"longitude",header:t("header.longitude")},{key:"activity",header:t("header.activities")},{key:"recorded_at",header:t("header.time")}], "location-history.xlsx", "Location History");
            }}>
              <Download size={15} /> {t("common.excel")}
            </Button>
          )}
          <div className="flex items-center gap-3">
            {lastCheckin && (
              <span className="hidden text-xs text-gray-400 sm:block">
                {t("gps.lastIn")} {new Date(lastCheckin.recorded_at || Date.now()).toLocaleTimeString()}
              </span>
            )}
            {lastCheckout && (
              <span className="hidden text-xs text-gray-400 sm:block">
                {t("gps.lastOut")} {new Date(lastCheckout.recorded_at || Date.now()).toLocaleTimeString()}
              </span>
            )}
            <Button
              onClick={openCheckInModal}
              disabled={checkingIn}
            >                {checkingIn ? <Loader2 size={16} className="animate-spin mr-2" /> : <Crosshair size={16} className="mr-2" />}
              {checkingIn ? t("gps.checkingIn") : t("gps.beforeWork")}
            </Button>
            <Button
              onClick={() => { setWorkTask(""); setDuringWorkOpen(true); }}
              disabled={sendingDuringWork}
            >                {sendingDuringWork ? <Loader2 size={16} className="animate-spin mr-2" /> : <Camera size={16} className="mr-2" />}
              {sendingDuringWork ? t("common.saving") : t("gps.duringWork")}
            </Button>
            <Button
              variant="secondary"
              onClick={openCheckOutModal}
              disabled={checkingOut}
            >                {checkingOut ? <Loader2 size={16} className="animate-spin mr-2" /> : <Crosshair size={16} className="mr-2" />}
              {checkingOut ? t("gps.checkingOut") : t("gps.completedWork")}
            </Button>
          </div>
          </div>
        }
      />

      {/* Check-in feedback banner */}
      {checkinMsg && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
            checkinMsg.type === "success"
              ? "bg-green-50 text-green-700 ring-1 ring-green-200"
              : "bg-red-50 text-red-700 ring-1 ring-red-200"
          }`}
        >
          <span className="flex-1">{checkinMsg.text}</span>
          <button
            onClick={() => setCheckinMsg(null)}
            className="text-current opacity-50 hover:opacity-100"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Check-out feedback banner */}
      {checkoutMsg && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
            checkoutMsg.type === "success"
              ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
              : "bg-red-50 text-red-700 ring-1 ring-red-200"
          }`}
        >
          <span className="flex-1">{checkoutMsg.text}</span>
          <button
            onClick={() => setCheckoutMsg(null)}
            className="text-current opacity-50 hover:opacity-100"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Live Map */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-3">            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <MapPin size={18} className="text-brand-600" />
            {isEmployee ? t("common.yourLocation") : t("common.liveLocationMap")}
          </h2>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {wsStatus === "connected" && (
              <span className="flex items-center gap-1 text-green-600">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                </span>
                {t("common.live")}
              </span>
            )}
            {wsStatus === "reconnecting" && (
              <span className="flex items-center gap-1 text-amber-600">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                </span>
                {t("common.reconnecting")}
              </span>
            )}
            {wsStatus === "disconnected" && (
              <span className="flex items-center gap-1 text-red-600">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />
                </span>
                {t("common.disconnected")}
              </span>
            )}
            {lastCheckin && (
              <span className="hidden md:inline-flex items-center gap-1 text-brand-600">
                <MapPin size={12} />
                {t("gps.lastCheckin")} {new Date(lastCheckin.recorded_at || Date.now()).toLocaleTimeString()}
              </span>
            )}                <span>{t("common.realtime")}</span>
          </div>
        </div>
        <LiveMap height={420} markers={mapMarkers} />

        {/* Live location coordinates bar — shown to everyone */}
        {locationLoading ? (
          <div className="mt-3 flex items-center gap-4 rounded-lg bg-gradient-to-r from-brand-50 to-green-50 p-3 ring-1 ring-brand-100">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white">
              <Loader2 size={18} className="animate-spin" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">{t("common.gettingLocation")}</p>
            </div>
          </div>
        ) : currentPos ? (
          <div className="mt-3 flex items-center gap-4 rounded-lg bg-gradient-to-r from-brand-50 to-green-50 p-3 ring-1 ring-brand-100">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white">
              <Target size={18} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">{t("common.yourLiveLocation")}</p>
              <p className="text-xs text-gray-500">
                {currentPos.lat.toFixed(6)}, {currentPos.lng.toFixed(6)}
                {currentPos.accuracy != null && (
                  <span className="ml-2">{t("common.accuracy", { accuracy: Math.round(currentPos.accuracy) })}</span>
                )}
              </p>
            </div>
            <a
              href={`https://www.google.com/maps?q=${currentPos.lat},${currentPos.lng}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm ring-1 ring-brand-200 hover:bg-brand-50"
            >
              <Navigation size={13} /> {t("common.viewOnMap")}
            </a>
          </div>
        ) : null}
        {watchError && (
          <div className="mt-3 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg ring-1 ring-amber-200">
            ⚠️ {watchError}
          </div>
        )}

        {/* Quick checkin card at the bottom of the map for mobile (employees only) */}
        {isEmployee && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 p-3 md:hidden">
            <span className="text-sm text-gray-600">{t("common.recordLocation")}</span>
            <Button
              onClick={openCheckInModal}
              disabled={checkingIn}
            >
              {checkingIn ? <Loader2 size={14} className="animate-spin mr-1" /> : <Crosshair size={14} className="mr-1" />}
              {checkingIn ? t("gps.checkingIn") : t("gps.beforeWork")}
            </Button>
          </div>
        )}
      </Card>

      {/* Live Locations Table — admin only */}
      {!isEmployee && (
        <Card
          title={t("common.liveLocations", { count: live.length, plural: live.length !== 1 ? "s" : "" })}
          className="mb-5"
          action={
            canDelete ? (
              <Button
                variant="secondary"
                onClick={clearAllData}
                disabled={clearingAll}
                className="!text-red-600 !border-red-200 hover:!bg-red-50"
                title={t("common.clearAllData")}
              >
                {clearingAll ? (
                  <><Loader2 size={15} className="animate-spin mr-1.5" /> {t("gps.clearing")}</>
                ) : (
                  <><Trash2 size={15} className="mr-1.5" /> {t("common.removeAllData")}</>
                )}
              </Button>
            ) : null
          }
        >
          {/* ── Date Range Filter Bar ─────────────────────────────────── */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">{t("common.fromDate")}:</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">{t("common.toDate")}:</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
              />
            </div>
            {/* User filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">{t("header.user")}:</label>
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
              >
                <option value="">{t("common.allEmployees")}</option>
                {usersList.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                ))}
              </select>
            </div>
            {/* Activity filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">{t("gps.activityLabel")}:</label>
              <select
                value={filterActivity}
                onChange={(e) => setFilterActivity(e.target.value)}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
              >
                <option value="">{t("common.allStatus")}</option>
                {workFilterOptions.map(({ value: val, labelKey }) => (
                  <option key={val} value={val}>{t(labelKey)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  setDateFrom(today);
                  setDateTo(today);
                }}
                className="!text-xs !px-2.5 !py-1"
              >
                {t("common.today")}
              </Button>
              {(dateFrom || dateTo || filterUser || filterActivity) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setDateFrom(""); setDateTo(""); setFilterUser(""); setFilterActivity(""); }}
                  className="!text-xs !px-2.5 !py-1 !text-red-500"
                >
                  {t("common.clearAll")}
                </Button>
              )}
            </div>
            {loadingHistory && (
              <Loader2 size={14} className="animate-spin text-brand-600" />
            )}
            {dateFrom || dateTo ? (
              <span className="text-xs text-gray-400">
                {t("gps.showingResults", { count: filteredPings.length, plural: filteredPings.length !== 1 ? "s" : "" })}
              </span>
            ) : null}
          </div>
          <Table
            columns={[
              {
                key: "user_name",
                header: t("header.user"),
                render: (r) => (
                  <span className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                      {(r.user_name || r.user || "?")[0].toUpperCase()}
                    </div>
                    {r.user_name || r.user}
                    {String(r.user) === String(currentUser?.id) && (
                      <Badge color="blue">{t("gps.you")}</Badge>
                    )}
                  </span>
                ),
              },
              {
                key: "photo",
                header: t("header.photo"),
                render: (r) => <PhotoWithFallbackInline url={r.photo} noPhotoLabel={t("gps.noPhoto")} />,
              },
              {
                key: "location_name",
                header: t("farmDetail.location"),
                render: (r) =>
                  r.location_name ? (
                    <span className="max-w-[220px] truncate text-xs text-gray-600 block" title={r.location_name}>
                      {r.location_name}
                    </span>
                  ) : r.latitude != null ? (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <a
                        href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 hover:underline"
                      >
                        {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
                      </a>
                    </span>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "farm",
                header: t("header.farm"),
                render: (r) =>
                  r.farm_name ? (
                    <span className="text-xs text-gray-600">{r.farm_name}</span>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "activity",
                header: t("gps.activityLabel"),
                render: (r) => (
                  <Badge
                    color={activityColorMap[r.activity] || "gray"}
                  >
                    {t(activityLabelMap[r.activity] || r.activity) || "—"}
                  </Badge>
                ),
              },
              {
                key: "work",
                header: t("gps.work"),
                render: (r) => {
                  // Prefer the task the employee picked when submitting this work
                  if (r.task_title) {
                    return (
                      <span className="inline-flex max-w-[240px] items-center gap-1.5 text-xs font-medium text-brand-700">
                        <span className="truncate" title={r.task_title}>{r.task_title}</span>
                      </span>
                    );
                  }
                  // Fallback: the user's assigned ongoing/to-do tasks
                  const tasks = userTaskMap[String(r.user)] || [];
                  if (!tasks.length) {
                    return <span className="text-xs text-gray-400">{t("gps.noPendingWork")}</span>;
                  }
                  return (
                    <div className="flex max-w-[240px] flex-col gap-1">
                      {tasks.map((title, i) => (
                        <span key={i} title={title} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                          <span className="truncate">{title}</span>
                        </span>
                      ))}
                    </div>
                  );
                },
              },
              {
                key: "recorded_at",
                header: t("header.time"),
                render: (r) =>
                  r.recorded_at ? (
                    <span className="flex items-center gap-1 text-gray-600 text-xs">
                      <Clock size={11} />
                      {new Date(r.recorded_at).toLocaleString()}
                    </span>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "map",
                header: t("common.openInMaps"),
                render: (r) =>
                  r.latitude ? (
                    <a
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
                      href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation size={13} />
                      {t("common.view")}
                    </a>
                  ) : (
                    "—"
                  ),
              },
              ...(canEdit
                ? [
                    {
                      key: "actions",
                      header: t("header.actions"),
                      render: (r) => (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditPingModal(r)}
                            className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                            title={t("gps.edit")}
                          >
                            <Pencil size={15} />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => deletePing(r.id)}
                              className="rounded p-1.5 text-red-600 hover:bg-red-50"
                              title={t("gps.delete")}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
            rows={(dateFrom || dateTo ? filteredPings : visibleAllPings).filter((r) => {
              if (filterUser && String(r.user) !== String(filterUser)) return false;
              if (filterActivity && r.activity !== filterActivity) return false;
              return true;
            })}
            empty={dateFrom || dateTo ? t("gps.noDataFound") : t("gps.noDataYet")}
          />
        </Card>
      )}


      {/* Check-in Modal */}
      {checkInModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl relative z-[1001]">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">{t("gps.checkinTitle")}</h3>
              <button
                onClick={() => setCheckInModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Current Location Display */}
              {locationLoading ? (
                <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                  <div className="mt-1">
                    <Loader2 size={16} className="animate-spin text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t("common.gettingLocation")}</p>
                  </div>
                </div>
              ) : currentPos ? (
                <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-3">
                  <div className="mt-1">
                    <MapPin size={16} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t("gps.currentLocation")}</p>
                    <p className="text-xs text-gray-600">
                      {currentPos.lat.toFixed(6)}, {currentPos.lng.toFixed(6)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 bg-red-50 p-3 rounded-lg ring-1 ring-red-200">
                  {t("common.couldNotGetLocation")}
                </div>
              )}

              {/* Work task picker */}
              {taskPicker}

              {/* Photo Upload */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t("gps.checkinPhoto")}
                </label>
                {checkInPhotoPreview ? (
                  <div className="relative">
                    <img
                      src={checkInPhotoPreview}
                      alt="Preview"
                      className="w-full h-40 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => {
                        setCheckInPhoto(null);
                        setCheckInPhotoPreview(null);
                      }}
                      className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1 hover:bg-opacity-70"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Camera size={24} className="text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">
                        {t("gps.clickPhoto")}
                      </p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoChange}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => setCheckInModalOpen(false)}
                disabled={checkingIn}
              >
                {t("gps.cancel")}
              </Button>
              <Button
                onClick={doCheckIn}
                disabled={checkingIn || !currentPos}
              >
                {checkingIn ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    {t("gps.checkingIn")}
                  </span>
                ) : (
                  t("gps.confirmCheckIn")
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Check-out Modal */}
      {checkOutModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl relative z-[1001]">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">{t("gps.checkoutTitle")}</h3>
              <button
                onClick={() => setCheckOutModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Current Location Display */}
              {locationLoading ? (
                <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                  <div className="mt-1">
                    <Loader2 size={16} className="animate-spin text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t("common.gettingLocation")}</p>
                  </div>
                </div>
              ) : currentPos ? (
                <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-3">
                  <div className="mt-1">
                    <MapPin size={16} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t("gps.currentLocation")}</p>
                    <p className="text-xs text-gray-600">
                      {currentPos.lat.toFixed(6)}, {currentPos.lng.toFixed(6)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 bg-red-50 p-3 rounded-lg ring-1 ring-red-200">
                  {t("common.couldNotGetLocation")}
                </div>
              )}

              {/* Work task picker */}
              {taskPicker}

              {/* Photo Upload */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t("gps.checkoutPhoto")}
                </label>
                {checkOutPhotoPreview ? (
                  <div className="relative">
                    <img
                      src={checkOutPhotoPreview}
                      alt="Preview"
                      className="w-full h-40 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => {
                        setCheckOutPhoto(null);
                        setCheckOutPhotoPreview(null);
                      }}
                      className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1 hover:bg-opacity-70"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Camera size={24} className="text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">
                        {t("gps.clickPhoto")}
                      </p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      capture="environment"
                      onChange={handleCheckOutPhotoChange}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => setCheckOutModalOpen(false)}
                disabled={checkingOut}
              >
                {t("gps.cancel")}
              </Button>
              <Button
                onClick={doCheckOut}
                disabled={checkingOut || !currentPos}
              >
                {checkingOut ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    {t("gps.checkingOut")}
                  </span>
                ) : (
                  t("gps.confirmCheckOut")
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* During Work Modal */}
      {duringWorkOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl relative z-[1001]">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">{t("gps.duringWork")} — {t("common.photo")}</h3>
              <button
                onClick={() => setDuringWorkOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {duringWorkMsg && (
                <div className={`p-3 rounded-lg text-sm font-medium ${
                  duringWorkMsg.type === "success"
                    ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                    : "bg-red-50 text-red-700 ring-1 ring-red-200"
                }`}>
                  {duringWorkMsg.text}
                </div>
              )}
              {/* Current Location Display */}
              {locationLoading ? (
                <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                  <div className="mt-1">
                    <Loader2 size={16} className="animate-spin text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t("common.gettingLocation")}</p>
                  </div>
                </div>
              ) : currentPos ? (
                <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-3">
                  <div className="mt-1">
                    <MapPin size={16} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t("gps.currentLocation")}</p>
                    <p className="text-xs text-gray-600">
                      {currentPos.lat.toFixed(6)}, {currentPos.lng.toFixed(6)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 bg-red-50 p-3 rounded-lg ring-1 ring-red-200">
                  {t("common.couldNotGetLocation")}
                </div>
              )}

              {/* Work task picker */}
              {taskPicker}

              {/* Photo Upload */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t("common.workPhoto")}
                </label>
                {duringWorkPhotoPreview ? (
                  <div className="relative">
                    <img
                      src={duringWorkPhotoPreview}
                      alt="Preview"
                      className="w-full h-40 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => {
                        setDuringWorkPhoto(null);
                        setDuringWorkPhotoPreview(null);
                      }}
                      className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1 hover:bg-opacity-70"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Camera size={24} className="text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">
                        {t("gps.clickPhoto")}
                      </p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      capture="environment"
                      onChange={handleDuringWorkPhotoChange}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => setDuringWorkOpen(false)}
                disabled={sendingDuringWork}
              >
                {t("gps.cancel")}
              </Button>
              <Button
                onClick={doDuringWork}
                disabled={sendingDuringWork || !currentPos}
              >
                {sendingDuringWork ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    {t("common.saving")}
                  </span>
                ) : (
                  t("gps.duringWork")
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Field Activity Verification (admins only) */}
      {!isEmployee && canVerify && (
        <Card title={t("gps.pendingVerificationTitle")}>
          <Table
            columns={[
              {
                key: "user_name",
                header: t("header.user"),
                render: (r) => r.user_name || r.user,
              },
              { key: "description", header: t("header.description") },
              {
                key: "task_title",
                header: t("header.task"),
                render: (r) => r.task_title || "—",
              },
              {
                key: "status",
                header: t("header.status"),
                render: (r) => (
                  <Badge
                    color={
                      r.status === "VERIFIED"
                        ? "green"
                        : r.status === "REJECTED"
                          ? "red"
                          : "yellow"
                    }
                  >
                    {r.status}
                  </Badge>
                ),
              },
              {
                key: "_a",
                header: t("header.actions"),
                render: (r) =>
                  r.status === "SUBMITTED" ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => verify(r.id, "verify")}
                        className="rounded p-1.5 text-green-600 hover:bg-green-50"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        onClick={() => verify(r.id, "reject")}
                        className="rounded p-1.5 text-red-600 hover:bg-red-50"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    "—"
                  ),
              },
            ]}
            rows={activities.filter((a) => a.status === "SUBMITTED")}
            empty={t("common.noPendingVerification")}
          />
        </Card>
      )}

      {/* Admin Stats */}
      {!isEmployee && live.length > 0 && (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <Users size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{live.length}</p>
                <p className="text-xs text-gray-500">{t("common.activeUsers")}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600">
                <MapPin size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">
                  {live.filter((p) => p.latitude != null).length}
                </p>
                <p className="text-xs text-gray-500">{t("common.withLocation")}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Navigation size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">
                  {new Set(live.map((p) => p.activity)).size}
                </p>
                <p className="text-xs text-gray-500">{t("common.activities")}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Edit Location Ping Modal */}
      {editModalOpen && editingPing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl relative z-[1001]">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">{t("gps.editTitle")}</h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">{t("gps.activity")}</label>
                <select
                  value={editForm.activity}
                  onChange={(e) => setEditForm({ ...editForm, activity: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                >
                  <option value="CHECKIN">{t("gps.activityCheckin")}</option>
                  <option value="CHECKOUT">{t("gps.activityCheckout")}</option>
                  <option value="DURING_WORK">{t("gps.duringWork")}</option>
                  <option value="TASK">{t("gps.activityTask")}</option>
                  <option value="PATROL">{t("gps.activityPatrol")}</option>
                  <option value="TRACK">{t("gps.activityTrack")}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">{t("gps.latitude")}</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={editForm.latitude}
                    onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">{t("gps.longitude")}</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={editForm.longitude}
                    onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">{t("gps.accuracyLabel")}</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.accuracy}
                  onChange={(e) => setEditForm({ ...editForm, accuracy: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => setEditModalOpen(false)}
                disabled={savingEdit}
              >
                {t("gps.cancel")}
              </Button>
              <Button onClick={saveEditPing} disabled={savingEdit}>
                {savingEdit ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    {t("gps.saving")}
                  </span>
                ) : (
                  t("gps.saveChanges")
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
