import { useTranslation } from "react-i18next";
import { useEffect, useState, useMemo } from "react";
import { Eye, Filter, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import CrudResource from "../components/CrudResource";
import { Badge } from "../components/ui";
import { resource } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function Workforce() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const canViewFinance = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  // Filter state
  const [farmFilter, setFarmFilter] = useState("");
  const [empFilter, setEmpFilter] = useState(""); // selected employee's unique code
  const [deptFilter, setDeptFilter] = useState("");
  const [empTypeFilter, setEmpTypeFilter] = useState("");
  const EMPLOYMENT_TYPES = [
    { value: "PERMANENT", label: t("workforce.permanent") },
    { value: "CONTRACT", label: t("workforce.contract") },
    { value: "DAILY_WAGE", label: t("workforce.dailyWage") },
    { value: "SEASONAL", label: t("workforce.seasonal") },
  ];
  const [farms, setFarms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);

  // Load filter options
  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => {
      setFarms(Array.isArray(d) ? d : d.results || []);
    }).catch(() => {});
    resource("workforce/employees").list({ page_size: 500 }).then((d) => {
      setEmployees(Array.isArray(d) ? d : d.results || []);
    }).catch(() => {});
    resource("workforce/departments").list({ page_size: 200 }).then((d) => {
      setDepartments(Array.isArray(d) ? d : d.results || []);
    }).catch(() => {});
  }, []);

  // Build list params from active filters (memoized to avoid unnecessary re-fetches)
  const listParams = useMemo(() => {
    const params = {};
    if (farmFilter) params.farm = farmFilter;
    // Employee dropdown filters by the employee's unique code via search.
    if (empFilter) params.search = empFilter;
    if (deptFilter) params.department = deptFilter;
    if (empTypeFilter) params.employment_type = empTypeFilter;
    return params;
  }, [farmFilter, empFilter, deptFilter, empTypeFilter]);

  const hasActiveFilters = farmFilter || empFilter || deptFilter || empTypeFilter;

  return (
    <div>
      {/* Filter Bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <Filter size={16} className="text-gray-500" />
        <select
          value={farmFilter}
          onChange={(e) => setFarmFilter(e.target.value)}
          className="min-w-[180px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">{t("workforce.allFarms")}</option>
          {farms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          value={empFilter}
          onChange={(e) => setEmpFilter(e.target.value)}
          className="min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">{t("workforce.allEmployees")}</option>
          {employees.map((e) => (
            <option key={e.id} value={e.employee_code}>
              {e.name || e.employee_code}
            </option>
          ))}
        </select>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="min-w-[180px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">{t("workforce.allDepartments")}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={empTypeFilter}
          onChange={(e) => setEmpTypeFilter(e.target.value)}
          className="min-w-[160px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">{t("workforce.allTypes")}</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            onClick={() => { setFarmFilter(""); setEmpFilter(""); setDeptFilter(""); setEmpTypeFilter(""); }}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-red-600"
          >
            <X size={15} /> {t("workforce.clear")}
          </button>
        )}
      </div>

      <CrudResource
        title={t("workforce.title")}
        subtitle={t("workforce.subtitle")}
        path="workforce/employees"
        canWrite={canWrite}
        showFarmFilter
        hideDateFilter
        listParams={listParams}
        defaultValues={{ employee_code: `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` }}
        rowActions={(row) =>
          canViewFinance ? (
            <button
              onClick={() => navigate(`/workforce/${row.id}/financials`)}
              className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
              title={t("workforce.viewFinancialDetails")}
            >
              <Eye size={15} />
            </button>
          ) : null
        }
        footerColumns={["daily_wage", "monthly_salary"]}
        columns={[
            { key: "name", header: t("header.employee") },
            { key: "assigned_farms", header: t("users.assignedFarm"), render: (r) => r.assigned_farms?.length ? r.assigned_farms.join(", ") : "—" },
            { key: "category", header: t("header.category"), render: (r) => {
                const categoryLabels = {
                  SUPER_ADMIN: { color: "purple", label: t("role.superAdmin") },
                  MANAGER: { color: "purple", label: t("workforce.manager") },
                  SUPERVISOR: { color: "blue", label: t("workforce.supervisor") },
                  EMPLOYEE: { color: "blue", label: t("skills.employeeLabour") },
                  LABOUR: { color: "gray", label: t("skills.labour") },
                  DRIVER: { color: "gray", label: t("workforce.driver") },
                  SECURITY: { color: "gray", label: t("workforce.security") },
                  OFFICE_STAFF: { color: "gray", label: t("workforce.officeStaff") },
                  ACCOUNTANT: { color: "gray", label: t("workforce.accountant") },
                  TECHNICIAN: { color: "gray", label: t("workforce.technician") },
                };
                const cat = categoryLabels[r.category];
                return cat ? <Badge color={cat.color}>{cat.label}</Badge> : <Badge color="gray">{r.category || "—"}</Badge>;
            } },
            { key: "employment_type", header: t("header.type") },
            { key: "designation", header: t("header.designation"), render: (r) => r.designation || "—" },
            { key: "department_name", header: t("header.department"), render: (r) => r.department_name || "—" },
            { key: "daily_wage", header: t("header.wage") },
            {
              key: "skill_names",
              header: t("header.skills"),
              render: (r) =>
                r.skill_names?.length ? (
                  <div className="flex max-w-[200px] flex-wrap gap-1">
                    {r.skill_names.map((s, i) => (
                      <span key={i} className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  "—"
                ),
            },
            { key: "monthly_salary", header: t("workforce.monthlySalary"), render: (r) => r.monthly_salary && parseFloat(r.monthly_salary) > 0 ? `₹${parseFloat(r.monthly_salary).toLocaleString("en-IN")}` : "—" },
            { key: "date_of_joining", header: t("workforce.dateOfJoining"), render: (r) => r.date_of_joining || "—" },
          ]}
          fields={[
            { name: "name", label: t("workforce.fullName"), required: true },
            {
              name: "category",
              label: t("workforce.category"),
              type: "select",
              // If the employee has a linked user, category is auto-calculated
              // from the user's role (handled by the backend serializer), so
              // the field becomes read-only. Standalone employees (no linked
              // user) can have their category set manually by the admin.
              readonly: (row) => !!row?.user,
              options: [
                ...(hasRole("SUPER_ADMIN", "FARM_MANAGER") ? [
                  { value: "SUPER_ADMIN", label: t("role.superAdmin") },
                  { value: "MANAGER", label: t("workforce.manager") },
                  { value: "SUPERVISOR", label: t("workforce.supervisor") },
                  { value: "EMPLOYEE", label: t("skills.employeeLabour") },
                  { value: "LABOUR", label: t("workforce.labour") },
                  { value: "DRIVER", label: t("workforce.driver") },
                  { value: "SECURITY", label: t("workforce.security") },
                  { value: "OFFICE_STAFF", label: t("workforce.officeStaff") },
                  { value: "ACCOUNTANT", label: t("workforce.accountant") },
                  { value: "TECHNICIAN", label: t("workforce.technician") },
                ] : [
                  { value: "EMPLOYEE", label: t("skills.employeeLabour") },
                  { value: "LABOUR", label: t("workforce.labour") },
                  { value: "DRIVER", label: t("workforce.driver") },
                  { value: "SECURITY", label: t("workforce.security") },
                  { value: "TECHNICIAN", label: t("workforce.technician") },
                ]),
              ],
            },
            {
              name: "employment_type",
              label: t("workforce.employmentType"),
              type: "select",
              options: [
                { value: "PERMANENT", label: t("workforce.permanent") },
                { value: "CONTRACT", label: t("workforce.contract") },
                { value: "DAILY_WAGE", label: t("workforce.dailyWage") },
                { value: "SEASONAL", label: t("workforce.seasonal") },
              ],
            },
            { name: "designation", label: t("workforce.designation") },
            { name: "department", label: t("workforce.department"), optionsFrom: { path: "workforce/departments", label: (d) => d.name } },
            {
              name: "skills",
              label: t("header.skills"),
              type: "multiselect",
              optionsFrom: { path: "workforce/skills", label: (s) => s.name },
            },
            { name: "farm", label: t("workforce.farm"), optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
            { name: "daily_wage", label: t("workforce.dailyWage"), type: "number" },
            { name: "monthly_salary", label: t("workforce.monthlySalary"), type: "number" },
            { name: "date_of_joining", label: t("workforce.dateOfJoining"), type: "date" },
          ]}
      />
    </div>
  );
}
