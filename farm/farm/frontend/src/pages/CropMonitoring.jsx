import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import CrudResource from "../components/CrudResource";
import { Badge, Button, Card, PageHeader, Select, Table } from "../components/ui";
import { resource } from "../lib/api";
import { exportExcel, exportExcelMultiSheet } from "../lib/export";
import { useAuth } from "../context/AuthContext";

const TABS = [
  { key: "growth",       labelKey: "cropMon.tabGrowth" },
  { key: "observations", labelKey: "cropMon.tabObservations" },
  { key: "yield",        labelKey: "cropMon.tabYield" },
  { key: "performance",  labelKey: "cropMon.tabPerformance" },
];

const obsColor  = { PEST: "red", DISEASE: "red", NUTRIENT: "yellow", WEATHER: "blue", GROWTH: "green" };
const sevColor  = { LOW: "gray", MEDIUM: "yellow", HIGH: "red" };
const statusColor = { PLANNED: "gray", PLANTED: "blue", GROWING: "green", HARVESTED: "purple", FAILED: "red" };
const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

export default function CropMonitoring() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const [tab, setTab] = useState("growth");

  return (
    <div>
      <PageHeader
        title={t("cropMon.title")}
        subtitle={t("cropMon.subtitle")}
      />

      {/* Tab bar */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-4 py-2 text-sm font-medium transition ${
              tab === tb.key
                ? "border-b-2 border-brand-600 text-brand-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {tab === "growth" && (          <CrudResource
          title={t("cropMon.growthTitle")}
          subtitle={t("cropMon.growthSubtitle")}
          path="agronomy/growth-records"
          canWrite={canWrite}
          showFarmFilter
          showEmployeeFilter
          footerColumns={["height_cm", "health_index"]}
          columns={[
            { key: "crop_name",    header: t("cropMon.crop") },
            { key: "date",         header: t("cropMon.date") },
            { key: "stage",        header: t("cropMon.stage"), render: (r) => r.stage || "—" },
            { key: "height_cm",    header: t("cropMon.heightCm") },
            { key: "health_index", header: t("cropMon.healthIndex"), render: (r) => `${r.health_index}/100` },
            { key: "notes",        header: t("cropMon.notes"), render: (r) => r.notes || "—" },
            { key: "created_by_name", header: t("header.user"), render: (r) => r.created_by_name || "—" },
          ]}
          fields={[
            { name: "crop",         label: t("cropMon.crop"),         optionsFrom: { path: "agronomy/crops", label: (c) => `${c.name} ${c.variety || ""}`.trim() }, required: true },
            { name: "farm",         label: t("cropMon.farm"),         optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
            { name: "date",         label: t("cropMon.date"),         type: "date", required: true },
            { name: "stage",        label: t("cropMon.growthStage") },
            { name: "height_cm",    label: t("cropMon.heightCm"),  type: "number" },
            { name: "health_index", label: t("cropMon.healthIndexRange"), type: "number" },
            { name: "notes",        label: t("cropMon.notes"),        type: "textarea" },
          ]}
        />
      )}

      {tab === "observations" && (          <CrudResource
          title={t("cropMon.obsTitle")}
          subtitle={t("cropMon.obsSubtitle")}
          path="agronomy/observations"
          canWrite={canWrite}
          showFarmFilter
          showEmployeeFilter
          columns={[
            { key: "crop_name",        header: t("cropMon.crop") },
            { key: "observed_on",      header: t("cropMon.date") },
            { key: "observation_type", header: t("cropMon.type"),     render: (r) => <Badge color={obsColor[r.observation_type] || "gray"}>{r.observation_type}</Badge> },
            { key: "severity",         header: t("cropMon.severity"), render: (r) => <Badge color={sevColor[r.severity] || "gray"}>{r.severity}</Badge> },
            { key: "title",            header: t("cropMon.titleCol") },
            { key: "description",      header: t("cropMon.description"), render: (r) => r.description || "—" },
          ]}
          fields={[
            { name: "crop",             label: t("cropMon.crop"),     optionsFrom: { path: "agronomy/crops", label: (c) => `${c.name} ${c.variety || ""}`.trim() }, required: true },
            { name: "farm",             label: t("cropMon.farm"),     optionsFrom: { path: "farms", label: (f) => f.name }, required: true },
            { name: "observed_on",      label: t("cropMon.observedOn"), type: "date", required: true },
            { name: "observation_type", label: t("cropMon.type"),     type: "select", options: ["PEST", "DISEASE", "NUTRIENT", "WEATHER", "GROWTH"], required: true },
            { name: "severity",         label: t("cropMon.severity"), type: "select", options: ["LOW", "MEDIUM", "HIGH"], required: true },
            { name: "title",            label: t("cropMon.titleCol"),    required: true },
            { name: "description",      label: t("cropMon.description"), type: "textarea" },
          ]}
        />
      )}

      {tab === "yield" && <YieldEstimates canWrite={canWrite} money={money} statusColor={statusColor} />}

      {tab === "performance" && <CropPerformance money={money} statusColor={statusColor} />}
    </div>
  );
}

/* ── Yield Estimates tab ─────────────────────────────────────────── */
function YieldEstimates({ canWrite, money, statusColor }) {
  const { t } = useTranslation();
  const [crops, setCrops] = useState([]);

  useEffect(() => {
    resource("agronomy/crops").list({ page_size: 200 }).then((d) => setCrops(d.results || d));
  }, []);

  const exportYield = () => {
    const rows = crops.map((c) => ({
      crop: `${c.name} ${c.variety || ""}`.trim(),
      farm: c.farm_name || c.farm,
      season: c.season || "—",
      area: c.area,
      expected_yield: Number(c.expected_yield || 0),
      status: c.status,
    }));
    const total = { crop: t("common.total"), farm: "", season: "", area: "", expected_yield: rows.reduce((s, r) => s + r.expected_yield, 0), status: "" };
    exportExcel([...rows, total], [
      { key: "crop",           header: t("cropMon.crop") },
      { key: "farm",           header: t("cropMon.farm") },
      { key: "season",         header: t("cropMon.season") },
      { key: "area",           header: t("cropMon.areaAc") },
      { key: "expected_yield", header: t("cropMon.expectedYield"), render: (r) => Number(r.expected_yield || 0) },
      { key: "status",         header: t("cropMon.status") },
    ], "yield-estimates.xlsx", t("cropMon.tabYield"));
  };

  return (
    <Card
      title={t("cropMon.yieldTitle")}
      action={
        <Button variant="secondary" onClick={exportYield} disabled={!crops.length}>
          <Download size={14} /> {t("common.excel")}
        </Button>
      }
    >
      <Table
        empty={t("cropMon.noCrops")}
        footerColumns={["expected_yield"]}
        columns={[
          { key: "name",           header: t("cropMon.crop"), render: (r) => `${r.name} ${r.variety || ""}`.trim() },
          { key: "farm_name",      header: t("cropMon.farm") },
          { key: "season",         header: t("cropMon.season"), render: (r) => r.season || "—" },
          { key: "area",           header: t("cropMon.areaAc") },
          { key: "expected_yield", header: t("cropMon.expectedYield") },
          { key: "planting_date",  header: t("cropMon.planted"),  render: (r) => r.planting_date || "—" },
          { key: "expected_harvest_date", header: t("cropMon.harvestBy"), render: (r) => r.expected_harvest_date || "—" },
          { key: "status",         header: t("cropMon.status"), render: (r) => <Badge color={statusColor[r.status] || "gray"}>{r.status}</Badge> },
        ]}
        rows={crops}
      />
    </Card>
  );
}

/* ── Crop Performance History tab ────────────────────────────────── */
function CropPerformance({ money, statusColor }) {
  const { t } = useTranslation();
  const [data, setData]   = useState(null);
  const [farmFilter, setFarmFilter] = useState("");
  const [farms, setFarms] = useState([]);

  useEffect(() => {
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));
    loadAnalytics();
  }, []);

  const loadAnalytics = (farm = "") => {
    const params = farm ? { farm } : {};
    resource("agronomy/crops").collectionAction("analytics", params).then(setData).catch(() => {});
  };

  const handleFarmChange = (e) => {
    setFarmFilter(e.target.value);
    loadAnalytics(e.target.value);
  };

  const exportAllPerformance = () => {
    const wbData = [];
    
    if (data?.by_crop?.length > 0) {
      const rows = data.by_crop.map((r) => ({
        [t("cropMon.crop")]: r.crop,
        [t("cropMon.totalHarvested")]: Number(r.quantity || 0),
        [t("cropMon.revenue")]: Number(r.revenue || 0),
      }));
      rows.push({
        [t("cropMon.crop")]: t("common.total"),
        [t("cropMon.totalHarvested")]: rows.reduce((s, r) => s + r[t("cropMon.totalHarvested")], 0),
        [t("cropMon.revenue")]: rows.reduce((s, r) => s + r[t("cropMon.revenue")], 0),
      });
      wbData.push({ name: "Crop Performance", data: rows });
    }
    
    if (data?.yield_analysis?.length > 0) {
      const rows = data.yield_analysis.map((r) => ({
        [t("cropMon.crop")]: r.crop,
        [t("cropMon.season")]: r.season,
        [t("cropMon.expectedYield")]: Number(r.expected_yield || 0),
        [t("cropMon.actualYield")]: Number(r.actual_yield || 0),
        [t("cropMon.variance")]: Number(r.variance || 0),
      }));
      rows.push({
        [t("cropMon.crop")]: t("common.total"),
        [t("cropMon.season")]: "",
        [t("cropMon.expectedYield")]: rows.reduce((s, r) => s + r[t("cropMon.expectedYield")], 0),
        [t("cropMon.actualYield")]: rows.reduce((s, r) => s + r[t("cropMon.actualYield")], 0),
        [t("cropMon.variance")]: rows.reduce((s, r) => s + r[t("cropMon.variance")], 0),
      });
      wbData.push({ name: "Yield Analysis", data: rows });
    }
    
    if (data?.by_season?.length > 0) {
      const rows = data.by_season.map((r) => ({
        [t("cropMon.season")]: r.season,
        [t("cropMon.totalCrops")]: Number(r.crops || 0),
        [t("cropMon.expectedYield")]: Number(r.expected_yield || 0),
      }));
      rows.push({
        [t("cropMon.season")]: t("common.total"),
        [t("cropMon.totalCrops")]: rows.reduce((s, r) => s + r[t("cropMon.totalCrops")], 0),
        [t("cropMon.expectedYield")]: rows.reduce((s, r) => s + r[t("cropMon.expectedYield")], 0),
      });
      wbData.push({ name: "Seasonal Comparison", data: rows });
    }
    
    if (wbData.length > 0) {
      exportExcelMultiSheet(wbData, `crop-performance-${new Date().toISOString().slice(0, 10)}.xlsx`, t("cropMon.tabPerformance"));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <Select label={t("cropMon.filterByFarm")} value={farmFilter} onChange={handleFarmChange}>
            <option value="">{t("cropMon.allFarms")}</option>
            {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
        <Button variant="secondary" onClick={exportAllPerformance} disabled={!data?.by_crop?.length && !data?.yield_analysis?.length && !data?.by_season?.length}>
          <Download size={14} /> {t("common.excel")}
        </Button>
      </div>

      {/* Crop-wise performance */}
      <Card title={t("cropMon.cropwisePerformance")}>
        <Table
          empty={t("cropMon.noHarvest")}
          footerColumns={["quantity", "revenue"]}
          columns={[
            { key: "crop",     header: t("cropMon.crop") },
            { key: "quantity", header: t("cropMon.totalHarvested") },
            { key: "revenue",  header: t("cropMon.revenue"), render: (r) => money(r.revenue) },
          ]}
          rows={data?.by_crop || []}
        />
      </Card>

      {/* Yield analysis — expected vs actual */}
      <Card title={t("cropMon.yieldAnalysis")}>
        <Table
          empty={t("cropMon.noData")}
          footerColumns={["expected_yield", "actual_yield", "variance"]}
          columns={[
            { key: "crop",           header: t("cropMon.crop") },
            { key: "season",         header: t("cropMon.season") },
            { key: "expected_yield", header: t("cropMon.expectedYield") },
            { key: "actual_yield",   header: t("cropMon.actualYield") },
            {
              key: "variance",
              header: t("cropMon.variance"),
              render: (r) => {
                const v = Number(r.variance || 0);
                return <b className={v < 0 ? "text-red-600" : "text-green-600"}>{v > 0 ? "+" : ""}{r.variance}</b>;
              },
            },
          ]}
          rows={data?.yield_analysis || []}
        />
      </Card>

      {/* Seasonal comparison */}
      <Card title={t("cropMon.seasonalComparison")}>
        <Table
          empty={t("cropMon.noSeasonal")}
          footerColumns={["crops", "expected_yield"]}
          columns={[
            { key: "season",         header: t("cropMon.season") },
            { key: "crops",          header: t("cropMon.totalCrops") },
            { key: "expected_yield", header: t("cropMon.expectedYield") },
          ]}
          rows={data?.by_season || []}
        />
      </Card>
    </div>
  );
}
