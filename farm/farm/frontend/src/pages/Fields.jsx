import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { useAuth } from "../context/AuthContext";

export default function Fields() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("fields.titlePg")}
      subtitle={t("fields.subtitlePg")}
      path="farms/fields"
      showFarmFilter
      canWrite={canWrite}
      columns={[
        { key: "name", header: t("header.name") },
        { key: "block_name", header: t("header.block"), render: (r) => r.block_name || "—" },
        { key: "farm_name", header: t("header.farm") },
        { key: "area", header: t("header.areaAcres") },
        { key: "soil_type", header: t("header.soilType") },
      ]}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "block_name", label: "Block" },
        { name: "farm", label: "Farm", optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "area", label: "Area (acres)", type: "number" },
        { name: "soil_type", label: "Soil Type" },
      ]}
    />
  );
}
