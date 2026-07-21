import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cog, Download, Pencil, Trash2, Camera, ImagePlus } from "lucide-react";
import { resource, toFormData, normalizePhotoUrl } from "../lib/api";
import { compressImage } from "../lib/imageCompress";
import { exportExcelMultiSheet } from "../lib/export";
import { Badge, Button, Card, Input, Modal, PageHeader, PhotoThumb, Select, Table } from "../components/ui";
import CameraCapture from "../components/CameraCapture";
import { useAuth } from "../context/AuthContext";

const periodRepo = resource("payroll/periods");
const slipRepo = resource("payroll/payslips");
const advRepo = resource("payroll/advances");
const payRepo = resource("payroll/payments");

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
  // Every advance (farm-scoped, unfiltered by status/employee) — used to fill
  // each payslip's Advances column by matching the advance's month to the slip.
  const [allAdvances, setAllAdvances] = useState([]);
  const [farms, setFarms] = useState([]);
  const [msg, setMsg] = useState("");
  const [filterFarm, setFilterFarm] = useState("");
  // Payslip-specific filters
  const [slipFilterEmp, setSlipFilterEmp] = useState("");
  const [slipFilterStatus, setSlipFilterStatus] = useState("");
  // Default the Payslips table to the CURRENT real-time month & year, so July
  // shows only July's payslips and the view auto-rolls over to August in August.
  // Users can still switch to "All Months"/older months via the dropdowns.
  const [slipFilterMonth, setSlipFilterMonth] = useState(String(new Date().getMonth() + 1));
  const [slipFilterYear, setSlipFilterYear] = useState(String(new Date().getFullYear()));
  const [employees, setEmployees] = useState([]);
  // Advances-specific filters
  const [advFilterStatus, setAdvFilterStatus] = useState("");
  const [advFilterEmp, setAdvFilterEmp] = useState("");

  // Edit modals
  const [editAdv, setEditAdv] = useState(null);
  const [editAdvForm, setEditAdvForm] = useState({});
  const [editSlip, setEditSlip] = useState(null);
  const [editSlipForm, setEditSlipForm] = useState({});
  // Half Pay (partial advance repayment) modal
  const [halfPaySlip, setHalfPaySlip] = useState(null);
  const [halfPayAmount, setHalfPayAmount] = useState("");
  const [halfPaySaving, setHalfPaySaving] = useState(false);
  const [halfPayError, setHalfPayError] = useState("");
  // Bill/receipt photo attach modal
  const [photoSlip, setPhotoSlip] = useState(null);
  const [photoCameraOpen, setPhotoCameraOpen] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(0, i).toLocaleString(i18n.language, { month: "long" }),
  }));

  // Days in a given month (m is 1-12) — one day's salary = monthly ÷ this.
  const daysInMonth = (m, y) => new Date(Number(y), Number(m), 0).getDate();

  // One-day salary for a monthly-salaried payslip, else null.
  const dailyRate = (r) => {
    const ms = Number(r.employee_monthly_salary || 0);
    if (ms > 0 && r.period_month && r.period_year) {
      return ms / daysInMonth(r.period_month, r.period_year);
    }
    return null;
  };

  // Gross wage driven purely by attendance: days worked × one-day salary.
  // e.g. ₹12,000 monthly in a 31-day month → ₹387/day; 1 day = ₹387, 2 = ₹774.
  // Falls back to the stored gross for daily-wage workers (no monthly salary).
  const perDayGross = (r) => {
    const rate = dailyRate(r);
    if (rate == null) return Number(r.gross_wage || 0);
    return Math.round(rate * Number(r.days_worked || 0));
  };

  // Advance to show on a payslip's Advances column: the outstanding balance of
  // every advance for that employee whose date falls in the payslip's own month
  // & year. So an advance given in July shows on the July slip, August on August
  // — "amount according to month". Falls back to the stored value until the
  // advances list has loaded.
  const advanceForSlip = (r) => {
    const empId = String(r.employee);
    const m = Number(r.period_month);
    const y = Number(r.period_year);
    if (!m || !y || !allAdvances.length) return Number(r.advance_deduction || 0);
    let total = 0;
    for (const a of allAdvances) {
      if (String(a.employee) !== empId || !a.date) continue;
      const [ay, am] = String(a.date).split("-").map(Number); // "2026-07-15"
      if (am === m && ay === y) {
        const bal = a.balance != null
          ? Number(a.balance)
          : Number(a.amount || 0) - Number(a.amount_repaid || 0);
        if (bal > 0) total += bal;
      }
    }
    return Math.round(total);
  };

  // Per-day gross, month-matched advance, and resulting net for a payslip.
  const slipCalc = (r) => {
    const gross = perDayGross(r);
    const adv = advanceForSlip(r);
    const net = Math.round(
      gross
      + Number(r.incentive_amount || 0)
      - adv
      - Number(r.other_deductions || 0)
    );
    return { gross, adv, net };
  };

  // A date inside the payslip's own month, so the payout lands in the right
  // month on the Employee Payments page (uses today if it's the live month).
  const pad2 = (n) => String(n).padStart(2, "0");
  const periodDate = (r) => {
    const today = new Date();
    const y = Number(r.period_year) || today.getFullYear();
    const m = Number(r.period_month) || today.getMonth() + 1;
    const last = daysInMonth(m, y);
    const day = y === today.getFullYear() && m === today.getMonth() + 1
      ? Math.min(today.getDate(), last)
      : last;
    return `${y}-${pad2(m)}-${pad2(day)}`;
  };

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

    // Periods (kept in state for auto-generate reference + Excel export only —
    // the visible Periods table was removed; payslips now auto-generate).
    periodRepo.list(baseParams).then((d) => setPeriods(d.results || d));

    // Payslips with its own filters
    const slipParams = { ...baseParams };
    if (slipFilterEmp) slipParams.employee = slipFilterEmp;
    if (slipFilterStatus) slipParams.status = slipFilterStatus;
    slipRepo.list(slipParams).then((d) => setSlips(d.results || d));

    // Advances with its own filters (drives the Outstanding Advances card)
    const advParams = { ...baseParams };
    if (advFilterStatus) advParams.status = advFilterStatus;
    if (advFilterEmp) advParams.employee = advFilterEmp;
    advRepo.list(advParams).then((d) => setAdvances(d.results || d));

    // All advances (unfiltered by status/employee) so the payslip Advances
    // column can be filled by month regardless of the card's active filters.
    advRepo.list({ ...baseParams, page_size: 500 }).then((d) => setAllAdvances(d.results || d));
  };
  // Auto-generate the CURRENT month's payslips for every farm the user can
  // access. Runs on page load so "Periods & Payslips" always reflects this
  // month's approved attendance without any manual "Generate" step — and rolls
  // over to the new month automatically. The backend preserves each slip's
  // status & half-paid amount on regenerate; only days/wage/net recompute from
  // attendance, so PAID / partially-paid slips are never clobbered.
  const autoGenerateCurrentMonth = async (farmsArr) => {
    if (!canRun || !farmsArr?.length) return;
    const m = new Date().getMonth() + 1;
    const y = new Date().getFullYear();
    setMsg(t("payroll.generating"));
    try {
      const existing = await periodRepo.list({ month: m, year: y, page_size: 200 });
      const rows = existing.results || existing;
      const byFarm = {};
      rows.forEach((p) => { byFarm[String(p.farm)] = p; });
      for (const f of farmsArr) {
        let period = byFarm[String(f.id)];
        if (!period) {
          try { period = await periodRepo.create({ farm: f.id, month: m, year: y }); }
          catch { continue; } // farm may have no employees / no permission — skip
        }
        try { await periodRepo.action(period.id, "generate"); } catch { /* skip farm on error */ }
      }
    } finally {
      setMsg("");
    }
  };

  useEffect(() => {
    (async () => {
      const fd = await resource("farms").list({ page_size: 200 });
      const farmsArr = fd.results || fd;
      setFarms(farmsArr);
      resource("workforce/employees").list({ page_size: 200 }).then((d) => setEmployees(d.results || d));
      await autoGenerateCurrentMonth(farmsArr);
      load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (farmId) => {
    setFilterFarm(farmId);
  };

  // Re-load when any filter changes
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFarm, slipFilterEmp, slipFilterStatus, advFilterStatus, advFilterEmp]);

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

  // Mark a payslip DONE: finalise it (PAID) at its current per-day net pay and
  // record that amount as a payout on the Employee Payments page for the month.
  const markDone = async (slip) => {
    const { adv, net } = slipCalc(slip);
    if (!confirm(t("payroll.confirmDonePay", { amount: net.toLocaleString("en-IN") }))) return;
    // Persist PAID + the per-day net & month-matched advance so the backend
    // settles the right advance amount and reports/payments agree.
    await slipRepo.update(slip.id, { status: "PAID", net_pay: net, advance_deduction: adv });
    // Add the payout to Employee Payments, dated inside the payslip's month.
    try {
      await payRepo.create({
        employee: slip.employee,
        payslip: slip.id,
        amount: net,
        date: periodDate(slip),
        mode: "CASH",
        reference: slip.period_month ? `${months[slip.period_month - 1]?.label} ${slip.period_year}` : "",
      });
    } catch (e) {
      setMsg(e.response?.data?.detail || t("common.saveFailed"));
    }
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

  // Attach a bill/receipt photo (from file or camera) to a payslip. Optional —
  // used as proof for online transactions; cash payouts can skip it.
  const uploadSlipPhoto = async (file) => {
    if (!file || !photoSlip) return;
    setPhotoSaving(true);
    setPhotoError("");
    try {
      const saved = await slipRepo.update(photoSlip.id, toFormData({ payment_photo: file }));
      // Keep the modal open showing the new photo so the user sees it saved.
      setPhotoSlip((prev) => (prev ? { ...prev, payment_photo_url: saved.payment_photo_url } : prev));
      load();
    } catch (err) {
      setPhotoError(err.response?.data?.detail || t("common.saveFailed"));
    } finally {
      setPhotoSaving(false);
    }
  };

  const removeSlipPhoto = async () => {
    if (!photoSlip) return;
    setPhotoSaving(true);
    setPhotoError("");
    try {
      await slipRepo.update(photoSlip.id, { payment_photo: null });
      setPhotoSlip((prev) => (prev ? { ...prev, payment_photo_url: null } : prev));
      load();
    } catch (err) {
      setPhotoError(err.response?.data?.detail || t("common.saveFailed"));
    } finally {
      setPhotoSaving(false);
    }
  };

  // Net pay always = wage + incentive − advances − deductions
  const computeNet = (f) =>
    (Number(f.gross_wage) || 0) +
    (Number(f.incentive_amount) || 0) -
    (Number(f.advance_deduction) || 0) -
    (Number(f.other_deductions) || 0);

  // When days worked is edited, recompute the gross wage as days × one-day
  // salary so Net Pay reflects per-day attendance. Falls back to manual gross
  // when the employee has no monthly salary (no known daily rate).
  const updateSlipDays = (days) => {
    const rate = editSlip ? dailyRate(editSlip) : null;
    setEditSlipForm((f) => ({
      ...f,
      days_worked: days,
      ...(rate != null && days !== ""
        ? { gross_wage: Math.round(rate * Number(days) * 100) / 100 }
        : {}),
    }));
  };

  const saveSlip = async (e) => {
    e.preventDefault();
    // Advances, incentive & other deductions are managed on their own pages —
    // preserve the payslip's existing values here (they're not edited in this
    // modal), so Net Pay stays wage + incentive − advance − deductions.
    await slipRepo.update(editSlip.id, {
      days_worked: Number(editSlipForm.days_worked),
      gross_wage: Number(editSlipForm.gross_wage),
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

  // Payslip rows for the current month/year filter, with gross/advance/net
  // recomputed from attendance, then split by wage type into two tables.
  const visibleSlips = slips
    .filter((s) => (!slipFilterMonth || String(s.period_month) === String(slipFilterMonth)) && (!slipFilterYear || String(s.period_year) === String(slipFilterYear)))
    .map((s) => {
      const { gross, adv, net } = slipCalc(s);
      return {
        ...s,
        gross_wage: gross,
        advance_deduction: adv,
        _net_calc: net,
        net_remaining: s.status === "PAID" ? 0 : net - Number(s.half_paid || 0),
      };
    });
  const hourlySlips = visibleSlips.filter((s) => s.employee_wage_type === "HOURLY");
  const monthlySlips = visibleSlips.filter((s) => s.employee_wage_type !== "HOURLY");

  // Column set for the payslip tables. Hourly-wage slips show the hourly rate
  // instead of the monthly salary; everything else is identical so the two
  // tables read consistently.
  const buildSlipColumns = (isHourly) => [
    { key: "employee_name", header: t("header.employee"), render: (r) => r.employee_name || r.employee },
    { key: "farm_name", header: t("header.farm"), render: (r) => r.farm_name || "-" },
    {
      key: "period_month",
      header: t("header.month"),
      render: (r) => (r.period_month ? `${months[r.period_month - 1]?.label} ${r.period_year}` : "-"),
    },
    {
      key: "days_worked",
      header: t("header.days"),
      render: (r) => {
        const rate = dailyRate(r);
        const days = Number(r.days_worked || 0);
        if (rate != null) {
          return (
            <span className="whitespace-nowrap">
              {days} <span className="text-xs text-gray-500">· ₹{Math.round(rate).toLocaleString("en-IN")}{t("payroll.perDay")}</span>
            </span>
          );
        }
        return days;
      },
    },
    isHourly
      ? {
          key: "employee_hourly_wage",
          header: t("workforce.hourlyWage"),
          render: (r) => {
            const hw = Number(r.employee_hourly_wage || 0);
            return hw > 0 ? `₹${hw.toLocaleString("en-IN")}/hr` : "-";
          },
        }
      : {
          key: "employee_monthly_salary",
          header: t("payroll.monthlySalary"),
          render: (r) => {
            const ms = Number(r.employee_monthly_salary || 0);
            return ms > 0 ? `₹${ms.toLocaleString("en-IN")}` : "-";
          },
        },
    { key: "gross_wage", header: t("header.gross") },
    { key: "advance_deduction", header: t("header.advances") },
    {
      key: "net_remaining",
      header: t("header.netPay"),
      render: (r) => (
        <div>
          <b>₹{Number(r.net_remaining || 0).toLocaleString("en-IN")}</b>
          {r.status === "PAID" && (
            <div className="whitespace-nowrap text-xs font-medium text-green-600">
              {t("payroll.accountClosed")}
              {r.period_month ? ` · ${months[r.period_month - 1]?.label} ${r.period_year}` : ""}
            </div>
          )}
        </div>
      ),
    },
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
      key: "payment_photo_url",
      header: t("payroll.billPhoto"),
      render: (r) => {
        const url = normalizePhotoUrl(r.payment_photo_url);
        return url ? <PhotoThumb url={url} alt={t("payroll.billPhoto")} size={32} /> : <span className="text-gray-400">—</span>;
      },
    },
    {
      key: "half_paid",
      header: t("payroll.halfPay"),
      render: (r) => {
        const paid = Number(r.half_paid || 0);
        const remaining = Number(r._net_calc ?? r.net_pay ?? 0) - paid;
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-indigo-700">₹{paid.toLocaleString("en-IN")}</span>
            {canRun && remaining > 0 && r.status !== "PAID" && (
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
          {r.status === "PAID" ? (
            <span className="whitespace-nowrap rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
              {t("payroll.finalDone")}
            </span>
          ) : (
            <button onClick={() => markDone(r)} className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700" title={t("payroll.markPaid")}>
              {t("payroll.due")}
            </button>
          )}
          <button onClick={() => { setPhotoSlip(r); setPhotoError(""); }} className={`rounded p-1.5 hover:bg-indigo-50 ${normalizePhotoUrl(r.payment_photo_url) ? "text-indigo-600" : "text-gray-500"}`} title={t("payroll.attachPhoto")}>
            <Camera size={15} />
          </button>
          <button onClick={() => { setEditSlip(r); setEditSlipForm({ days_worked: r.days_worked, gross_wage: r.gross_wage, incentive_amount: r.incentive_amount, advance_deduction: r.advance_deduction, other_deductions: r.other_deductions, net_pay: r.net_pay, status: r.status }); }} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" title={t("common.edit")}>
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
  ];

  return (
    <div>
      <PageHeader
        title={t("payroll.titlePg")}
        subtitle={t("payroll.subtitlePg")}
        action={canRun && (
          <Button onClick={async () => { await autoGenerateCurrentMonth(farms); load(); }}>
            <Cog size={16} /> {t("payroll.generate")}
          </Button>
        )}
      />

      {/* Single Excel export button — combines all sections into one file */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => {
          const wbData = [];
          
          // Periods sheet
          if (periods.length > 0) {
            const periodRows = periods.map((r) => ({
              [t("header.farm")]: r.farm_name || r.farm,
              [t("header.month")]: months[r.month - 1]?.label,
              [t("header.year")]: r.year,
              [t("header.status")]: r.status,
            }));
            wbData.push({ name: t("payroll.payrollPeriods"), data: periodRows });
          }
          
          // Payslips sheet
          if (slips.length > 0) {
            const slipRows = slips.map((r) => {
              const rate = dailyRate(r);
              const { gross, adv, net } = slipCalc(r);
              return {
                [t("header.employee")]: r.employee_name,
                [t("header.farm")]: r.farm_name || "",
                [t("header.month")]: r.period_month ? `${months[r.period_month - 1]?.label} ${r.period_year}` : "",
                [t("header.days")]: r.days_worked,
                [t("payroll.dailyRate")]: rate != null ? Math.round(rate) : "",
                [t("header.gross")]: gross,
                [t("header.advances")]: adv,
                [t("header.netPay")]: r.status === "PAID" ? 0 : net - Number(r.half_paid || 0),
                [t("header.status")]: r.status,
              };
            });
            wbData.push({ name: t("payroll.payslips"), data: slipRows });
          }
          
          // Advances sheet
          if (advances.length > 0) {
            const advRows = advances.map((r) => ({
              [t("header.employee")]: r.employee_name,
              [t("header.amount")]: Number(r.amount || 0),
              [t("header.repaid")]: Number(r.amount_repaid || 0),
              [t("header.balance")]: Number(r.balance || 0),
              [t("header.status")]: r.status,
            }));
            wbData.push({ name: t("payroll.outstandingAdvances"), data: advRows });
          }
          
          if (wbData.length > 0) {
            exportExcelMultiSheet(wbData, `payroll-${filterFarm || "all"}.xlsx`, t("payroll.titlePg"));
          }
        }}>
          <Download size={14} /> {t("common.excel")}
          
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
      </div>

      <Card
        title={t("payroll.payslipsMonthly")}
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
              <Select value={slipFilterMonth} onChange={(e) => setSlipFilterMonth(e.target.value)}>
                <option value="">{t("payroll.allMonths")}</option>
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </div>
            <div className="min-w-[110px]">
              <Select value={slipFilterYear} onChange={(e) => setSlipFilterYear(e.target.value)}>
                <option value="">{t("payroll.allYears")}</option>
                {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
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
          footerColumns={["gross_wage", "advance_deduction", "half_paid", "net_remaining"]}
          columns={buildSlipColumns(false)}
          rows={monthlySlips}
          empty={t("payroll.noPayslips")}
        />
      </Card>

      <Card title={t("payroll.payslipsHourly")} className="mb-5">
        <Table
          footerColumns={["gross_wage", "advance_deduction", "half_paid", "net_remaining"]}
          columns={buildSlipColumns(true)}
          rows={hourlySlips}
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

      <Modal open={!!editSlip} onClose={() => setEditSlip(null)} title="Edit Payslip">
        <form onSubmit={saveSlip} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("header.employee")}</label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{editSlip?.employee_name}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("header.days")} type="number" value={editSlipForm.days_worked ?? ""} onChange={(e) => updateSlipDays(e.target.value)} />
            <Input label={t("header.gross")} type="number" value={editSlipForm.gross_wage ?? ""} onChange={(e) => setEditSlipForm({ ...editSlipForm, gross_wage: e.target.value })} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("header.netPay")}</label>
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-brand-700" title={t("payroll.netAutoCalc")}>
                ₹{computeNet(editSlipForm).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
          {editSlip && dailyRate(editSlip) != null && (
            <p className="text-xs text-gray-500">
              ₹{Math.round(dailyRate(editSlip)).toLocaleString("en-IN")}{t("payroll.perDay")} × {Number(editSlipForm.days_worked || 0)} {t("header.days").toLowerCase()}
            </p>
          )}
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
              {t("payroll.netPayRemaining")}: <b>₹{(Number(halfPaySlip?._net_calc ?? halfPaySlip?.net_pay ?? 0) - Number(halfPaySlip?.half_paid || 0)).toLocaleString("en-IN")}</b>
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

      {/* Attach bill / receipt photo (file or camera) — optional payout proof */}
      <Modal open={!!photoSlip} onClose={() => setPhotoSlip(null)} title={t("payroll.attachPhoto")}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("header.employee")}</label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{photoSlip?.employee_name || photoSlip?.employee}</p>
          </div>
          {normalizePhotoUrl(photoSlip?.payment_photo_url) && (
            <div className="flex items-center gap-3">
              <PhotoThumb url={normalizePhotoUrl(photoSlip.payment_photo_url)} alt={t("payroll.billPhoto")} size={64} />
              <Button type="button" variant="secondary" onClick={removeSlipPhoto} disabled={photoSaving}>
                <Trash2 size={14} /> {t("common.remove")}
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*,.pdf"
              capture="environment"
              onChange={async (e) => { const f = e.target.files[0]; if (f) uploadSlipPhoto(await compressImage(f)); }}
              className="w-full rounded-lg border border-gray-300 text-sm file:mr-3 file:rounded-l-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            <button
              type="button"
              onClick={() => setPhotoCameraOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
            >
              <Camera size={16} /> {t("common.takePhoto")}
            </button>
          </div>
          <p className="text-xs text-gray-400">{t("payroll.billPhotoHint")}</p>
          {photoSaving && <p className="text-sm text-brand-600">{t("common.saving")}</p>}
          {photoError && <p className="text-sm text-red-600">{photoError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPhotoSlip(null)} disabled={photoSaving}>{t("payroll.cancel")}</Button>
          </div>
        </div>
      </Modal>

      <CameraCapture
        open={photoCameraOpen}
        title={t("payroll.attachPhoto")}
        onClose={() => setPhotoCameraOpen(false)}
        onCapture={(file) => { setPhotoCameraOpen(false); uploadSlipPhoto(file); }}
      />

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
