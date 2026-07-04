import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const typeColor = { PEST: "red", DISEASE: "red", NUTRIENT: "yellow", WEATHER: "blue", GROWTH: "green" };
const sevColor = { LOW: "gray", MEDIUM: "yellow", HIGH: "red" };

export default function AgronomyObservations() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  const TYPES = [
    { value: "PEST", label: t("agronomyObs.typePest") },
    { value: "DISEASE", label: t("agronomyObs.typeDisease") },
    { value: "NUTRIENT", label: t("agronomyObs.typeNutrient") },
    { value: "WEATHER", label: t("agronomyObs.typeWeather") },
    { value: "GROWTH", label: t("agronomyObs.typeGrowth") },
  ];

  const typeLabelMap = {
    PEST: "agronomyObs.typePest",
    DISEASE: "agronomyObs.typeDisease",
    NUTRIENT: "agronomyObs.typeNutrient",
    WEATHER: "agronomyObs.typeWeather",
    GROWTH: "agronomyObs.typeGrowth",
  };
  const sevLabelMap = {
    LOW: "agronomyObs.severityLow",
    MEDIUM: "agronomyObs.severityMedium",
    HIGH: "agronomyObs.severityHigh",
  };

  return (
    <CrudResource
      title={t("agronomyObs.titlePg")}
      subtitle={t("agronomyObs.subtitlePg")}
      path="agronomy/observations"
      canWrite={canWrite}
      columns={[
        { key: "title", header: t("header.title") },
        { key: "crop_name", header: t("header.crop") },
        { key: "observation_type", header: t("header.type"), render: (r) => <Badge color={typeColor[r.observation_type] || "gray"}>{t(typeLabelMap[r.observation_type] || r.observation_type)}</Badge> },
        { key: "severity", header: t("header.severity"), render: (r) => <Badge color={sevColor[r.severity] || "gray"}>{t(sevLabelMap[r.severity] || r.severity)}</Badge> },
        {
          key: "photo",
          header: t("header.photo"),
          render: (r) =>
            r.photo_url ? (
              <a href={r.photo_url} target="_blank" rel="noreferrer">
                <img
                  src={r.photo_url}
                  alt={t("agronomyObs.photo")}
                  className="h-12 w-12 rounded object-cover ring-1 ring-gray-200"
                />
              </a>
            ) : (
              <span className="text-gray-400">—</span>
            ),
        },
        { key: "observed_on", header: t("header.observed"), render: (r) => r.observed_on || "—" },
      ]}
      fields={[
        { name: "crop", label: t("header.crop"), optionsFrom: { path: "agronomy/crops", label: (c) => `${c.name} ${c.variety || ""}`.trim() }, required: true },
        { name: "farm", label: t("header.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "observation_type", label: t("agronomyObs.fieldType"), type: "select", options: TYPES, required: true },
        { name: "severity", label: t("agronomyObs.fieldSeverity"), type: "select", options: ["LOW", "MEDIUM", "HIGH"] },
        { name: "title", label: t("agronomyObs.fieldTitle"), required: true },
        { name: "description", label: t("agronomyObs.fieldDescription"), type: "textarea" },
        { name: "observed_on", label: t("agronomyObs.fieldObservedOn"), type: "date" },
        { name: "latitude", label: t("agronomyObs.fieldLatitude"), type: "number" },
        { name: "longitude", label: t("agronomyObs.fieldLongitude"), type: "number" },
      ]}
    />
  );
}
