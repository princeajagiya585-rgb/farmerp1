import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { Badge, Select } from "../components/ui";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const repo = resource("payroll/advances");
const money = (v) => (v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);

export default function PayrollAdvances() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const [farms, setFarms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [advFilterFarm, setAdvFilterFarm] = useState("");
  const [advFilterStatus, setAdvFilterStatus] = useState("");
  const [advFilterEmp, setAdvFilterEmp] = useState("");

  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));
  }, []);

  useEffect(() => {
    const params = { page_size: 200, ...(advFilterFarm ? { farm: advFilterFarm } : {}) };
    resource("workforce/employees").list(params).then((d) => setEmployees(d.results || d));
  }, [advFilterFarm]);

  return (
    <CrudResource
      title={t("payrollAdvances.title")}
      subtitle={t("payrollAdvances.subtitle")}
      path="payroll/advances"
      canWrite={canWrite}
      fieldDependencies={[
        { watch: "employee", target: "farm", mapField: "farm" },
      ]}
      listParams={{ ...(advFilterFarm ? { farm: advFilterFarm } : {}), ...(advFilterStatus ? { status: advFilterStatus } : {}), ...(advFilterEmp ? { employee: advFilterEmp } : {}) }}
      extraToolbar={
        <div className="flex gap-2">
          <div className="min-w-[160px]">
            <Select value={advFilterFarm} onChange={(e) => { setAdvFilterFarm(e.target.value); setAdvFilterEmp(""); }}>
              <option value="">{t("workforce.allFarms")}</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[160px]">
            <Select value={advFilterEmp} onChange={(e) => setAdvFilterEmp(e.target.value)}>
              <option value="">{t("common.allEmployees")}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[140px]">
            <Select value={advFilterStatus} onChange={(e) => setAdvFilterStatus(e.target.value)}>
              <option value="">{t("common.allStatus")}</option>
              <option value="OUTSTANDING">Outstanding</option>
              <option value="CLEARED">Cleared</option>
            </Select>
          </div>
        </div>
      }
      footerColumns={["amount", "amount_repaid", "balance"]}
      columns={[
        { key: "employee_name", header: t("header.employee") },
        { key: "farm_name", header: t("header.farm"), render: (r) => r.farm_name || "—" },
        { key: "amount", header: t("header.amount"), render: (r) => money(r.amount) },
        { key: "amount_repaid", header: t("header.repaid"), render: (r) => money(r.amount_repaid) },
        { key: "balance", header: t("header.netPay"), render: (r) => <b>{money(r.balance)}</b> },
        { key: "date", header: t("header.date") },
        { key: "reason", header: t("header.reason"), render: (r) => r.reason || "—" },
        {
          key: "status",
          header: t("header.status"),
          render: (r) => (
            <Badge color={r.status === "CLEARED" ? "green" : "yellow"}>{r.status}</Badge>
          ),
        },
      ]}
      fields={[
        { name: "employee", label: t("header.employee"), optionsFrom: { path: "workforce/employees", label: (e) => e.name }, required: true },
        { name: "farm", label: t("header.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "amount", label: "Amount (₹)", type: "number", required: true },
        { name: "date", label: t("header.date"), type: "date", required: true },
        { name: "reason", label: t("header.reason"), type: "textarea" },
      ]}
    />
  );
}
