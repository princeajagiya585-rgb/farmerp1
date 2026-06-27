import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Users, UserCheck, CalendarClock, Briefcase } from "lucide-react";
import { resource } from "../lib/api";
import { Card, PageHeader, Table } from "../components/ui";

const emp = resource("workforce/employees");

export default function WorkforceMonitor() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    emp.collectionAction("monitor").then(setData);
  }, []);

  const cards = [
    { label: t("workforceMonitor.activeWorkforce"), value: data?.total_active ?? "—", icon: Users, color: "from-brand-500 to-brand-700" },
    { label: t("workforceMonitor.allocatedToday"), value: data?.allocated_today ?? "—", icon: Briefcase, color: "from-blue-500 to-blue-700" },
    { label: t("workforceMonitor.onLeaveToday"), value: data?.on_leave_today ?? "—", icon: CalendarClock, color: "from-amber-500 to-amber-600" },
    { label: t("workforceMonitor.availableEstimate"), value: data?.available_estimate ?? "—", icon: UserCheck, color: "from-emerald-500 to-emerald-700" },
  ];

  return (
    <div>
      <PageHeader title={t("workforceMonitor.title")} subtitle={t("workforceMonitor.subtitle")} />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl bg-gradient-to-br ${c.color} p-5 text-white shadow-sm`}>
            <c.icon size={22} className="opacity-80" />
            <p className="mt-3 text-3xl font-bold">{c.value}</p>
            <p className="text-sm opacity-90">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={t("workforceMonitor.byCategory")}>
          <Table
            empty={t("workforceMonitor.noActiveWorkers")}
            columns={[
              { key: "category", header: t("header.category") },
              { key: "count", header: t("header.workers") },
            ]}
            rows={data?.by_category || []}
          />
        </Card>
        <Card title={t("workforceMonitor.byDepartment")}>
          <Table
            empty={t("workforceMonitor.noDepartments")}
            columns={[
              { key: "department", header: t("header.department") },
              { key: "count", header: t("header.workers") },
            ]}
            rows={data?.by_department || []}
          />
        </Card>
      </div>
    </div>
  );
}
