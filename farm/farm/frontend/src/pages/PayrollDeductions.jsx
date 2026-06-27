import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CrudResource from "../components/CrudResource";
import { Badge, Select } from "../components/ui";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const money = (v) => (v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);

const TYPES = [
  { value: "PF", label: "Provident Fund" },
  { value: "ESI", label: "ESI" },
  { value: "LOAN", label: "Loan" },
  { value: "OTHER", label: "Other" },
];

export default function PayrollDeductions() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const [farms, setFarms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filterFarm, setFilterFarm] = useState("");
  const [filterType, setFilterType] = useState("");
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
      title={t("payrollDeductions.title")}
      subtitle={t("payrollDeductions.subtitle")}
      path="payroll/deductions"
      canWrite={canWrite}
      fieldDependencies={[
        { watch: "employee", target: "farm", mapField: "farm" },
      ]}
      listParams={{ ...(filterFarm ? { farm: filterFarm } : {}), ...(filterType ? { deduction_type: filterType } : {}), ...(filterEmp ? { employee: filterEmp } : {}) }}
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
          <div className="min-w-[150px]">
            <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">{t("common.allStatus")}</option>
              {TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
        </div>
      }
      footerColumns={["amount"]}
      columns={[
        { key: "employee_name", header: t("header.employee") },
        {
          key: "deduction_type",
          header: t("header.type"),
          render: (r) => <Badge color="blue">{r.deduction_type}</Badge>,
        },
        { key: "amount", header: t("header.amount"), render: (r) => money(r.amount) },
        { key: "date", header: t("header.date") },
        { key: "notes", header: t("header.notes"), render: (r) => r.notes || "—" },
      ]}
      fields={[
        { name: "employee", label: "Employee", optionsFrom: { path: "workforce/employees", label: (e) => e.name }, required: true },
        { name: "farm", label: "Farm", optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
        { name: "deduction_type", label: "Type", type: "select", options: TYPES, required: true },
        { name: "amount", label: "Amount (₹)", type: "number", required: true },
        { name: "date", label: "Date", type: "date", required: true },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
    />
  );
}
