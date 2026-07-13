import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { MapPin } from "lucide-react";
import { Card } from "../components/ui";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function Geofences() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const [farms, setFarms] = useState([]);

  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d)).catch(() => {});
  }, []);

  const corner = (pts, i) => {
    const p = Array.isArray(pts) ? pts[i] : null;
    return p && p[0] != null && p[1] != null ? (
      <span className="font-mono text-[11px]">{Number(p[0]).toFixed(6)}, {Number(p[1]).toFixed(6)}</span>
    ) : (
      <span className="text-gray-300">—</span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Farm areas defined by their 4 boundary corners (used for attendance). */}
      <Card title="Farm Areas — 4 Corner Lat / Lng">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500">
                <th className="py-2 pr-3">{t("header.farm")}</th>
                <th className="py-2 pr-3">Center Lat / Lng</th>
                <th className="py-2 pr-3">Corner 1</th>
                <th className="py-2 pr-3">Corner 2</th>
                <th className="py-2 pr-3">Corner 3</th>
                <th className="py-2 pr-3">Corner 4</th>
              </tr>
            </thead>
            <tbody>
              {farms.map((f) => (
                <tr key={f.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-medium text-gray-800">{f.name}</td>
                  <td className="py-2 pr-3">
                    {f.latitude && f.longitude ? (
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <MapPin size={11} className="text-brand-500" />
                        {Number(f.latitude).toFixed(6)}, {Number(f.longitude).toFixed(6)}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 pr-3">{corner(f.geofence, 0)}</td>
                  <td className="py-2 pr-3">{corner(f.geofence, 1)}</td>
                  <td className="py-2 pr-3">{corner(f.geofence, 2)}</td>
                  <td className="py-2 pr-3">{corner(f.geofence, 3)}</td>
                </tr>
              ))}
              {farms.length === 0 && (
                <tr><td colSpan={6} className="py-3 text-center text-gray-400">—</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CrudResource
        title={t("geofences.title")}
        subtitle={t("geofences.subtitle")}
        path="gps/geofences"
        showFarmFilter
        canWrite={canWrite}
        // Auto-refresh removed to avoid Railway 429 rate limits.
        // Data changes infrequently (geofences are rarely modified).
        columns={[
          { key: "farm_name", header: t("header.farm") },
          {
            key: "center_lat",
            header: "Center Latitude / Longitude",
            render: (r) =>
              r.center_lat && r.center_lng ? (
                <span className="flex items-center gap-1.5 text-xs">
                  <MapPin size={12} className="text-brand-500" />
                  <span className="font-mono">
                    {Number(r.center_lat).toFixed(6)}, {Number(r.center_lng).toFixed(6)}
                  </span>
                </span>
              ) : (
                <span className="text-gray-400">—</span>
              ),
          },
        ]}
        fields={[
          { name: "farm", label: t("geofences.fieldFarm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        ]}
      />
    </div>
  );
}
