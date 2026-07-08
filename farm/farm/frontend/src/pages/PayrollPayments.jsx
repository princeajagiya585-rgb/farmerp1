import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { Badge, Select } from "../components/ui";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const money = (v) => (v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);

const MODES = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank" },
  { value: "UPI", label: "UPI" },
  { value: "CHEQUE", label: "Cheque" },
];
const modeColor = { CASH: "green", BANK: "blue", UPI: "blue", CHEQUE: "yellow" };

export default function PayrollPayments() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const [farms, setFarms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filterFarm, setFilterFarm] = useState("");
  const [filterMode, setFilterMode] = useState("");
  const [filterEmp, setFilterEmp] = useState("");

  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));
  }, []);

  useEffect(() => {
    const params = { page_size: 200, ...(filterFarm ? { farm: filterFarm } : {}) };
    resource("workforce/employees").list(params).then((d) => setEmployees(d.results || d));
  }, [filterFarm]);

  return (
    <CrudResource
      title={t("payrollPayments.title")}
      subtitle={t("payrollPayments.subtitle")}
      path="payroll/payments"
      showFarmFilter
      showEmployeeFilter
      showUserFilter
      canWrite={canWrite}
      fieldDependencies={[
        { watch: "employee", target: "farm", mapField: "farm" },
      ]}
      listParams={{ ...(filterFarm ? { farm: filterFarm } : {}), ...(filterMode ? { mode: filterMode } : {}), ...(filterEmp ? { employee: filterEmp } : {}) }}
      extraToolbar={
        <div className="flex gap-2">
          <div className="min-w-[160px]">
            <Select value={filterFarm} onChange={(e) => { setFilterFarm(e.target.value); setFilterEmp(""); }}>
              <option value="">{t("workforce.allFarms")}</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[160px]">
            <Select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)}>
              <option value="">{t("common.allEmployees")}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[140px]">
            <Select value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
              <option value="">{t("common.allStatus")}</option>
              {MODES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
        </div>
      }
      footerColumns={["amount"]}
      columns={[
        { key: "employee_name", header: t("header.employee") },
        { key: "farm_name", header: t("header.farm") },
        { key: "amount", header: t("header.amount"), render: (r) => <b>{money(r.amount)}</b> },
        { key: "date", header: t("header.date") },
        {
          key: "mode",
          header: t("header.mode"),
          render: (r) => <Badge color={modeColor[r.mode] || "gray"}>{r.mode}</Badge>,
        },
        { key: "reference", header: t("header.reference"), render: (r) => r.reference || "—" },
        { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
      ]}
      fields={[
        { name: "employee", label: "Employee", optionsFrom: { path: "workforce/employees", label: (e) => e.name }, required: true },
        { name: "farm", label: "Farm", optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "payslip", label: "Payslip (optional)", optionsFrom: { path: "payroll/payslips", label: (p) => `${p.employee_name} — ₹${p.net_pay}` } },
        { name: "amount", label: "Amount (₹)", type: "number", required: true },
        { name: "date", label: "Date", type: "date", required: true },
        { name: "mode", label: "Mode", type: "select", options: MODES },
        { name: "reference", label: "Reference / Txn No." },
      ]}
    />
  );
}
