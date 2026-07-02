import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { MapPin } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Geofences() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("geofences.title")}
      subtitle={t("geofences.subtitle")}
      path="gps/geofences"
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
  );
}
