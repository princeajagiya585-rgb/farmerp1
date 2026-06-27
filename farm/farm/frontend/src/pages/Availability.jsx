import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const color = { AVAILABLE: "green", ON_LEAVE: "yellow", ASSIGNED: "blue", UNAVAILABLE: "red" };

export default function Availability() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  const STATUS = [
    { value: "AVAILABLE", label: t("availability.available") },
    { value: "ON_LEAVE", label: t("availability.onLeave") },
    { value: "ASSIGNED", label: t("availability.assigned") },
    { value: "UNAVAILABLE", label: t("availability.unavailable") },
  ];

  return (
    <CrudResource
      title={t("availability.titlePg")}
      subtitle={t("availability.subtitlePg")}
      path="workforce/availability"
      canWrite={canWrite}
      columns={[
        { key: "employee_name", header: t("header.employee") },
        { key: "status", header: t("header.status"), render: (r) => <Badge color={color[r.status] || "gray"}>{r.status_display || r.status}</Badge> },
        { key: "start_date", header: t("header.started") },
        { key: "end_date", header: t("header.ended"), render: (r) => r.end_date || "—" },
        { key: "reason", header: t("header.reason"), render: (r) => r.reason || "—" },
      ]}
      fields={[
        { name: "employee", label: t("availability.employee"), optionsFrom: { path: "workforce/employees", label: (e) => e.name }, required: true },
        { name: "status", label: t("availability.status"), type: "select", options: STATUS, required: true },
        { name: "start_date", label: t("availability.fromDate"), type: "date", required: true },
        { name: "end_date", label: t("availability.toDate"), type: "date" },
        { name: "reason", label: t("availability.reason"), type: "textarea" },
      ]}
    />
  );
}
