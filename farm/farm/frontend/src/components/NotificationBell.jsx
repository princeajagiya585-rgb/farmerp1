import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { resource, api, tokenStore } from "../lib/api";
import { connectNotificationStream } from "../lib/realtime";
import { playNotificationSound } from "../lib/sound";

const repo = resource("notifications");

const dotColor = {
  TASK: "bg-blue-500",
  PAYROLL: "bg-purple-500",
  INVENTORY: "bg-yellow-500",
  APPROVAL: "bg-red-500",
  ALERT: "bg-red-500",
  INFO: "bg-gray-400",
};

function relativeTime(value, t) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 60) return t("common.justNow");
  if (diff < 3600) return t("common.minutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("common.hoursAgo", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t("common.daysAgo", { count: Math.floor(diff / 86400) });
  return new Date(value).toLocaleDateString();
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const loadCount = useCallback(async () => {
    // Skip if not authenticated — avoids 401 errors on login page
    if (!tokenStore.access) return;
    try {
      const data = await repo.collectionAction("unread_count");
      setCount(data?.count ?? 0);
    } catch {
      /* ignore polling errors */
    }
  }, []);

  // Poll unread count on mount and every 30s.
  useEffect(() => {
    if (!tokenStore.access) return;
    loadCount();
    const id = setInterval(loadCount, 30000);
    return () => clearInterval(id);
  }, [loadCount]);

  // Listen for realtime notifications via WebSocket
  useEffect(() => {
    if (!tokenStore.access) return;
    const cleanup = connectNotificationStream({
      onMessage: (notif) => {
        playNotificationSound(notif.notification_type);
        setCount((c) => c + 1);
        // Prepend new notification to the dropdown list (if open)
        setItems((prev) => [notif, ...prev]);
      },
    });
    return cleanup;
  }, []);

  // Listen for manual dismiss-all from Notifications page
  useEffect(() => {
    const handler = () => {
      setCount(0);
      setItems([]);
    };
    window.addEventListener("notifications-read", handler);
    return () => window.removeEventListener("notifications-read", handler);
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await repo.list({ page: 1 });
      setItems(data?.results ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const onRowClick = async (n) => {
    if (!n.is_read) {
      try {
        await repo.action(n.id, "mark_read");
      } catch {
        /* ignore */
      }
      // Remove from dropdown immediately and update count
      setItems((prev) => prev.filter((x) => x.id !== n.id));
      setCount((c) => Math.max(0, c - 1));
    } else {
      // For already-read items, still close dropdown on click
      setItems((prev) => prev.filter((x) => x.id !== n.id));
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post("/notifications/mark_all_read/");
    } catch {
      /* ignore */
    }
    setCount(0);
    setItems([]); // Clear dropdown immediately
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100"
        title={t("common.notifications")}
        aria-label={t("common.notifications")}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-700">{t("common.notifications")}</span>
            <button
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <CheckCheck size={14} /> {t("common.markAllRead")}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">{t("common.loading")}</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                {t("common.noNotifications")}
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onRowClick(n)}
                  className={`flex w-full gap-2.5 border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50 ${
                    n.is_read ? "" : "bg-brand-50"
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                      dotColor[n.notification_type] || dotColor.INFO
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-800">
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="mt-0.5 block text-xs text-gray-500 line-clamp-2">
                        {n.body}
                      </span>
                    )}
                    <span className="mt-1 block text-[11px] text-gray-400">
                      {relativeTime(n.created_at, t)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-gray-100 px-4 py-2 text-center">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              {t("common.viewAll")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
