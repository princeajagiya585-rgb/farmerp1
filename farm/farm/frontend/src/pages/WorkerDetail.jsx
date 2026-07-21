import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ShoppingCart, DollarSign, TrendingUp, FileText, ExternalLink, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Badge, Button, Card, PageHeader, Table } from "../components/ui";

const money = (v) => (v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);
const stColor = { PENDING: "yellow", APPROVED: "green", REJECTED: "red" };
const modeColor = { CASH: "green", BANK: "blue", UPI: "blue", CHEQUE: "yellow" };

const slipStatusColor = { DRAFT: "gray", FINALIZED: "blue", PAID: "green" };

export default function WorkerDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canViewFinance = hasRole("SUPER_ADMIN", "FARM_MANAGER");

  const [employee, setEmployee] = useState(null);
  const [financials, setFinancials] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(canViewFinance ? "purchases" : "payslips");
  const [error, setError] = useState("");

  const TABS = [
    ...(canViewFinance
      ? [
          { key: "purchases", label: t("workerDetail.purchases"), icon: ShoppingCart },
          { key: "sales", label: t("workerDetail.sales"), icon: TrendingUp },
          { key: "payments", label: t("workerDetail.payments"), icon: DollarSign },
        ]
      : []),
    { key: "payslips", label: t("workerDetail.payslips"), icon: Wallet },
  ];

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const emp = await api.get(`/workforce/employees/${id}/`).then((r) => r.data);
        setEmployee(emp);

        if (canViewFinance) {
          const fin = await api.get(`/workforce/employees/${id}/financial_summary/`).then((r) => r.data);
          setFinancials(fin);
        }

        // Always fetch payslips for this employee
        const slips = await api.get("/payroll/payslips/", { params: { employee: id, page_size: 50 } }).then((r) => r.data);
        setPayslips(Array.isArray(slips) ? slips : slips.results || []);
      } catch (e) {
        setError("Failed to load worker details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, canViewFinance]);

  if (loading) {
    return (
      <div>
        <PageHeader title={t("workerDetail.title")} subtitle={t("common.loading")} />
        <Card><p className="py-8 text-center text-gray-400">{t("workerDetail.loading")}</p></Card>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div>
        <PageHeader
          title={t("workerDetail.title")}
          subtitle={t("common.error")}
          action={
            <Button variant="secondary" onClick={() => navigate("/workforce")}>
              <ArrowLeft size={16} /> Back
            </Button>
          }
        />
        <Card><p className="py-8 text-center text-red-500">{error || t("workerDetail.notFound")}</p></Card>
      </div>
    );
  }

  const purchaseCols = [
    { key: "date", header: t("header.date") },
    { key: "invoice_no", header: t("header.invoice"), render: (r) => r.invoice_no || "—" },
    { key: "total_amount", header: t("header.amount"), render: (r) => <b>{money(r.total_amount)}</b> },
    { key: "status", header: t("header.status"), render: (r) => <Badge color={stColor[r.status]}>{r.status}</Badge> },
    {
      key: "bill_file_url", header: t("header.bill"),
      render: (r) =>
        r.bill_file_url ? (
          <a href={r.bill_file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800">
            <FileText size={14} /> <span>View</span> <ExternalLink size={12} />
          </a>
        ) : "—",
    },
  ];

  const saleCols = [
    { key: "date", header: t("header.date") },
    { key: "buyer", header: t("header.buyer"), render: (r) => r.buyer || "—" },
    { key: "crop_name", header: t("header.crop"), render: (r) => r.crop_name || "—" },
    { key: "quantity", header: t("header.qty"), render: (r) => `${r.quantity} ${r.unit || ""}` },
    { key: "amount", header: t("header.amount"), render: (r) => <b>{money(r.amount)}</b> },
  ];

  const paymentCols = [
    { key: "date", header: t("header.date") },
    { key: "amount", header: t("header.amount"), render: (r) => <b>{money(r.amount)}</b> },
    { key: "mode", header: t("header.mode"), render: (r) => <Badge color={modeColor[r.mode] || "gray"}>{r.mode}</Badge> },
    { key: "reference", header: t("header.reference"), render: (r) => r.reference || "—" },
    {
      key: "bill_file_url", header: t("header.bill"),
      render: (r) =>
        r.bill_file_url ? (
          <a href={r.bill_file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800">
            <FileText size={14} /> <span>View</span> <ExternalLink size={12} />
          </a>
        ) : "—",
    },
  ];

  const payslipCols = [
    {
      key: "period",
      header: t("header.period"),
      render: (r) => {
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const m = r.period ? months[(r.period_month || 1) - 1] : "—";
        const y = r.period_year || "—";
        return `${m} ${y}`;
      },
    },
    { key: "days_worked", header: t("header.days") },
    { key: "gross_wage", header: t("header.gross"), render: (r) => money(r.gross_wage) },
    { key: "advance_deduction", header: t("header.advances"), render: (r) => money(r.advance_deduction) },
    { key: "other_deductions", header: t("header.deductions"), render: (r) => money(r.other_deductions) },
    {
      key: "net_pay",
      header: t("header.netPay"),
      render: (r) => <b className="text-brand-700">{money(r.net_pay)}</b>,
    },
    {
      key: "status",
      header: t("header.status"),
      render: (r) => (
        <Badge color={slipStatusColor[r.status] || "gray"}>
          {r.status === "DRAFT" ? t("payroll.statusDraft") : r.status === "FINALIZED" ? t("payroll.statusGenerated") : r.status === "PAID" ? t("payroll.statusPaid") : r.status}
        </Badge>
      ),
    },
  ];

  const tabData = {
    purchases: { rows: financials?.purchases || [], cols: purchaseCols },
    sales: { rows: financials?.sales || [], cols: saleCols },
    payments: { rows: financials?.payments || [], cols: paymentCols },
    payslips: { rows: payslips, cols: payslipCols },
  };

  return (
    <div>
      <PageHeader
        title={employee.name}
        subtitle={`${employee.designation || t("workerDetail.noDesignation")} · ${employee.farm_name || ""}`}
        action={
          <Button variant="secondary" onClick={() => navigate("/workforce")}>
            <ArrowLeft size={16} /> {t("workerDetail.backToWorkers")}
          </Button>
        }
      />

      {/* Employee Info Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <InfoCard label={t("workerDetail.category")} value={employee.category} />
        <InfoCard label={t("workerDetail.employmentType")} value={employee.employment_type?.replace(/_/g, " ")} />
        <InfoCard label={t("workerDetail.phone")} value={employee.phone || "—"} />
        <InfoCard label={t("workerDetail.department")} value={employee.department_name || "—"} />
        <InfoCard label={t("workerDetail.dailyWage")} value={employee.daily_wage ? money(employee.daily_wage) : "—"} />
      </div>

      {/* Payslips & Financial Data */}
      <Card>
        <div className="mb-4 flex border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-b-2 border-brand-600 text-brand-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {tabData[tab.key].rows.length}
              </span>
            </button>
          ))}
        </div>

        {tabData[activeTab].rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {activeTab === "payslips"
              ? t("workerDetail.noPayslips")
              : t("workerDetail.noRecords", { tab: t(`workerDetail.${activeTab}`) })}
          </p>
        ) : (
          <Table
            columns={tabData[activeTab].cols}
            rows={tabData[activeTab].rows}
            {...(activeTab === "purchases" ? { footerColumns: ["total_amount"] } : {})}
            {...(activeTab === "sales" ? { footerColumns: ["amount"] } : {})}
            {...(activeTab === "payments" ? { footerColumns: ["amount"] } : {})}
            {...(activeTab === "payslips" ? { footerColumns: ["gross_wage", "advance_deduction", "other_deductions", "net_pay"] } : {})}
          />
        )}
      </Card>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}
