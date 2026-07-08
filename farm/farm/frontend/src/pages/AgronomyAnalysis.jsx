import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Download, Filter } from "lucide-react";
import { resource } from "../lib/api";
import { exportExcelMultiSheet } from "../lib/export";
import { Button, Card, PageHeader, Select, Table } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const crops = resource("agronomy/crops");
const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const num = (v) => Number(v || 0);

export default function AgronomyAnalysis() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEmployee = user?.role === "EMPLOYEE";
  const [data, setData] = useState(null);
  const [farms, setFarms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState({
    farm: "",
    employee: ""
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));
    resource("workforce/employees").list({ page_size: 200 }).then((d) => setEmployees(d.results || d));
  }, []);

  const loadData = () => {
    setLoading(true);
    const params = {};
    if (filters.farm) params.farm = filters.farm;
    if (filters.employee && !isEmployee) params.employee = filters.employee;

    crops.collectionAction("analytics", params).then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  // ── Column definitions ──────────────────────────────────────────────
  const CROP_COLS = [
    { key: "crop", header: t("header.crop") },
    { key: "quantity", header: t("header.harvested") },
    { key: "revenue", header: t("header.revenue"), render: (r) => money(r.revenue) },
  ];

  const FARM_COLS = [
    { key: "farm", header: t("header.farm") },
    { key: "quantity", header: t("header.harvested") },
    { key: "revenue", header: t("header.revenue"), render: (r) => money(r.revenue) },
  ];

  const SEASON_COLS = [
    { key: "season", header: t("header.season") },
    { key: "crops", header: t("header.crops") },
    { key: "expected_yield", header: t("header.expectedYield") },
  ];

  const YIELD_COLS = [
    { key: "crop", header: t("header.crop") },
    { key: "season", header: t("header.season") },
    { key: "expected_yield", header: t("header.expected") },
    { key: "actual_yield", header: t("header.actual") },
    {
      key: "variance",
      header: t("header.variance"),
      render: (r) => {
        const v = num(r.variance);
        return (
          <b className={v < 0 ? "text-red-600" : "text-brand-700"}>
            {v > 0 ? "+" : ""}
            {r.variance}
          </b>
        );
      },
    },
  ];

  // ── Excel export with filters applied (single combined file) ─────────
  const handleExport = () => {
    if (!data) return;

    const farmName = farms.find(f => f.id === filters.farm)?.name || "all_farms";
    const filename = `agronomy_analysis_${farmName}.xlsx`;

    // Combine all data into single Excel file with multiple sheets
    const exportData = [];

    // Crop-wise data
    if (data?.by_crop?.length > 0) {
      const cropRows = data.by_crop.map(r => ({
        [t("header.crop")]: r.crop,
        [t("header.harvested")]: r.quantity,
        [t("header.revenue")]: money(r.revenue),
      }));
      exportData.push({ name: "Crop History", data: cropRows });
    }

    // Farm-wise data
    if (data?.by_farm?.length > 0) {
      const farmRows = data.by_farm.map(r => ({
        [t("header.farm")]: r.farm,
        [t("header.harvested")]: r.quantity,
        [t("header.revenue")]: money(r.revenue),
      }));
      exportData.push({ name: "Farm History", data: farmRows });
    }

    // Seasonal comparison
    if (data?.by_season?.length > 0) {
      const seasonRows = data.by_season.map(r => ({
        [t("header.season")]: r.season,
        [t("header.crops")]: r.crops,
        [t("header.expectedYield")]: r.expected_yield,
      }));
      exportData.push({ name: "Seasonal Comparison", data: seasonRows });
    }

    // Yield analysis
    if (data?.yield_analysis?.length > 0) {
      const yieldRows = data.yield_analysis.map(r => ({
        [t("header.crop")]: r.crop,
        [t("header.season")]: r.season,
        [t("header.expected")]: r.expected_yield,
        [t("header.actual")]: r.actual_yield,
        [t("header.variance")]: r.variance,
      }));
      exportData.push({ name: "Yield Analysis", data: yieldRows });
    }

    if (exportData.length > 0) {
      exportExcelMultiSheet(exportData, filename, "Agronomy Analysis");
    }
  };

  return (
    <div>
      <PageHeader
        title={t("agronomyAnalysis.title")}
        subtitle={t("agronomyAnalysis.subtitle")}
        action={
          <Button onClick={handleExport} disabled={!data}>
            <Download size={15} /> {t("common.excel")}
          </Button>
        }
      />

      {/* Filters */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <Select label={t("header.farm")} value={filters.farm} onChange={(e) => setFilters({ ...filters, farm: e.target.value })}>
              <option value="">{t("workforce.allFarms")}</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
          {!isEmployee && (
            <div className="min-w-[180px]">
              <Select label={t("header.employee")} value={filters.employee} onChange={(e) => setFilters({ ...filters, employee: e.target.value })}>
                <option value="">{t("common.allEmployees")}</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </div>
          )}
          <Button onClick={loadData} disabled={loading}>
            <Filter size={15} /> {t("common.applyFilters")}
          </Button>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ── Crop-wise History ──────────────────────────────────── */}
        <Card title={t("agronomyAnalysis.cropHistory")}>
          <Table
            empty={t("agronomyAnalysis.noHarvest")}
            columns={CROP_COLS}
            rows={data?.by_crop || []}
            footerColumns={["quantity", "revenue"]}
          />
        </Card>

        {/* ── Farm-wise History ──────────────────────────────────── */}
        <Card title={t("agronomyAnalysis.farmHistory")}>
          <Table
            empty={t("agronomyAnalysis.noHarvest")}
            columns={FARM_COLS}
            rows={data?.by_farm || []}
            footerColumns={["quantity", "revenue"]}
          />
        </Card>
      </div>

      {/* ── Seasonal Comparison ──────────────────────────────────── */}
      <Card title={t("agronomyAnalysis.seasonalComparison")} className="mb-5">
        <Table
          empty={t("agronomyAnalysis.noCrops")}
          columns={SEASON_COLS}
          rows={data?.by_season || []}
          footerColumns={["crops", "expected_yield"]}
        />
      </Card>

      {/* ── Yield Analysis ────────────────────────────────────────── */}
      <Card title={t("agronomyAnalysis.yieldAnalysis")}>
        <Table
          empty={t("agronomyAnalysis.noCrops")}
          columns={YIELD_COLS}
          rows={data?.yield_analysis || []}
          footerColumns={["expected_yield", "actual_yield", "variance"]}
        />
      </Card>
    </div>
  );
}
