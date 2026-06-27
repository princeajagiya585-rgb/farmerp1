import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Cog, Download, Pencil, Trash2 } from "lucide-react";
import { resource } from "../lib/api";
import { exportExcel } from "../lib/export";
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Table } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const periodRepo = resource("payroll/periods");
const slipRepo = resource("payroll/payslips");
const advRepo = resource("payroll/advances");

const statusLabelMap = {
  DRAFT: "statusDraft",
  GENERATED: "statusGenerated",
  PAID: "statusPaid",
  CLEARED: "statusCleared",
  OUTSTANDING: "statusOutstanding",
};

const statusColorMap = {
  PAID: "green",
  GENERATED: "blue",
  DRAFT: "gray",
  CLEARED: "green",
};

export default function Payroll() {
  const { t, i18n } = useTranslation();
  const { hasRole } = useAuth();
  const canRun = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const canDelete = hasRole("SUPER_ADMIN"); // only super admin may delete
  const [periods, setPeriods] = useState([]);
  const [slips, setSlips] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [farms, setFarms] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ farm: "", month: new Date().getMonth() + 1, year: new Date().getFullYear() });
  const [msg, setMsg] = useState("");
  const [filterFarm, setFilterFarm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterYear, setFilterYear] = useState("");
  // Payslip-specific filters
  const [slipFilterEmp, setSlipFilterEmp] = useState("");
  const [slipFilterStatus, setSlipFilterStatus] = useState("");
  const [employees, setEmployees] = useState([]);
  // Advances-specific filters
  const [advFilterStatus, setAdvFilterStatus] = useState("");
  const [advFilterEmp, setAdvFilterEmp] = useState("");

  // Edit modals
  const [editPeriod, setEditPeriod] = useState(null);
  const [editPeriodForm, setEditPeriodForm] = useState({});
  const [editAdv, setEditAdv] = useState(null);
  const [editAdvForm, setEditAdvForm] = useState({});
  const [editSlip, setEditSlip] = useState(null);
  const [editSlipForm, setEditSlipForm] = useState({});
  // Half Pay (partial advance repayment) modal
  const [halfPaySlip, setHalfPaySlip] = useState(null);
  const [halfPayAmount, setHalfPayAmount] = useState("");
  const [halfPaySaving, setHalfPaySaving] = useState(false);
  const [halfPayError, setHalfPayError] = useState("");

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(0, i).toLocaleString(i18n.language, { month: "long" }),
  }));

  const STATUS_OPTIONS = [
    { value: "DRAFT", label: t("payroll.statusDraft") },
    { value: "GENERATED", label: t("payroll.statusGenerated") },
    { value: "PAID", label: t("payroll.statusPaid") },
    { value: "CLEARED", label: t("payroll.statusCleared") },
  ];

  const SLIP_STATUS_OPTIONS = [
    { value: "DRAFT", label: t("payroll.statusDraft") },
    { value: "PAID", label: t("payroll.statusPaid") },
  ];

  const ADV_STATUS_OPTIONS = [
    { value: "OUTSTANDING", label: t("payroll.statusOutstanding") },
    { value: "CLEARED", label: t("payroll.statusCleared") },
  ];

  const load = () => {
    const baseParams = filterFarm ? { farm: filterFarm } : {};

    // Always refresh the farm list so every farm (incl. newly created ones)
    // shows up in the filter & new-period dropdowns.
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));

    // Periods
    periodRepo.list({ ...baseParams, ...(filterStatus ? { status: filterStatus } : {}), ...(filterYear ? { year: filterYear } : {}) }).then((d) => setPeriods(d.results || d));

    // Payslips with its own filters
    const slipParams = { ...baseParams };
    if (slipFilterEmp) slipParams.employee = slipFilterEmp;
    if (slipFilterStatus) slipParams.status = slipFilterStatus;
    slipRepo.list(slipParams).then((d) => setSlips(d.results || d));

    // Advances with its own filters
    const advParams = { ...baseParams };
    if (advFilterStatus) advParams.status = advFilterStatus;
    if (advFilterEmp) advParams.employee = advFilterEmp;
    advRepo.list(advParams).then((d) => setAdvances(d.results || d));
  };
  useEffect(() => {
    load();
    resource("workforce/employees").list({ page_size: 200 }).then((d) => setEmployees(d.results || d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (farmId) => {
    setFilterFarm(farmId);
  };

  // Re-load when any filter changes
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFarm, filterStatus, filterYear, slipFilterEmp, slipFilterStatus, advFilterStatus, advFilterEmp]);

  const createPeriod = async (e) => {
    e.preventDefault();
    await periodRepo.create({ ...form, month: Number(form.month), year: Number(form.year) });
    setOpen(false);
    load();
  };

  const generate = async (id) => {
    setMsg(t("payroll.generating"));
    try {
      const res = await periodRepo.action(id, "generate");
      setMsg(t("payroll.generationResult", {
        created: res.created ?? 0,
        net: Math.round(Number(res.total_net || 0)).toLocaleString("en-IN"),
      }));
      load();
    } catch (e) {
      setMsg(e.response?.data?.detail || t("payroll.generationFailed"));
    }
  };

  const deletePeriod = async (id) => {
    if (!confirm(t("crud.confirmDelete"))) return;
    await periodRepo.remove(id);
    load();
  };

  const savePeriod = async (e) => {
    e.preventDefault();
    await periodRepo.update(editPeriod.id, { status: editPeriodForm.status });
    setEditPeriod(null);
    load();
  };

  const deleteAdv = async (id) => {
    if (!confirm(t("crud.confirmDelete"))) return;
    await advRepo.remove(id);
    load();
  };

  const deleteSlip = async (id) => {
    if (!confirm(t("crud.confirmDelete"))) return;
    await slipRepo.remove(id);
    load();
  };

  // Mark a payslip Done (PAID) or Due (DRAFT / unpaid)
  const markSlip = async (slip, status) => {
    const prompt = status === "PAID" ? t("payroll.confirmPaid") : t("payroll.confirmDue");
    if (!confirm(prompt)) return;
    await slipRepo.update(slip.id, { status });
    load();
  };

  const openHalfPay = (slip) => {
    setHalfPaySlip(slip);
    setHalfPayAmount("");
    setHalfPayError("");
  };

  const doHalfPay = async () => {
    const amt = Number(halfPayAmount);
    if (!amt || amt <= 0) { setHalfPayError(t("payroll.halfPayInvalid")); return; }
    setHalfPaySaving(true);
    setHalfPayError("");
    try {
      await slipRepo.action(halfPaySlip.id, "half_pay", { amount: amt });
      setHalfPaySlip(null);
      load();
    } catch (err) {
      setHalfPayError(err.response?.data?.detail || t("common.saveFailed"));
    } finally {
      setHalfPaySaving(false);
    }
  };

  // Net pay always = wage + overtime + incentive − advances − deductions
  const computeNet = (f) =>
    (Number(f.gross_wage) || 0) +
    (Number(f.overtime_amount) || 0) +
    (Number(f.incentive_amount) || 0) -
    (Number(f.advance_deduction) || 0) -
    (Number(f.other_deductions) || 0);

  const saveSlip = async (e) => {
    e.preventDefault();
    await slipRepo.update(editSlip.id, {
      days_worked: Number(editSlipForm.days_worked),
      gross_wage: Number(editSlipForm.gross_wage),
      overtime_amount: Number(editSlipForm.overtime_amount),
      incentive_amount: Number(editSlipForm.incentive_amount),
      advance_deduction: Number(editSlipForm.advance_deduction),
      other_deductions: Number(editSlipForm.other_deductions),
      net_pay: computeNet(editSlipForm),
      status: editSlipForm.status,
    });
    setEditSlip(null);
    load();
  };

  const saveAdv = async (e) => {
    e.preventDefault();
    await advRepo.update(editAdv.id, {
      amount: Number(editAdvForm.amount),
      amount_repaid: Number(editAdvForm.amount_repaid),
      status: editAdvForm.status,
      reason: editAdvForm.reason,
    });
    setEditAdv(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title={t("payroll.titlePg")}
        subtitle={t("payroll.subtitlePg")}
        action={canRun && <Button onClick={() => setOpen(true)}><Plus size={16} /> {t("payroll.newPeriod")}</Button>}
      />

      {/* Excel export buttons */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => {
          const rows = periods.map((r) => ({
            farm: r.farm_name || r.farm,
            month: months[r.month - 1]?.label,
            year: r.year,
            status: r.status,
          }));
          exportExcel(rows, [
            { key: "farm", header: t("header.farm") },
            { key: "month", header: t("header.month") },
            { key: "year", header: t("header.year") },
            { key: "status", header: t("header.status") },
          ], "payroll-periods.xlsx", "Payroll Periods");
        }}>
          <Download size={14} /> {t("payroll.payrollPeriods")} Excel
        </Button>

        <Button variant="secondary" onClick={() => {
          const cols = [
            { key: "employee_name", header: t("header.employee") },
            { key: "days_worked", header: t("header.days") },
            { key: "gross_wage", header: t("header.gross"), render: (r) => Number(r.gross_wage || 0) },
            { key: "overtime_amount", header: t("header.ot"), render: (r) => Number(r.overtime_amount || 0) },
            { key: "advance_deduction", header: t("header.advances"), render: (r) => Number(r.advance_deduction || 0) },
            { key: "other_deductions", header: t("header.deductions"), render: (r) => Number(r.other_deductions || 0) },
            { key: "net_pay", header: t("header.netPay"), render: (r) => Number(r.net_pay || 0) },
            { key: "status", header: t("header.status") },
          ];
          const numKeys = ["gross_wage", "overtime_amount", "advance_deduction", "other_deductions", "net_pay"];
          const total = { employee_name: "Total", days_worked: "", status: "" };
          numKeys.forEach((k) => { total[k] = slips.reduce((s, r) => s + Number(r[k] || 0), 0); });
          exportExcel([...slips, total], cols, "payslips.xlsx", "Payslips");
        }}>
          <Download size={14} /> {t("payroll.payslips")} Excel
        </Button>

        <Button variant="secondary" onClick={() => {
          const cols = [
            { key: "employee_name", header: t("header.employee") },
            { key: "amount", header: t("header.amount"), render: (r) => Number(r.amount || 0) },
            { key: "amount_repaid", header: t("header.repaid"), render: (r) => Number(r.amount_repaid || 0) },
            { key: "balance", header: t("header.balance"), render: (r) => Number(r.balance || 0) },
            { key: "status", header: t("header.status") },
          ];
          const total = {
            employee_name: "Total",
            amount: advances.reduce((s, r) => s + Number(r.amount || 0), 0),
            amount_repaid: advances.reduce((s, r) => s + Number(r.amount_repaid || 0), 0),
            balance: advances.reduce((s, r) => s + Number(r.balance || 0), 0),
            status: "",
          };
          exportExcel([...advances, total], cols, "advances.xlsx", "Advances");
        }}>
          <Download size={14} /> {t("payroll.outstandingAdvances")} Excel
        </Button>
      </div>

      {msg && <p className="mb-3 rounded bg-brand-50 p-2 text-sm text-brand-700">{msg}</p>}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <Select label={t("header.farm")} value={filterFarm} onChange={(e) => handleFilterChange(e.target.value)}>
            <option value="">{t("workforce.allFarms")}</option>
            {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Select label={t("header.status")} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">{t("common.allStatus")}</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Select label={t("header.year")} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="">{t("payroll.allYears")}</option>
            {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </div>
      </div>

      <Card title={t("payroll.payrollPeriods")} className="mb-5">
        <Table
          columns={[
            { key: "farm_name", header: t("header.farm"), render: (r) => r.farm_name || r.farm },
            { key: "month", header: t("header.month"), render: (r) => months[r.month - 1]?.label },
            { key: "year", header: t("header.year") },
            {
              key: "status",
              header: t("header.status"),
              render: (r) => (
                <Badge color={statusColorMap[r.status] || "gray"}>
                  {t(`payroll.${statusLabelMap[r.status] || r.status}`)}
                </Badge>
              ),
            },
            {
              key: "_a",
              header: t("header.actions"),
              render: (r) =>
                canRun && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => generate(r.id)} className="inline-flex items-center gap-1 rounded bg-brand-600 px-2 py-1 text-xs text-white hover:bg-brand-700">
                      <Cog size={13} /> {t("payroll.generate")}
                    </button>
                    <button onClick={() => { setEditPeriod(r); setEditPeriodForm({ status: r.status }); }} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" title={t("common.edit")}>
                      <Pencil size={15} />
                    </button>
                    {canDelete && (
                      <button onClick={() => deletePeriod(r.id)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title={t("common.delete")}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ),
            },
          ]}
          rows={periods}
        />
      </Card>

      <Card
        title={t("payroll.payslips")}
        className="mb-5"
        action={
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[150px]">
              <Select value={slipFilterEmp} onChange={(e) => setSlipFilterEmp(e.target.value)}>
                <option value="">{t("common.allEmployees")}</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </div>
            <div className="min-w-[120px]">
              <Select value={slipFilterStatus} onChange={(e) => setSlipFilterStatus(e.target.value)}>
                <option value="">{t("common.allStatus")}</option>
                {SLIP_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
          </div>
        }
      >
        <Table
          footerColumns={["gross_wage", "overtime_amount", "advance_deduction", "other_deductions", "half_paid", "net_remaining"]}
          columns={[
            { key: "employee_name", header: t("header.employee"), render: (r) => r.employee_name || r.employee },
            { key: "days_worked", header: t("header.days") },
            { key: "gross_wage", header: t("header.gross") },
            { key: "overtime_amount", header: t("header.ot") },
            { key: "advance_deduction", header: t("header.advances") },
            { key: "other_deductions", header: t("header.deductions") },
            { key: "net_remaining", header: t("header.netPay"), render: (r) => <b>₹{Number(r.net_remaining || 0).toLocaleString("en-IN")}</b> },
            {
              key: "status",
              header: t("header.status"),
              render: (r) => (
                <Badge color={statusColorMap[r.status] || "gray"}>
                  {t(`payroll.${statusLabelMap[r.status] || r.status}`)}
                </Badge>
              ),
            },
            {
              key: "half_paid",
              header: t("payroll.halfPay"),
              render: (r) => {
                const paid = Number(r.half_paid || 0);
                const remaining = Number(r.net_pay || 0) - paid;
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-indigo-700">₹{paid.toLocaleString("en-IN")}</span>
                    {canRun && remaining > 0 && (
                      <button onClick={() => openHalfPay(r)} className="rounded bg-indigo-500 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-600" title={t("payroll.halfPayTitle")}>
                        {t("payroll.halfPay")}
                      </button>
                    )}
                  </div>
                );
              },
            },
            {
              key: "_a",
              header: t("common.actions"),
              render: (r) => canRun && (
                <div className="flex items-center gap-1">
                  {r.status !== "DRAFT" && (
                    <button onClick={() => markSlip(r, "DRAFT")} className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600" title={t("payroll.markDue")}>
                      {t("payroll.due")}
                    </button>
                  )}
                  {r.status !== "PAID" && (
                    <button onClick={() => markSlip(r, "PAID")} className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700" title={t("payroll.markPaid")}>
                      {t("payroll.done")}
                    </button>
                  )}
                  <button onClick={() => { setEditSlip(r); setEditSlipForm({ days_worked: r.days_worked, gross_wage: r.gross_wage, overtime_amount: r.overtime_amount, incentive_amount: r.incentive_amount, advance_deduction: r.advance_deduction, other_deductions: r.other_deductions, net_pay: r.net_pay, status: r.status }); }} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" title={t("common.edit")}>
                    <Pencil size={15} />
                  </button>
                  {canDelete && (
                    <button onClick={() => deleteSlip(r.id)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title={t("common.delete")}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          rows={slips.map((s) => ({ ...s, net_remaining: Number(s.net_pay || 0) - Number(s.half_paid || 0) }))}
          empty={t("payroll.noPayslips")}
        />
      </Card>

      <Card
        title={t("payroll.outstandingAdvances")}
        action={
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[150px]">
              <Select value={advFilterEmp} onChange={(e) => setAdvFilterEmp(e.target.value)}>
                <option value="">{t("common.allEmployees")}</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </div>
            <div className="min-w-[150px]">
              <Select value={advFilterStatus} onChange={(e) => setAdvFilterStatus(e.target.value)}>
                <option value="">{t("common.allStatus")}</option>
                {ADV_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
          </div>
        }
      >
        <Table
          footerColumns={["amount", "amount_repaid", "net_pay_calc"]}
          columns={[
            { key: "employee_name", header: t("header.employee"), render: (r) => r.employee_name || r.employee },
            { key: "amount", header: t("header.amount") },
            { key: "amount_repaid", header: t("header.repaid") },
            { key: "net_pay_calc", header: t("header.netPay"), render: (r) => <b>₹{(Number(r.amount || 0) + Number(r.amount_repaid || 0)).toLocaleString("en-IN")}</b> },
            {
              key: "status",
              header: t("header.status"),
              render: (r) => (
                <Badge color={statusColorMap[r.status] || "yellow"}>
                  {t(`payroll.${statusLabelMap[r.status] || r.status}`)}
                </Badge>
              ),
            },
            {
              key: "_a",
              header: t("common.actions"),
              render: (r) => canRun && (
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditAdv(r); setEditAdvForm({ amount: r.amount, amount_repaid: r.amount_repaid, status: r.status, reason: r.reason || "" }); }} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" title={t("common.edit")}>
                    <Pencil size={15} />
                  </button>
                  {canDelete && (
                    <button onClick={() => deleteAdv(r.id)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title={t("common.delete")}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          rows={advances.map((a) => ({ ...a, net_pay_calc: Number(a.amount || 0) + Number(a.amount_repaid || 0) }))}
          empty={t("payroll.noAdvances")}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t("payroll.newPeriod")}>
        <form onSubmit={createPeriod} className="space-y-3">
          <Select label={t("payroll.farmLabel")} value={form.farm} onChange={(e) => setForm({ ...form, farm: e.target.value })} required>
            <option value="">{t("payroll.selectFarm")}</option>
            {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
          <Select label={t("payroll.monthLabel")} value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} options={months} />
          <Input label={t("payroll.yearLabel")} type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t("payroll.cancel")}</Button>
            <Button type="submit">{t("payroll.create")}</Button>
          </div>
        </form>
      </Modal>
      <Modal open={!!editSlip} onClose={() => setEditSlip(null)} title="Edit Payslip">
        <form onSubmit={saveSlip} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("header.employee")}</label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{editSlip?.employee_name}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("header.days")} type="number" value={editSlipForm.days_worked || ""} onChange={(e) => setEditSlipForm({ ...editSlipForm, days_worked: e.target.value })} />
            <Input label={t("header.gross")} type="number" value={editSlipForm.gross_wage || ""} onChange={(e) => setEditSlipForm({ ...editSlipForm, gross_wage: e.target.value })} />
            <Input label={t("header.ot")} type="number" value={editSlipForm.overtime_amount || ""} onChange={(e) => setEditSlipForm({ ...editSlipForm, overtime_amount: e.target.value })} />
            <Input label={t("header.advances")} type="number" value={editSlipForm.advance_deduction || ""} onChange={(e) => setEditSlipForm({ ...editSlipForm, advance_deduction: e.target.value })} />
            <Input label={t("header.deductions")} type="number" value={editSlipForm.other_deductions || ""} onChange={(e) => setEditSlipForm({ ...editSlipForm, other_deductions: e.target.value })} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("header.netPay")}</label>
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-brand-700" title={t("payroll.netAutoCalc")}>
                ₹{computeNet(editSlipForm).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400">{t("payroll.netAutoCalc")}</p>
          <Select label={t("header.status")} value={editSlipForm.status || ""} onChange={(e) => setEditSlipForm({ ...editSlipForm, status: e.target.value })}>
            {SLIP_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditSlip(null)}>{t("payroll.cancel")}</Button>
            <Button type="submit">{t("crud.save")}</Button>
          </div>
        </form>
      </Modal>

      {/* Half Pay — partial payment against net pay */}
      <Modal open={!!halfPaySlip} onClose={() => setHalfPaySlip(null)} title={t("payroll.halfPayTitle")}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("header.employee")}</label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{halfPaySlip?.employee_name || halfPaySlip?.employee}</p>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 ring-1 ring-gray-200">
              {t("payroll.alreadyPaid")}: <b>₹{Number(halfPaySlip?.half_paid || 0).toLocaleString("en-IN")}</b>
            </div>
            <div className="flex-1 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800 ring-1 ring-indigo-200">
              {t("payroll.netPayRemaining")}: <b>₹{(Number(halfPaySlip?.net_pay || 0) - Number(halfPaySlip?.half_paid || 0)).toLocaleString("en-IN")}</b>
            </div>
          </div>
          <Input
            label={t("payroll.amountToPay")}
            type="number"
            min="1"
            value={halfPayAmount}
            onChange={(e) => setHalfPayAmount(e.target.value)}
            placeholder="0"
          />
          {halfPayError && <p className="text-sm text-red-600">{halfPayError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setHalfPaySlip(null)} disabled={halfPaySaving}>{t("payroll.cancel")}</Button>
            <Button type="button" onClick={doHalfPay} disabled={halfPaySaving}>
              {halfPaySaving ? t("common.saving") : t("payroll.halfPay")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editPeriod} onClose={() => setEditPeriod(null)} title="Edit Payroll Period">
        <form onSubmit={savePeriod} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("header.farm")}</label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{editPeriod?.farm_name || editPeriod?.farm}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("header.month")} / {t("header.year")}</label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{editPeriod ? months[editPeriod.month - 1]?.label : ""} {editPeriod?.year}</p>
          </div>
          <Select label={t("header.status")} value={editPeriodForm.status || ""} onChange={(e) => setEditPeriodForm({ ...editPeriodForm, status: e.target.value })}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditPeriod(null)}>{t("payroll.cancel")}</Button>
            <Button type="submit">{t("crud.save")}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editAdv} onClose={() => setEditAdv(null)} title="Edit Advance">
        <form onSubmit={saveAdv} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("header.employee")}</label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{editAdv?.employee_name}</p>
          </div>
          <Input label={t("header.amount")} type="number" value={editAdvForm.amount || ""} onChange={(e) => setEditAdvForm({ ...editAdvForm, amount: e.target.value })} required />
          <Input label={t("header.repaid")} type="number" value={editAdvForm.amount_repaid || ""} onChange={(e) => setEditAdvForm({ ...editAdvForm, amount_repaid: e.target.value })} />
          <Select label={t("header.status")} value={editAdvForm.status || ""} onChange={(e) => setEditAdvForm({ ...editAdvForm, status: e.target.value })}>
            {ADV_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditAdv(null)}>{t("payroll.cancel")}</Button>
            <Button type="submit">{t("crud.save")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
