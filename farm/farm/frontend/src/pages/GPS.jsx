import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Navigation, Users, Clock, Check, X, Download, Target, Loader2, Pencil, Trash2 } from "lucide-react";
import { api, resource } from "../lib/api";
import { openMapUrl, hasValidCoords } from "../lib/maps";
import { connectLocationStream } from "../lib/realtime";
import { Badge, Button, Card, PageHeader, Table, ToastContainer, useToast } from "../components/ui";
import { exportExcel } from "../lib/export";
import LiveMap from "../components/LiveMap";
import { useAuth } from "../context/AuthContext";

const pingRepo = resource("gps/pings");
const actRepo = resource("gps/activities");

const activityLabelMap = { CHECKIN: "gps.activityCheckin", CHECKOUT: "gps.activityCheckout", DURING_WORK: "gps.duringWork", BREAK: "gps.break", RESUME: "gps.resume", TASK: "gps.activityTask", PATROL: "gps.activityPatrol", TRACK: "gps.activityTrack" };
const activityColorMap = { CHECKIN: "green", CHECKOUT: "red", DURING_WORK: "purple", BREAK: "amber", RESUME: "blue", TASK: "blue", TRACK: "purple", PATROL: "gray" };

/** Component: shows "Location not available" when coords are missing. */
function MapViewButton({ lat, lng, label }) {
  if (!hasValidCoords(lat, lng)) {
    return <span className="text-xs text-gray-400">Location not available</span>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        openMapUrl(lat, lng);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
      title="Open in Google Maps"
    >
      <Navigation size={13} />
      {label || "View"}
    </button>
  );
}

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

// Activity filter options — limit to work-related activities only
const workFilterOptions = [
  { value: "CHECKIN", labelKey: "gps.activityCheckin" },
  { value: "DURING_WORK", labelKey: "gps.duringWork" },
  { value: "BREAK", labelKey: "gps.break" },
  { value: "RESUME", labelKey: "gps.resume" },
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
  const [currentPos, setCurrentPos] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [watchError, setWatchError] = useState(null);
  const watchId = useRef(null);
  const wsCleanup = useRef(null);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPing, setEditingPing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [allRecentPings, setAllRecentPings] = useState([]);
  const [historyPings, setHistoryPings] = useState([]);
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
  // Map of task_id → farm name, to show Farm on pings that lack it
  const [taskFarmMap, setTaskFarmMap] = useState({});

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

      // Farm lookup for every task (incl. closed ones) — used as a fallback
      // for the Farm column when a ping row has no farm attached.
      const farmMap = {};
      for (const tk of tasks) {
        if (tk.farm_name) farmMap[String(tk.id)] = tk.farm_name;
      }
      setTaskFarmMap(farmMap);

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

  // Build the task→farm lookup used by the Task Work Entries table.
  useEffect(() => {
    if (!currentUser?.id) return;
    loadWorkTasks();
  }, [currentUser, loadWorkTasks]);

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
    // Load full history (unfiltered) — feeds the task-wise work entries
    pingRepo
      .list({ page_size: 200, ordering: "-recorded_at" })
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
          // Keep the task-wise work entries fresh too
          setHistoryPings((prev) => appendPing(prev, data));
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

  // Task-wise work entries: every Before/During/Completed Work ping that is
  // linked to a task, grouped per task (newest ping first within each group).
  const taskWorkGroups = (() => {
    const groups = {};
    for (const p of visibleHistoryPings) {
      if (!p.task) continue;
      const key = String(p.task);
      if (!groups[key]) groups[key] = { id: key, title: p.task_title || `#${key}`, entries: [] };
      groups[key].entries.push(p);
    }
    return Object.values(groups);
  })();

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
          </div>
        }
      />

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
            <span>{t("common.realtime")}</span>
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
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                openMapUrl(currentPos.lat, currentPos.lng);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm ring-1 ring-brand-200 hover:bg-brand-50"
            >
              <Navigation size={13} /> {t("common.viewOnMap")}
            </button>
          </div>
        ) : null}
        {watchError && (
          <div className="mt-3 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg ring-1 ring-amber-200">
            ⚠️ {watchError}
          </div>
        )}

      </Card>

      {/* Live Locations Table removed per request — all work entries now live in
          the "Task Work Entries" table below (grouped per task). */}
      {false && (
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
                  ) : hasValidCoords(r.latitude, r.longitude) ? (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          openMapUrl(r.latitude, r.longitude);
                        }}
                        className="text-brand-600 hover:underline"
                      >
                        {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
                      </button>
                    </span>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "farm",
                header: t("header.farm"),
                render: (r) => {
                  const farm = r.farm_name || taskFarmMap[String(r.task)];
                  return farm ? <span className="text-xs text-gray-600">{farm}</span> : "—";
                },
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
                render: (r) => <MapViewButton lat={r.latitude} lng={r.longitude} label={t("common.view")} />,
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
              // Attendance-era work entries (no task attached) stay off the
              // Location Map — attendance lives only on the Attendance page.
              if (["CHECKIN", "CHECKOUT", "DURING_WORK", "BREAK", "RESUME"].includes(r.activity) && !r.task) return false;
              if (filterUser && String(r.user) !== String(filterUser)) return false;
              if (filterActivity && r.activity !== filterActivity) return false;
              return true;
            })}
            empty={dateFrom || dateTo ? t("gps.noDataFound") : t("gps.noDataYet")}
          />
        </Card>
      )}


      {/* Task-wise work entries: Before / During / Completed Work per task */}
      <Card title={t("gps.taskWorkTitle")} className="mb-5">
        {taskWorkGroups.length === 0 ? (
          <p className="text-sm text-gray-400">{t("gps.noTaskWork")}</p>
        ) : (
          <div className="space-y-4">
            {taskWorkGroups.map((g) => (
              <div key={g.id} className="rounded-xl p-3 ring-1 ring-gray-100">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                  {g.title}
                  <Badge color={g.entries.some((e) => e.activity === "CHECKOUT") ? "green" : "blue"}>
                    {g.entries.some((e) => e.activity === "CHECKOUT")
                      ? t("gps.completedWork")
                      : t("gps.duringWork")}
                  </Badge>
                </h4>
                <Table
                  columns={[
                    {
                      key: "activity",
                      header: t("gps.activityLabel"),
                      render: (r) => (
                        <Badge color={activityColorMap[r.activity] || "gray"}>
                          {t(activityLabelMap[r.activity] || r.activity)}
                        </Badge>
                      ),
                    },
                    {
                      key: "user_name",
                      header: t("header.user"),
                      render: (r) => r.user_name || r.user,
                    },
                    {
                      key: "photo",
                      header: t("header.photo"),
                      render: (r) => <PhotoWithFallbackInline url={r.photo} noPhotoLabel={t("gps.noPhoto")} />,
                    },
                    {
                      key: "location",
                      header: t("farmDetail.location"),
                      render: (r) =>
                        r.location_name ? (
                          <span className="block max-w-[220px] truncate text-xs text-gray-600" title={r.location_name}>
                            {r.location_name}
                          </span>
                        ) : hasValidCoords(r.latitude, r.longitude) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              openMapUrl(r.latitude, r.longitude);
                            }}
                            className="text-xs text-brand-600 hover:underline"
                          >
                            {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
                          </button>
                        ) : (
                          "—"
                        ),
                    },
                    {
                      key: "farm",
                      header: t("header.farm"),
                      render: (r) => {
                        const farm = r.farm_name || taskFarmMap[String(r.task)];
                        return farm ? <span className="text-xs text-gray-600">{farm}</span> : "—";
                      },
                    },
                    {
                      key: "recorded_at",
                      header: t("header.time"),
                      render: (r) =>
                        r.recorded_at ? (
                          <span className="flex items-center gap-1 text-xs text-gray-600">
                            <Clock size={11} />
                            {new Date(r.recorded_at).toLocaleString()}
                          </span>
                        ) : (
                          "—"
                        ),
                    },
                    {
                      key: "notes",
                      header: t("tasks.notes", "Notes"),
                      render: (r) => r.notes ? (
                        <span className="block max-w-[200px] truncate text-xs text-gray-600" title={r.notes}>{r.notes}</span>
                      ) : (
                        "—"
                      ),
                    },
                    {
                      key: "map",
                      header: t("common.openInMaps"),
                      render: (r) => <MapViewButton lat={r.latitude} lng={r.longitude} label={t("common.view")} />,
                    },
                  ]}
                  rows={g.entries}
                  empty={t("gps.noTaskWork")}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

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
                  <option value="DURING_WORK">{t("gps.duringWork")}</option>
                  <option value="BREAK">{t("gps.break")}</option>
                  <option value="RESUME">{t("gps.resume")}</option>
                  <option value="CHECKOUT">{t("gps.activityCheckout")}</option>
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
