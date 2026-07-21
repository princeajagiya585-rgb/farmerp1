import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Download, FileBarChart, RefreshCw } from "lucide-react";
import { resource } from "../lib/api";
import { exportExcel } from "../lib/export";
import { Button, Card, PageHeader, Select, Table } from "../components/ui";

const slipRepo = resource("payroll/payslips");
const advRepo = resource("payroll/advances");
const payRepo = resource("payroll/payments");

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(0, i).toLocaleString("en", { month: "long" }),
}));
const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
// "7" + 2026 → "July 2026" (period month is stored as an integer 1-12).
const monthLabel = (m, y) => {
  if (!m) return "—";
  const name = MONTHS.find((x) => Number(x.value) === Number(m))?.label || m;
  return y ? `${name} ${y}` : name;
};

const MONTHLY_COLS = [
  { key: "employee_name", header: "Employee" },
  { key: "period_month", header: "Month" },
  { key: "period_year", header: "Year" },
  { key: "days_worked", header: "Days" },
  { key: "gross_wage", header: "Gross" },
  { key: "advance_deduction", header: "Advance" },
  { key: "other_deductions", header: "Deductions" },
  { key: "net_pay", header: "Net Pay" },
];
const ADVANCE_COLS = [
  { key: "employee_name", header: "Employee" },
  { key: "amount", header: "Advance" },
  { key: "amount_repaid", header: "Repaid" },
  { key: "balance", header: "Outstanding" },
  { key: "date", header: "Since" },
];
const HISTORY_COLS = [
  { key: "employee_name", header: "Employee" },
  { key: "amount", header: "Amount" },
  { key: "date", header: "Date" },
  { key: "mode", header: "Mode" },
  { key: "reference", header: "Reference" },
];

export default function PayrollReports() {
  const { t: translate } = useTranslation();
  const [farms, setFarms] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Monthly payroll report
  const [mFarm, setMFarm] = useState("");
  const [mEmp, setMEmp] = useState("");
  const [mMonth, setMMonth] = useState(new Date().getMonth() + 1);
  const [mYear, setMYear] = useState(new Date().getFullYear());
  const [monthly, setMonthly] = useState(null);

  // Advance outstanding
  const [outstanding, setOutstanding] = useState(null);

  // Worker payment history
  const [emp, setEmp] = useState("");
  const [history, setHistory] = useState(null);

  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));
    resource("workforce/employees").list({ page_size: 200 }).then((d) => setEmployees(d.results || d));
    loadOutstanding();
    runMonthly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runMonthly = async () => {
    const params = { month: mMonth, year: mYear };
    if (mFarm) params.farm = mFarm;
    if (mEmp) params.employee = mEmp;
    setMonthly(await slipRepo.collectionAction("monthly_report", params));
  };
  const loadOutstanding = async () => setOutstanding(await advRepo.collectionAction("outstanding"));
  const runHistory = async () => {
    const params = emp ? { employee: emp } : {};
    setHistory(await payRepo.collectionAction("history", params));
  };

  const t = monthly?.totals || {};

  return (
    <div>
      <PageHeader title={translate("payrollReports.title")} subtitle={translate("payrollReports.subtitle")} />

      {/* Monthly payroll report */}
      <Card title={translate("payrollReports.monthlyPayroll")} className="mb-5">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-auto sm:min-w-[180px]">
            <Select label="Farm" value={mFarm} onChange={(e) => setMFarm(e.target.value)}>
              <option value="">All farms</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[200px]">
            <Select label={translate("header.employee")} value={mEmp} onChange={(e) => setMEmp(e.target.value)}>
              <option value="">{translate("common.allEmployees")}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[150px]">
            <Select label="Month" value={mMonth} onChange={(e) => setMMonth(e.target.value)} options={MONTHS} />
          </div>
          <div className="w-28">
            <Select label="Year" value={mYear} onChange={(e) => setMYear(e.target.value)}>
              {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </div>
          <Button onClick={runMonthly}><FileBarChart size={15} /> Run</Button>
          {monthly?.rows?.length > 0 && (
            <Button variant="secondary" onClick={() => exportExcel(monthly.rows, MONTHLY_COLS, "monthly-payroll.xlsx", "Monthly Payroll")}>
              <Download size={15} /> Excel
            </Button>
          )}
        </div>
        <Table
          empty="No payslips for this period."
          footerColumns={["gross_wage", "advance_deduction", "other_deductions", "net_pay"]}
          columns={[
            { key: "employee_name", header: translate("header.employee") },
            { key: "period_month", header: translate("header.month"), render: (r) => monthLabel(r.period_month, r.period_year) },
            { key: "days_worked", header: translate("header.days") },
            { key: "gross_wage", header: translate("header.gross"), render: (r) => money(r.gross_wage) },
            { key: "advance_deduction", header: translate("header.advance"), render: (r) => money(r.advance_deduction) },
            { key: "other_deductions", header: translate("header.deductions"), render: (r) => money(r.other_deductions) },
            { key: "net_pay", header: translate("header.netPay"), render: (r) => <b>{money(r.net_pay)}</b> },
          ]}
          rows={monthly?.rows || []}
        />
        {monthly?.count > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-gray-50 p-3 text-sm">
            <span><span className="text-gray-500">Employees:</span> <b>{monthly.count}</b></span>
            <span><span className="text-gray-500">Gross:</span> <b>{money(t.gross_wage)}</b></span>
            <span><span className="text-gray-500">Deductions:</span> <b>{money(Number(t.other_deductions) + Number(t.advance_deduction))}</b></span>
            <span><span className="text-gray-500">Total Net Payout:</span> <b className="text-brand-700">{money(t.net_pay)}</b></span>
          </div>
        )}
      </Card>

      {/* Advance outstanding */}
      <Card
        title={translate("payrollReports.advanceOutstanding")}
        className="mb-5"
        action={
          <div className="flex gap-2">
            {outstanding?.rows?.length > 0 && (
              <Button variant="secondary" onClick={() => exportExcel(outstanding.rows, ADVANCE_COLS, "advance-outstanding.xlsx", "Advance Outstanding")}>
                <Download size={15} /> Excel
              </Button>
            )}
            <Button variant="secondary" onClick={loadOutstanding}><RefreshCw size={14} /> Refresh</Button>
          </div>
        }
      >
        <Table
          empty="No outstanding advances. 🎉"
          footerColumns={["amount", "amount_repaid", "balance"]}
          columns={[
            { key: "employee_name", header: translate("header.employee") },
            { key: "amount", header: translate("header.advance"), render: (r) => money(r.amount) },
            { key: "amount_repaid", header: translate("header.repaid"), render: (r) => money(r.amount_repaid) },
            { key: "balance", header: translate("header.outstanding"), render: (r) => <b>{money(r.balance)}</b> },
            { key: "date", header: translate("header.since") },
          ]}
          rows={outstanding?.rows || []}
        />
        {outstanding && (
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
            <span className="text-gray-500">Total outstanding:</span>{" "}
            <b className="text-amber-700">{money(outstanding.total_outstanding)}</b>
            <span className="text-gray-400"> · {outstanding.count} advance(s)</span>
          </div>
        )}
      </Card>

      {/* Worker payment history */}
      <Card title={translate("payrollReports.workerPaymentHistory")}>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-auto sm:min-w-[220px]">
            <Select label="Employee" value={emp} onChange={(e) => setEmp(e.target.value)}>
              <option value="">All employees</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <Button onClick={runHistory}><FileBarChart size={15} /> Run</Button>
          {history?.rows?.length > 0 && (
            <Button variant="secondary" onClick={() => exportExcel(history.rows, HISTORY_COLS, "payment-history.xlsx", "Payment History")}>
              <Download size={15} /> Excel
            </Button>
          )}
        </div>
        <Table
          empty="No payments recorded. Run the report after selecting filters."
          footerColumns={["amount"]}
          columns={[
            { key: "employee_name", header: translate("header.employee") },
            { key: "amount", header: translate("header.amount"), render: (r) => money(r.amount) },
            { key: "date", header: translate("header.date") },
            { key: "mode", header: translate("header.mode") },
            { key: "reference", header: translate("header.reference"), render: (r) => r.reference || "—" },
          ]}
          rows={history?.rows || []}
        />
        {history && (
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
            <span className="text-gray-500">Total paid:</span>{" "}
            <b className="text-brand-700">{money(history.total_paid)}</b>
            <span className="text-gray-400"> · {history.count} payment(s)</span>
          </div>
        )}
      </Card>
    </div>
  );
}
