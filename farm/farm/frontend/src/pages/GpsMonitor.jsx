import { useTranslation } from "react-i18next";
import { useEffect, useState, useRef, useCallback } from "react";
import { Download, List, Navigation, ChevronLeft, ChevronRight, Camera } from "lucide-react";
import { resource, normalizePhotoUrl } from "../lib/api";
import { openMapUrl, hasValidCoords } from "../lib/maps";
import { Badge, Button, Card, PageHeader, Table } from "../components/ui";
import { exportExcel } from "../lib/export";
import { connectLocationStream } from "../lib/realtime";

const acts = resource("gps/activities");
const PAGE_SIZE = 25;
const statusColor = { SUBMITTED: "yellow", VERIFIED: "green", REJECTED: "red" };
const phaseColor = { BEFORE: "blue", DURING: "purple", COMPLETION: "green" };

function PhotoWithFallback({ src, alt, title, phase, onClick }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-gray-100 text-xs text-gray-400">
        <Camera size={14} />
      </span>
    );
  }
  return (
    <div className="relative group">
      <img
        src={src}
        alt={alt || "Photo"}
        className="h-10 w-10 object-cover rounded-md cursor-pointer ring-1 ring-gray-200"
        onClick={onClick}
        title={title}
        onError={() => setFailed(true)}
      />
      {phase && (
        <span
          className="absolute -top-1.5 -right-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-bold text-white ring-1 ring-white"
          style={{
            backgroundColor:
              phase === "BEFORE" ? "#2563eb" :
              phase === "DURING" ? "#9333ea" :
              phase === "COMPLETION" ? "#16a34a" : "#6b7280"
          }}
        >
          {phase === "BEFORE" ? "B" : phase === "DURING" ? "D" : phase === "COMPLETION" ? "C" : "?"}
        </span>
      )}
    </div>
  );
}

function renderPhotos(r) {
  const phases = Array.isArray(r.photos) ? r.photos : [];
  const hasMainPhoto = r.photo_url;
  if (!hasMainPhoto && phases.length === 0) {
    return (
      <span className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-gray-100 text-xs text-gray-400">
        <Camera size={14} />
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5 max-w-[180px]">
      {phases.length > 0 ? phases.map((p, i) => (
        <PhotoWithFallback
          key={i}
          src={normalizePhotoUrl(p.photo_url)}
          alt={p.phase_display || p.phase}
          title={p.phase_display || p.phase}
          phase={p.phase}
          onClick={() => window.open(normalizePhotoUrl(p.photo_url), "_blank")}
        />
      )) : hasMainPhoto ? (
        <PhotoWithFallback
          src={normalizePhotoUrl(r.photo_url)}
          alt="Activity"
          onClick={() => window.open(normalizePhotoUrl(r.photo_url), "_blank")}
        />
      ) : null}
    </div>
  );
}

export default function GpsMonitor() {
  const { t } = useTranslation();
  const [progress, setProgress] = useState([]);
  const [feed, setFeed] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsCount, setRecordsCount] = useState(0);
  const [recordsHasNext, setRecordsHasNext] = useState(false);
  const [wsStatus, setWsStatus] = useState("connecting");
  const wsCleanup = useRef(null);

  const loadAllRecords = useCallback(async (page = 1) => {
    setLoadingRecords(true);
    try {
      const data = await acts.list({ page, page_size: PAGE_SIZE });
      if (Array.isArray(data)) {
        setAllRecords(data);
        setRecordsCount(data.length);
        setRecordsHasNext(false);
      } else {
        setAllRecords(data.results || []);
        setRecordsCount(data.count ?? 0);
        setRecordsHasNext(Boolean(data.next));
      }
    } catch {
      // ignore
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  const goToPage = (page) => {
    setRecordsPage(page);
    loadAllRecords(page);
  };

  useEffect(() => {
    acts.collectionAction("field_progress").then((d) => setProgress(d.rows || [])).catch(() => {});
    acts.collectionAction("feed").then((d) => setFeed(Array.isArray(d) ? d : [])).catch(() => {});

    // ── Load records page 1 ───────────────────────────────────────
    loadAllRecords(1);

    // ── WebSocket for real-time updates ───────────────────────────
    wsCleanup.current = connectLocationStream({
      onMessage: () => {
        acts.collectionAction("feed").then((d) => setFeed(Array.isArray(d) ? d : [])).catch(() => {});
        acts.collectionAction("field_progress").then((d) => setProgress(d.rows || [])).catch(() => {});
        // Reset to page 1 on new data
        setRecordsPage(1);
        loadAllRecords(1);
      },
      onStatus: (status) => setWsStatus(status),
    });

    return () => {
      if (wsCleanup.current) wsCleanup.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader
        title={t("gpsMonitor.title")}
        subtitle={t("gpsMonitor.subtitle")}
        action={
          <div className="flex items-center gap-2">
            {wsStatus === "connected" && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                {t("gpsMonitor.live")}
              </span>
            )}
            {allRecords.length > 0 && (
              <Button variant="secondary" onClick={() => exportExcel(allRecords, [
                {key:"recorded_at",header:t("header.when")},{key:"user_name",header:t("header.worker")},{key:"description",header:t("header.activities")},
                {key:"latitude",header:t("header.latitude")},{key:"longitude",header:t("header.longitude")},
                {key:"field_name",header:t("header.field")},{key:"task_title",header:t("header.task")},
                {key:"location_verified",header:t("header.geofence")},{key:"status",header:t("header.status")}
              ], "all-activities.xlsx", t("gpsMonitor.allRecords"))}>
                <Download size={15} /> {t("common.excel")}
              </Button>
            )}
          </div>
        }
      />

      {/* ── Field Progress Tracking ─────────────────────────────────── */}
      <Card title={t("gpsMonitor.fieldProgress")} className="mb-5">
        <Table
          empty={t("gpsMonitor.noFieldActivity")}
          columns={[
            { key: "label", header: t("header.label") },
            { key: "total", header: t("header.total") },
            { key: "verified", header: t("header.verified") },
            { key: "submitted", header: t("header.pending") },
            { key: "rejected", header: t("header.rejected") },
            {
              key: "verified_pct",
              header: t("header.progress"),
              render: (r) => (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 rounded-full bg-gray-200">
                    <div className="h-2 rounded-full bg-brand-500" style={{ width: `${r.verified_pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500">{r.verified_pct}%</span>
                </div>
              ),
            },
          ]}
          rows={progress}
        />
      </Card>

      {/* ── Live Activity Feed ──────────────────────────────────────── */}
      <Card title={t("gpsMonitor.liveFeed")} className="mb-5">
        <Table
          empty={t("gpsMonitor.noRecentActivity")}
          columns={[
            { key: "recorded_at", header: t("header.when"), render: (r) => (r.recorded_at ? new Date(r.recorded_at).toLocaleString() : (r.created_at ? new Date(r.created_at).toLocaleString() : "—")) },
            { key: "user_name", header: t("header.worker"), render: (r) => r.user_name || r.user },
            { key: "description", header: t("header.activities") },
            {
              key: "photos",
              header: t("header.photo"),
              render: (r) => renderPhotos(r),
            },
            {
              key: "location_name",
              header: t("header.address"),
              render: (r) =>
                r.location_name ? (
                  <span className="max-w-[200px] truncate text-xs text-gray-600" title={r.location_name}>
                    {r.location_name}
                  </span>
                ) : r.latitude ? (
                  <span className="text-xs text-gray-400">{t("gps.resolving")}</span>
                ) : (
                  "—"
                ),
            },
            { key: "location_verified", header: t("header.location"), render: (r) => (r.location_verified === true ? <Badge color="green">{t("gps.inFence")}</Badge> : r.location_verified === false ? <Badge color="red">{t("gps.outside")}</Badge> : <span className="text-gray-400">—</span>) },
            { key: "status", header: t("header.status"), render: (r) => <Badge color={statusColor[r.status] || "gray"}>{r.status}</Badge> },
          ]}
          rows={feed}
        />
      </Card>

      {/* ── All Records ─────────────────────────────────────────────── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <List size={16} />
            {t("gpsMonitor.allRecords")}
          </span>
        }
      >
        {loadingRecords ? (
          <p className="py-8 text-center text-gray-400">{t("gpsMonitor.loadingRecords")}</p>
        ) : (
          <Table
            empty={t("gpsMonitor.noActivityRecords")}
            columns={[
              { key: "recorded_at", header: t("header.when"), render: (r) => (r.recorded_at ? new Date(r.recorded_at).toLocaleString() : "—") },
              { key: "user_name", header: t("header.worker"), render: (r) => r.user_name || r.user },
              { key: "description", header: t("header.activities") },
              { key: "field_name", header: t("header.field"), render: (r) => r.field_name || "—" },
              { key: "task_title", header: t("header.task"), render: (r) => r.task_title || "—" },
              {
                key: "photos",
                header: t("header.photo"),
                render: (r) => renderPhotos(r),
              },
              {
                key: "location_name",
                header: t("header.address"),
                render: (r) =>
                  r.location_name ? (
                    <span className="max-w-[180px] truncate text-xs text-gray-600" title={r.location_name}>
                      {r.location_name}
                    </span>
                  ) : r.latitude ? (
                    <span className="text-xs text-gray-400">{t("gps.resolving")}</span>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "latitude",
                header: t("header.coordinates"),
                render: (r) =>
                  r.latitude && r.longitude ? (
                    <span className="font-mono text-xs">
                      {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  ),
              },
              { key: "location_verified", header: t("header.geofence"), render: (r) => (r.location_verified === true ? <Badge color="green">{t("gps.inFence")}</Badge> : r.location_verified === false ? <Badge color="red">{t("gps.outside")}</Badge> : <span className="text-gray-400">—</span>) },
              { key: "status", header: t("header.status"), render: (r) => <Badge color={statusColor[r.status] || "gray"}>{r.status}</Badge> },
              {
                key: "map",
                header: t("header.map"),
                render: (r) =>
                  hasValidCoords(r.latitude, r.longitude) ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        openMapUrl(r.latitude, r.longitude);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                    >
                      <Navigation size={12} />
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">Location not available</span>
                  ),
              },
            ]}
            rows={allRecords}
          />
        )}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span>
            {recordsCount > 0
              ? t("common.recordsPageOf", {
                  count: recordsCount,
                  plural: recordsCount !== 1 ? "s" : "",
                  page: recordsPage,
                  total: Math.max(1, Math.ceil(recordsCount / PAGE_SIZE)),
                })
              : `${recordsCount} ${recordsCount !== 1 ? t("common.records") : t("common.record")}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={recordsPage <= 1}
              onClick={() => goToPage(recordsPage - 1)}
            >
              <ChevronLeft size={15} /> {t("gpsMonitor.prev")}
            </Button>
            <Button
              variant="secondary"
              disabled={!recordsHasNext}
              onClick={() => goToPage(recordsPage + 1)}
            >
              {t("gpsMonitor.next")} <ChevronRight size={15} />
            </Button>
            <Button variant="ghost" onClick={() => goToPage(1)}>
              {t("gpsMonitor.refresh")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
