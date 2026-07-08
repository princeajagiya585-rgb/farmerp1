import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Download, Route as RouteIcon, Navigation, MapPin } from "lucide-react";
import { resource } from "../lib/api";
import { Badge, Button, Card, Input, PageHeader, Select, Table } from "../components/ui";
import { exportExcel } from "../lib/export";
import LiveMap from "../components/LiveMap";
import { useAuth } from "../context/AuthContext";

const pings = resource("gps/pings");

export default function RouteTracking() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [user, setUser] = useState("");
  const [date, setDate] = useState("");
  const [route, setRoute] = useState(null);

  useEffect(() => {
    resource("auth/users").list({ page_size: 200 }).then((d) => setUsers(d.results || d)).catch(() => {});
    // Don't run on mount — wait for user to click Trace
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    const params = {};
    if (user) params.user = user;
    if (date) params.date = date;
    setRoute(await pings.collectionAction("route", params));
  };

  // Build the polyline path and start/end markers from the traced points.
  const points = route?.points || [];
  const routePath = points
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => [p.lat, p.lng]);
  const routeMarkers =
    routePath.length > 0
      ? [
          { id: "start", lat: routePath[0][0], lng: routePath[0][1], label: "Start", sublabel: points[0]?.recorded_at ? new Date(points[0].recorded_at).toLocaleString() : "" },
          { id: "end", lat: routePath[routePath.length - 1][0], lng: routePath[routePath.length - 1][1], label: "End", sublabel: points[points.length - 1]?.recorded_at ? new Date(points[points.length - 1].recorded_at).toLocaleString() : "" },
        ]
      : [];



  return (
    <div>
      <PageHeader
        title={t("routeTracking.title")}
        subtitle={t("routeTracking.subtitle")}
        action={
          route?.points?.length > 0 && (
            <Button variant="secondary" onClick={() => exportExcel(route.points, [{key:"recorded_at",header:t("header.time")},{key:"activity",header:t("header.activities")},{key:"lat",header:t("header.latitude")},{key:"lng",header:t("header.longitude")}], "route-points.xlsx", "Route Points")}>
              <Download size={15} /> Excel
            </Button>
          )
        }
      />
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <Select label={t("header.employee")} value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">All workers</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
            </Select>
          </div>
          <div className="w-44"><Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <Button onClick={run}><RouteIcon size={15} /> Trace Route</Button>
          {route && (
            <span className="text-sm text-gray-500">
              {route.count} points · <b>{(route.total_distance_m / 1000).toFixed(2)} km</b>
            </span>
          )}
        </div>
      </Card>

      <Card title={t("routeTracking.routeMap")} className="mb-5">
        <LiveMap
          height={420}
          path={routePath}
          markers={routeMarkers}
        />
      </Card>        <Card title={t("routeTracking.trackPoints")}>
        <Table
          empty="No pings for this selection."
          columns={[
            { key: "recorded_at", header: t("header.time"), render: (r) => (r.recorded_at ? new Date(r.recorded_at).toLocaleString() : "—") },
            { key: "activity", header: t("header.activities"), render: (r) => <Badge color={r.activity === "CHECKIN" ? "green" : r.activity === "TASK" ? "blue" : "gray"}>{r.activity || "—"}</Badge> },
            {
              key: "lat_lng",
              header: `${t("header.latitude")},${t("header.longitude")}`,
              render: (r) =>
                r.lat != null && r.lng != null ? (
                  <span className="font-mono text-xs font-medium">{r.lat.toFixed(6)},{r.lng.toFixed(6)}</span>
                ) : (
                  "—"
                ),
            },
            {
              key: "map_url",
              header: t("header.map"),
              render: (r) =>
                r.lat ? (
                  <a
                    href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                  >
                    <Navigation size={12} /> View
                  </a>
                ) : (
                  "—"
                ),
            },
          ]}
          rows={route?.points || []}
        />
      </Card>
    </div>
  );
}
