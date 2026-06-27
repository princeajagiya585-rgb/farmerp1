import { useTranslation } from "react-i18next";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Check, CheckCheck, History, Bell, Filter, X } from "lucide-react";
import { PageHeader, Button, Table, Badge, Select } from "../components/ui";
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

const typeBadge = {
  TASK: "blue",
  PAYROLL: "purple",
  INVENTORY: "yellow",
  APPROVAL: "red",
  ALERT: "red",
  INFO: "gray",
};

const NOTIF_TYPES = ["TASK", "PAYROLL", "INVENTORY", "APPROVAL", "ALERT", "INFO"];

export default function Notifications() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("CURRENT");
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
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

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: prepend new notifications as they arrive
  useEffect(() => {
    if (!tokenStore.access) return;
    const cleanup = connectNotificationStream({
      onMessage: (notif) => {
        playNotificationSound(notif.notification_type);
        setItems((prev) => [notif, ...prev]);
      },
    });
    return cleanup;
  }, []);

  const dismiss = async (id) => {
    await repo.action(id, "mark_read");
    // Mark as read locally so it disappears from Current but stays in History
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllRead = async () => {
    await api.post("/notifications/mark_all_read/");
    // Mark all as read locally — Current clears, History keeps everything
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    // Notify bell to update its badge + clear its list
    window.dispatchEvent(new CustomEvent("notifications-read"));
  };

  const clearFilters = () => {
    setTypeFilter("");
    setDateFrom("");
    setDateTo("");
  };

  // Current = unread notifications only
  const currentRows = items.filter((n) => !n.is_read);

  // History = filtered by type + date range
  const historyRows = useMemo(() => {
    let filtered = items;
    if (typeFilter) {
      filtered = filtered.filter((n) => n.notification_type === typeFilter);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      filtered = filtered.filter((n) => n.created_at && new Date(n.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999); // end of day
      filtered = filtered.filter((n) => n.created_at && new Date(n.created_at) <= to);
    }
    return filtered;
  }, [items, typeFilter, dateFrom, dateTo]);

  const rows = tab === "CURRENT" ? currentRows : historyRows;
  const hasActiveFilters = typeFilter || dateFrom || dateTo;

  return (
    <div>
      <PageHeader
        title={t("notifications.titlePg")}
        subtitle={t("notifications.subtitlePg")}
        action={
          tab === "CURRENT" && currentRows.length > 0 && (
            <Button variant="secondary" onClick={markAllRead}>
              <CheckCheck size={16} /> Dismiss all
            </Button>
          )
        }
      />

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("CURRENT")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
            tab === "CURRENT"
              ? "bg-brand-600 text-white"
              : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
          }`}
        >
          <Bell size={15} />
          Current
          {currentRows.length > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-[11px] font-bold">
              {currentRows.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("HISTORY")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
            tab === "HISTORY"
              ? "bg-brand-600 text-white"
              : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
          }`}
        >
          <History size={15} />
          History
          <span className="ml-1 text-xs opacity-70">({historyRows.length})</span>
        </button>
      </div>

      {/* Filters — visible only in History tab */}
      {tab === "HISTORY" && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Filter size={15} />
            Filters
          </div>
          <Select
            label="Type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="min-w-[150px]"
          >
            <option value="">All Types</option>
            {NOTIF_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-red-600"
            >
              <X size={15} />
              Clear
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <Table
          columns={[
            {
              key: "type",
              header: t("header.type"),
              render: (r) => (
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      dotColor[r.notification_type] || dotColor.INFO
                    }`}
                  />
                  <Badge color={typeBadge[r.notification_type] || "gray"}>
                    {r.notification_type}
                  </Badge>
                </div>
              ),
            },
            {
              key: "title",
              header: t("header.title"),
              render: (r) => (
                <div>
                  <div className="font-semibold text-gray-800">{r.title}</div>
                  {r.body && <div className="text-xs text-gray-500">{r.body}</div>}
                </div>
              ),
            },
            {
              key: "created_at",
              header: t("header.time"),
              render: (r) =>
                r.created_at ? new Date(r.created_at).toLocaleString() : "",
            },
            {
              key: "is_read",
              header: t("header.status"),
              render: (r) =>
                r.is_read ? (
                  <Badge color="gray">Read</Badge>
                ) : (
                  <Badge color="blue">Unread</Badge>
                ),
            },
            {
              key: "actions",
              header: "",
              render: (r) =>
                tab === "CURRENT" && !r.is_read ? (
                  <button
                    onClick={() => dismiss(r.id)}
                    className="rounded p-1.5 text-green-600 hover:bg-green-50"
                    title={t("common.dismiss")}
                  >
                    <Check size={15} />
                  </button>
                ) : null,
            },
          ]}
          rows={loading ? [] : rows}
          empty={
            loading
              ? "Loading…"
              : tab === "CURRENT"
              ? "No new notifications. All caught up! 🎉"
              : "No notification history yet."
          }
        />
      </div>
    </div>
  );
}
