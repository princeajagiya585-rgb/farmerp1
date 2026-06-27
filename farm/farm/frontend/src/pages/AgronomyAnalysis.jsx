import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { resource } from "../lib/api";
import { exportExcel } from "../lib/export";
import { Button, Card, PageHeader, Table } from "../components/ui";

const crops = resource("agronomy/crops");
const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const num = (v) => Number(v || 0);





export default function AgronomyAnalysis() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    crops.collectionAction("analytics").then(setData).catch(() => {});
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

  // ── Excel export helpers ────────────────────────────────────────────
  const buildTotal = (rows, firstColKey, footerKeys) => {
    const row = { [firstColKey]: t("common.total") };
    const cols = Object.keys(rows[0] || {});
    cols.forEach((k) => {
      if (k !== firstColKey && !footerKeys.includes(k)) row[k] = "";
    });
    footerKeys.forEach((k) => {
      row[k] = rows.reduce((s, r) => s + num(r[k]), 0);
    });
    return row;
  };

  const exportTable = (rows, cols, sheetName, filename, footerKeys) => {
    const totalRow = footerKeys.length > 0 && rows.length > 0
      ? buildTotal(rows, cols[0].key, footerKeys)
      : null;
    const exportRows = totalRow ? [...rows, totalRow] : rows;
    exportExcel(exportRows, cols, filename, sheetName);
  };

  return (
    <div>
      <PageHeader
        title={t("agronomyAnalysis.title")}
        subtitle={t("agronomyAnalysis.subtitle")}
      />

      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ── Crop-wise History ──────────────────────────────────── */}
        <Card
          title={t("agronomyAnalysis.cropHistory")}
          action={
            <Button
              variant="secondary"
              onClick={() =>
                exportTable(
                  data?.by_crop || [],
                  CROP_COLS,
                  t("agronomyAnalysis.exportCropHistory"),
                  "crop-wise-history.xlsx",
                  ["quantity", "revenue"]
                )
              }
              disabled={!data?.by_crop?.length}
            >
              <Download size={14} /> {t("common.excel")}
            </Button>
          }
        >
          <Table
            empty={t("agronomyAnalysis.noHarvest")}
            columns={CROP_COLS}
            rows={data?.by_crop || []}
            footerColumns={["quantity", "revenue"]}
          />
        </Card>

        {/* ── Farm-wise History ──────────────────────────────────── */}
        <Card
          title={t("agronomyAnalysis.farmHistory")}
          action={
            <Button
              variant="secondary"
              onClick={() =>
                exportTable(
                  data?.by_farm || [],
                  FARM_COLS,
                  t("agronomyAnalysis.exportFarmHistory"),
                  "farm-wise-history.xlsx",
                  ["quantity", "revenue"]
                )
              }
              disabled={!data?.by_farm?.length}
            >
              <Download size={14} /> {t("common.excel")}
            </Button>
          }
        >
          <Table
            empty={t("agronomyAnalysis.noHarvest")}
            columns={FARM_COLS}
            rows={data?.by_farm || []}
            footerColumns={["quantity", "revenue"]}
          />
        </Card>
      </div>

      {/* ── Seasonal Comparison ──────────────────────────────────── */}
      <Card
        title={t("agronomyAnalysis.seasonalComparison")}
        className="mb-5"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              exportTable(
                data?.by_season || [],
                SEASON_COLS,
                t("agronomyAnalysis.exportSeasonal"),
                "seasonal-comparison.xlsx",
                ["crops", "expected_yield"]
              )
            }
            disabled={!data?.by_season?.length}
          >
            <Download size={14} /> {t("common.excel")}
          </Button>
        }
      >
        <Table
          empty={t("agronomyAnalysis.noCrops")}
          columns={SEASON_COLS}
          rows={data?.by_season || []}
          footerColumns={["crops", "expected_yield"]}
        />
      </Card>

      {/* ── Yield Analysis ────────────────────────────────────────── */}
      <Card
        title={t("agronomyAnalysis.yieldAnalysis")}
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              exportTable(
                data?.yield_analysis || [],
                YIELD_COLS,
                t("agronomyAnalysis.exportYield"),
                "yield-analysis.xlsx",
                ["expected_yield", "actual_yield", "variance"]
              )
            }
            disabled={!data?.yield_analysis?.length}
          >
            <Download size={14} /> {t("common.excel")}
          </Button>
        }
      >
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
