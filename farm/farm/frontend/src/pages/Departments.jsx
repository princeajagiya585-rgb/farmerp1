import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { UserPlus } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { resource } from "../lib/api";
import { Button, Input, Modal, Select } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const empRepo = resource("workforce/employees");

export default function Departments() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  const [empModal, setEmpModal] = useState(null); // { departmentId, departmentName }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [farms, setFarms] = useState([]);
  const [skills, setSkills] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d || []));
    resource("workforce/skills").list({ page_size: 200 }).then((d) => setSkills(d.results || d || []));
  }, []);

  const openAddEmployee = (deptId, deptName) => {
    setForm({
      category: "LABOUR",
      employment_type: "DAILY_WAGE",
      department: deptId,
      employee_code: `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    });
    setError("");
    setEmpModal({ departmentId: deptId, departmentName: deptName });
  };

  const closeModal = () => {
    setEmpModal(null);
    setForm({});
    setError("");
  };

  const saveEmployee = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      // Convert number fields
      ["daily_wage", "monthly_salary"].forEach((f) => {
        if (payload[f] !== "" && payload[f] != null) payload[f] = Number(payload[f]);
      });
      // Clean empty strings
      Object.keys(payload).forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      await empRepo.create(payload);
      closeModal();
      setReloadKey((k) => k + 1);
    } catch (e) {
      const d = e.response?.data;
      setError(typeof d === "object" ? JSON.stringify(d) : d || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <CrudResource
        key={reloadKey}
        title={t("departments.titlePg")}
        subtitle={t("departments.subtitlePg")}
        path="workforce/departments"
        canWrite={canWrite}
        columns={[
          { key: "name", header: t("header.name") },
          { key: "employee_count", header: t("header.employees") },
          {
            key: "employees",
            header: t("header.employeeList"),
            render: (r) => (
              <div className="flex flex-wrap gap-1">
                {(r.employees?.length
                  ? r.employees.map((emp) => (
                      <button
                        key={emp.id}
                        onClick={() => navigate("/workforce")}
                        className="text-xs text-brand-700 hover:underline"
                      >
                        {emp.name}
                      </button>
                    ))
                  : "—")}
              </div>
            ),
          },
          { key: "description", header: t("header.description"), render: (r) => r.description || "—" },
        ]}
        fields={[
          { name: "name", label: t("departments.name"), required: true },
          { name: "description", label: t("departments.descriptionLabel"), type: "textarea" },
        ]}
        rowActions={canWrite ? (row) => (
          <button
            onClick={() => openAddEmployee(row.id, row.name)}
            className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
            title={`${t("departments.addEmployee")} ${row.name}`}
          >
            <UserPlus size={15} />
          </button>
        ) : undefined}
      />

      {/* Add Employee Modal */}
      <Modal
        open={!!empModal}
        onClose={closeModal}
        title={`${t("departments.addEmployeeTo")} ${empModal?.departmentName || t("departments.department")}`}
      >
        <form onSubmit={saveEmployee} className="space-y-3">
          {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t("departments.firstName")}
              value={form.first_name || ""}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              required
            />
            <Input
              label={t("departments.lastName")}
              value={form.last_name || ""}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t("departments.category")}
              value={form.category || "LABOUR"}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="LABOUR">{t("workforce.labour")}</option>
              <option value="EMPLOYEE">Employee / Labour</option>
            </Select>
            <Select
              label={t("departments.employmentType")}
              value={form.employment_type || "DAILY_WAGE"}
              onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
            >
              <option value="DAILY_WAGE">{t("workforce.dailyWage")}</option>
              <option value="PERMANENT">{t("workforce.permanent")}</option>
              <option value="CONTRACT">{t("workforce.contract")}</option>
              <option value="SEASONAL">{t("workforce.seasonal")}</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t("departments.designation")}
              value={form.designation || ""}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
            />
            <Select
              label={t("departments.farm")}
              value={form.farm || ""}
              onChange={(e) => setForm({ ...form, farm: e.target.value })}
              required
            >
              <option value="">{t("common.placeholderSelect")} farm</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t("departments.dailyWage")}
              type="number"
              value={form.daily_wage || ""}
              onChange={(e) => setForm({ ...form, daily_wage: e.target.value })}
            />
            <Input
              label={t("departments.monthlySalary")}
              type="number"
              value={form.monthly_salary || ""}
              onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })}
            />
          </div>

          <Select
            label={t("departments.skills")}
            value={form.skills || []}
            onChange={(e) =>
              setForm({
                ...form,
                skills: Array.from(e.target.selectedOptions, (o) => o.value),
              })
            }
            multiple
          >
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.category ? ` (${s.category})` : ""}
              </option>
            ))}
          </Select>

          <Input
            label={t("departments.dateOfJoining")}
            type="date"
            value={form.date_of_joining || ""}
            onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              {t("departments.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("common.saving") : t("departments.addEmployee")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
