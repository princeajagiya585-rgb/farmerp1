import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { useAuth } from "../context/AuthContext";

const stars = (n) => "★".repeat(Number(n) || 0) + "☆".repeat(Math.max(0, 5 - (Number(n) || 0)));

export default function Performance() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  return (
    <CrudResource
      title={t("performance.titlePg")}
      subtitle={t("performance.subtitlePg")}
      path="workforce/performance"
      canWrite={canWrite}
      columns={[
        { key: "employee_name", header: t("header.employee") },
        { key: "review_date", header: t("header.date") },
        { key: "period", header: t("header.period"), render: (r) => r.period || "—" },
        { key: "rating", header: t("header.rating"), render: (r) => <span className="text-amber-500" title={`${r.rating}/5`}>{stars(r.rating)}</span> },
        { key: "reviewer_name", header: t("header.reviewer"), render: (r) => r.reviewer_name || "—" },
        { key: "remarks", header: t("header.remarks"), render: (r) => r.remarks || "—" },
      ]}
      fields={[
        { name: "employee", label: t("performance.employee"), optionsFrom: { path: "workforce/employees", label: (e) => e.name }, required: true },
        { name: "review_date", label: t("performance.reviewDate"), type: "date", required: true },
        { name: "period", label: t("performance.period") },
        { name: "rating", label: t("performance.rating"), type: "select", options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}` })) },
        { name: "strengths", label: t("performance.strengths"), type: "textarea" },
        { name: "improvements", label: t("performance.improvements"), type: "textarea" },
        { name: "remarks", label: t("performance.remarks"), type: "textarea" },
      ]}
    />
  );
}
