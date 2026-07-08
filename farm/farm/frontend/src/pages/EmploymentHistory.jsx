import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { api } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const color = { JOINED: "green", PROMOTED: "blue", TRANSFERRED: "yellow", DESIGNATION_CHANGE: "blue", TERMINATED: "red", OTHER: "gray" };

export default function EmploymentHistory() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const canDelete = hasRole("SUPER_ADMIN"); // only super admin may delete
  const [reloadKey, setReloadKey] = useState(0);

  const EVENTS = [
    { value: "JOINED", label: t("employmentHistory.joined") },
    { value: "PROMOTED", label: t("employmentHistory.promoted") },
    { value: "TRANSFERRED", label: t("employmentHistory.transferred") },
    { value: "DESIGNATION_CHANGE", label: t("employmentHistory.designationChange") },
    { value: "TERMINATED", label: t("employmentHistory.terminated") },
    { value: "OTHER", label: t("employmentHistory.other") },
  ];

  const handleRemoveAll = async () => {
    if (!confirm(t("employmentHistory.confirmRemoveAll"))) return;
    if (!confirm(t("employmentHistory.confirmRemoveAllFinal"))) return;
    try {
      await api.delete("/workforce/employment-history/remove_all/");
      setReloadKey((k) => k + 1);
    } catch {
      // ignore
    }
  };

  return (
    <CrudResource
      key={reloadKey}
      title={t("employmentHistory.titlePg")}
      subtitle={t("employmentHistory.subtitlePg")}
      path="workforce/employment-history"
      canWrite={canWrite}
      showFarmFilter
      showEmployeeFilter
      extraToolbar={canDelete ? (
        <Button variant="danger" onClick={handleRemoveAll}>
          <Trash2 size={15} />
          {t("employmentHistory.removeAll")}
        </Button>
      ) : null}
      columns={[
        { key: "employee_name", header: t("header.employee") },
        { key: "farm_name", header: t("header.farm") },
        { key: "event_type", header: t("header.event"), render: (r) => <Badge color={color[r.event_type] || "gray"}>{r.event_type_display || r.event_type}</Badge> },
        { key: "designation", header: t("header.designation"), render: (r) => r.designation || "—" },
        { key: "department_name", header: t("header.department"), render: (r) => r.department_name || "—" },
        { key: "effective_date", header: t("header.effective") },
        { key: "notes", header: t("header.notes"), render: (r) => r.notes || "—" },
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
      ]}
      fields={[
        { name: "employee", label: t("employmentHistory.employee"), optionsFrom: { path: "workforce/employees", label: (e) => e.name }, required: true },
        { name: "event_type", label: t("employmentHistory.event"), type: "select", options: EVENTS, required: true },
        { name: "designation", label: t("employmentHistory.designation") },
        { name: "department", label: t("employmentHistory.department"), optionsFrom: { path: "workforce/departments", label: (d) => d.name } },
        { name: "effective_date", label: t("employmentHistory.effectiveDate"), type: "date", required: true },
        { name: "notes", label: t("employmentHistory.notes"), type: "textarea" },
      ]}
    />
  );
}
