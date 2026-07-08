import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { useAuth } from "../context/AuthContext";

export default function LabourAllocation() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("labourAllocation.titlePg")}
      subtitle={t("labourAllocation.subtitlePg")}
      path="workforce/allocations"
      canWrite={canWrite}
      showFarmFilter
      showEmployeeFilter
      columns={[
        { key: "employee_name", header: t("header.employee") },
        { key: "farm_name", header: t("header.farm") },
        { key: "field_name", header: t("header.field"), render: (r) => r.field_name || "—" },

        { key: "date", header: t("header.date") },
        { key: "work_description", header: t("header.work"), render: (r) => r.work_description || "—" },
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
      ]}
      fields={[
        { name: "employee", label: t("labourAllocation.employee"), optionsFrom: { path: "workforce/employees", label: (e) => e.name }, required: true },
        { name: "farm", label: t("labourAllocation.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "field", label: t("labourAllocation.field"), optionsFrom: { path: "farms/fields", label: (f) => f.name } },
        { name: "date", label: t("labourAllocation.date"), type: "date", required: true },
        { name: "work_description", label: t("labourAllocation.workDescription"), type: "textarea" },
      ]}
      fieldDependencies={[
        { watch: "employee", target: "farm", mapField: "farm" }
      ]}
    />
  );
}
