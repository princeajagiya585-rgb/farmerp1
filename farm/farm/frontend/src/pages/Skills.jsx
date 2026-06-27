import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import CrudResource from "../components/CrudResource";
import { resource } from "../lib/api";
import { Badge, Card, Select, Table } from "../components/ui";

export default function Skills() {
  const { t } = useTranslation();

  // Skill selector state
  const [skillsList, setSkillsList] = useState([]);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [skillEmployees, setSkillEmployees] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const employeeColumns = [
    { key: "name", header: t("header.name") },
    {
      key: "category",
      header: t("header.category"),
      render: (r) => <Badge color="blue">{r.category === "EMPLOYEE" ? t("skills.employeeLabour") : t("skills.labour")}</Badge>,
    },
    { key: "designation", header: t("header.designation"), render: (r) => r.designation || "—" },
    { key: "department_name", header: t("header.department"), render: (r) => r.department_name || "—" },
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
    { key: "employment_type", header: t("header.type") },
    { key: "daily_wage", header: t("header.wage") },
  ];

  useEffect(() => {
    resource("workforce/skills").list({ page_size: 200 }).then((d) => setSkillsList(d.results || d || []));
    resource("workforce/employees").list({ page_size: 500 })
      .then((d) => setAllEmployees(d.results || d || []))
      .catch(() => {});
  }, []);

  // When skill is selected, filter employees by that skill
  useEffect(() => {
    if (!selectedSkillId) {
      setSkillEmployees([]);
      return;
    }
    setLoadingEmployees(true);
    // Use string comparison (supports both UUID and integer primary keys)
    const filtered = allEmployees.filter(
      (emp) => emp.skills?.some((sid) => String(sid) === String(selectedSkillId))
    );
    setSkillEmployees(filtered);
    setLoadingEmployees(false);
  }, [selectedSkillId, allEmployees]);

  const selectedSkillName = selectedSkillId
    ? skillsList.find((s) => s.id === selectedSkillId)?.name || ""
    : "";

  return (
    <div>
      <CrudResource
        title={t("skills.title")}
        subtitle={t("skills.subtitle")}
        path="workforce/skills"
        columns={[
          { key: "name", header: t("header.skill") },
          { key: "category", header: t("header.category"), render: (r) => (r.category ? <Badge color="blue">{r.category}</Badge> : "—") },
          {
            key: "employees",
            header: t("header.employeesWithSkill"),
            render: (r) => (
              <div className="flex flex-wrap gap-1">
                {(r.employees?.length
                  ? r.employees.map((emp) => (
                      <span key={emp.id} className="text-xs text-brand-700">
                        {emp.name}
                      </span>
                    ))
                  : "—")}
              </div>
            ),
          },
        ]}
        fields={[
          { name: "name", label: t("skills.skillName"), required: true },
          { name: "category", label: t("skills.categoryLabel") },
        ]}
      />

      {/* ── Employees by Skill Section ─────────────────────────────── */}
      <div className="mt-8">
        <Card title={t("skills.employeesBySkill")}>
          <div className="mb-4 flex items-center gap-3">
            <div className="w-72">
              <Select
                label={t("skills.selectSkill")}
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
              >
                <option value="">{t("skills.selectPlaceholder")}</option>
                {skillsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.category ? ` (${s.category})` : ""}
                  </option>
                ))}
              </Select>
            </div>
            {selectedSkillId && (
              <span className="mt-6 text-sm text-gray-500">
                {skillEmployees.length} {skillEmployees.length !== 1 ? t("common.employees") : t("common.employee")} {t("skills.withSkill")}: <strong>{selectedSkillName}</strong>
              </span>
            )}
          </div>

          {loadingEmployees ? (
            <p className="py-8 text-center text-gray-400">{t("skills.loadingEmployees")}</p>
          ) : selectedSkillId && skillEmployees.length === 0 ? (
            <p className="py-8 text-center text-gray-400">{t("skills.noEmployeesSkill")}</p>
          ) : selectedSkillId ? (
            <Table columns={employeeColumns} rows={skillEmployees} />
          ) : (
            <p className="py-8 text-center text-gray-400">{t("skills.selectSkillToView")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
