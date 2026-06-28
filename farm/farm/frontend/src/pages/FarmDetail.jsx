import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Tractor, Sprout, Users, Wrench, ClipboardList,
  MapPin, DollarSign, Calendar, FileText, AlertTriangle, Clock,
  Plus, ExternalLink,
} from "lucide-react";
import { api } from "../lib/api";
import { Card, PageHeader, Badge, Button, Table, Modal, Input, Select, Textarea } from "../components/ui";

const statusColors = {
  PLANNED: "blue",
  PLANTED: "green",
  GROWING: "green",
  HARVESTED: "yellow",
  FAILED: "red",
};

export default function FarmDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  // History modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyForm, setHistoryForm] = useState({ title: "", description: "", event_type: "RECORD", event_date: "" });
  const [historySaving, setHistorySaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get(`/farms/${id}/overview/`)
      .then((r) => setData(r.data))
      .catch(() => setError(t("farmDetail.loadFailed")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (id) load();
  }, [id]);

  const addHistory = async (e) => {
    e.preventDefault();
    setHistorySaving(true);
    try {
      await api.post("/farms/history/", {
        farm: id,
        ...historyForm,
      });
      setShowHistoryModal(false);
      setHistoryForm({ title: "", description: "", event_type: "RECORD", event_date: "" });
      load();
    } catch {
      // ignore
    } finally {
      setHistorySaving(false);
    }
  };

  if (loading) return <p className="text-gray-400">{t("farmDetail.loading")}</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!data || !data.farm_data) return <p className="text-gray-400">{t("farmDetail.notFound")}</p>;

  const farm = data.farm_data;
  const tabs = [
    { key: "overview", label: t("common.overview") },
    { key: "fields", label: `${t("farmDetail.fields")} (${data.fields_count})` },
    { key: "crops", label: `${t("farmDetail.activeCrops")} (${data.active_crops_count})` },
    { key: "assets", label: `${t("farmDetail.assets")} (${data.total_assets})` },
    { key: "history", label: t("common.history") },
  ];

  const money = (v) => (v == null ? "—" : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/farms/dashboard"
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ArrowLeft size={16} /> {t("common.backToDashboard")}
        </Link>
        <PageHeader
          title={farm.name}
          subtitle={`${farm.code} · ${farm.location || t("farmDetail.noLocation")} · ${farm.total_area || 0} ${t("farmDetail.acres")}`}
          action={
            <div className="flex gap-2">
              <Link to="/farms" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                <Plus size={15} /> {t("common.addField")}
              </Link>
              <Button onClick={() => setShowHistoryModal(true)} variant="secondary">
                <FileText size={15} /> {t("common.addRecord")}
              </Button>
            </div>
          }
        />
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-t-xl px-4 py-2.5 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-b-2 border-brand-600 bg-brand-50/40 text-brand-700"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab data={data} farm={farm} money={money} t={t} />
      )}

      {activeTab === "fields" && (
        <FieldsTab data={data} farmId={id} money={money} t={t} />
      )}

      {activeTab === "crops" && (
        <CropsTab data={data} money={money} t={t} />
      )}

      {activeTab === "assets" && (
        <AssetsTab data={data} money={money} t={t} />
      )}

      {activeTab === "history" && (
        <HistoryTab data={data} onAdd={() => setShowHistoryModal(true)} t={t} />
      )}

      {/* Add History Record Modal */}
      {showHistoryModal && (
        <Modal
          open={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          title={t("farmDetail.addFarmRecord")}
        >
          <form onSubmit={addHistory} className="space-y-3">
            <Input
              label={t("header.title")}
              required
              value={historyForm.title}
              onChange={(e) => setHistoryForm({ ...historyForm, title: e.target.value })}
            />
            <Select
              label={t("farmDetail.eventType")}
              value={historyForm.event_type}
              onChange={(e) => setHistoryForm({ ...historyForm, event_type: e.target.value })}
            >
              <option value="RECORD">{t("farmDetail.generalRecord")}</option>
              <option value="CREATED">{t("farmDetail.farmCreated")}</option>
              <option value="FIELD_ADDED">{t("farmDetail.fieldAdded")}</option>
              <option value="CROP_PLANTED">{t("farmDetail.cropPlanted")}</option>
              <option value="CROP_HARVESTED">{t("farmDetail.cropHarvested")}</option>
              <option value="MANAGER_CHANGED">{t("farmDetail.managerChanged")}</option>
              <option value="AREA_UPDATED">{t("farmDetail.areaUpdated")}</option>
              <option value="EQUIPMENT_ADDED">{t("farmDetail.equipmentAdded")}</option>
              <option value="INFRASTRUCTURE">{t("farmDetail.infrastructureUpdate")}</option>
            </Select>
            <Input
              label={t("header.date")}
              type="date"
              required
              value={historyForm.event_date}
              onChange={(e) => setHistoryForm({ ...historyForm, event_date: e.target.value })}
            />
            <Textarea
              label={t("header.description")}
              rows={3}
              value={historyForm.description}
              onChange={(e) => setHistoryForm({ ...historyForm, description: e.target.value })}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowHistoryModal(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={historySaving}>
                {historySaving ? t("common.savingDots") : t("farmDetail.saveRecord")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================ */
/* OVERVIEW TAB                                                  */
/* ============================================================ */
function OverviewTab({ data, farm, money, t }) {
  return (
    <div>


      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Farm Details */}
        <Card title={t("farmDetail.farmConfig")}>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.code")}</dt>
              <dd className="font-medium text-gray-800">{farm.code}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.location")}</dt>
              <dd className="font-medium text-gray-800">{farm.location || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.totalArea")}</dt>
              <dd className="font-medium text-gray-800">{farm.total_area} {t("farmDetail.acres")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.manager")}</dt>
              <dd className="font-medium text-gray-800">{farm.manager_name || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.soilType")}</dt>
              <dd className="font-medium text-gray-800">{farm.soil_type || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.irrigation")}</dt>
              <dd className="font-medium text-gray-800">{farm.irrigation_type || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.established")}</dt>
              <dd className="font-medium text-gray-800">{farm.established_date || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.status")}</dt>
              <dd>
                <Badge color={farm.is_active ? "green" : "gray"}>
                  {farm.is_active ? t("farmDetail.active") : t("farmDetail.inactive")}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>

        {/* Financial Summary */}
        <Card title={t("farmDetail.financialSummary")}>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.totalRevenue")}</dt>
              <dd className="font-semibold text-green-600">
                {money(data.financial_summary?.total_revenue || 0)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.totalExpenses")}</dt>
              <dd className="font-semibold text-red-600">
                {money(data.financial_summary?.total_expenses || 0)}
              </dd>
            </div>
            <div className="border-t border-gray-100 pt-2">
              <div className="flex justify-between">
                <dt className="text-gray-500 font-medium">{t("farmDetail.netPosition")}</dt>
                <dd
                  className={`font-bold ${
                    (data.financial_summary?.net || 0) >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {money(data.financial_summary?.net || 0)}
                </dd>
              </div>
            </div>
          </dl>
        </Card>

        {/* Task Summary */}
        <Card title={t("farmDetail.tasksOverview")}>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.openTasks")}</dt>
              <dd className="font-semibold text-yellow-600">{data.task_summary?.open_tasks || 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.overdue")}</dt>
              <dd className="font-semibold text-red-600">{data.task_summary?.overdue_tasks || 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.completed")}</dt>
              <dd className="font-semibold text-green-600">{data.task_summary?.completed_tasks || 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("farmDetail.workforce")}</dt>
              <dd className="font-semibold text-gray-700">
                {data.workforce_summary?.present_today || 0} / {data.workforce_summary?.total_employees || 0} {t("farmDetail.present")}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Recent Harvests */}
        {data.recent_harvests?.length > 0 && (
          <Card title={t("farmDetail.recentHarvests")} className="lg:col-span-3">
            <Table
              columns={[
                { key: "date", header: t("header.date") },
                { key: "crop__name", header: t("header.crop") },
                { key: "quantity", header: t("header.quantity"), render: (r) => `${r.quantity} ${r.unit || "kg"}` },
                { key: "revenue", header: t("header.revenue"), render: (r) => money(r.revenue) },
              ]}
              rows={data.recent_harvests}
            />
          </Card>
        )}

        {/* Assets Summary */}
        {data.assets_summary?.length > 0 && (
          <Card title={t("farmDetail.assetsByType")} className="lg:col-span-3">
            <Table
              columns={[
                { key: "asset_type", header: t("header.type") },
                { key: "count", header: t("header.count") },
              ]}
              rows={data.assets_summary}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

/* ============================================================ */
/* FIELDS TAB                                                    */
/* ============================================================ */
function FieldsTab({ data, farmId, money, t }) {
  const fields = data.fields || [];

  return (
    <div>
      <Link
        to="/farms"
        className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
      >
        <ExternalLink size={15} /> {t("common.manageAllFields")}
      </Link>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <div
            key={field.id}
            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card transition hover:shadow-soft"
          >
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-gray-800">{field.name}</h4>
                <p className="text-xs text-gray-400">{field.code || "—"}</p>
              </div>
              <Badge color={field.is_active !== false ? "green" : "gray"}>
                {field.is_active !== false ? t("farmDetail.active") : t("farmDetail.inactive")}
              </Badge>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-gray-400">{t("header.area")}</p>
                <p className="font-medium text-gray-700">{field.area || 0} {t("fields.ac")}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">{t("farmDetail.soilType")}</p>
                <p className="font-medium text-gray-700">{field.soil_type || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">{t("farmDetail.currentCrop")}</p>
                <p className="font-medium text-gray-700">{field.current_crop || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">{t("farmDetail.irrigation")}</p>
                <p className="font-medium text-gray-700">{field.irrigation_source || "—"}</p>
              </div>
            </div>
            {field.soil_ph && (
              <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-500">
                {t("farmDetail.soilPh")}: {field.soil_ph} · {t("farmDetail.slope")}: {field.slope || "—"}
              </div>
            )}
            {field.notes && (
              <p className="mt-2 text-xs italic text-gray-400 line-clamp-2">{field.notes}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================ */
/* CROPS TAB                                                     */
/* ============================================================ */
function CropsTab({ data, money, t }) {
  const crops = data.active_crops || [];

  return (
    <div>
      <Link
        to="/agronomy"
        className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
      >
        <ExternalLink size={15} /> {t("common.manageAllCrops")}
      </Link>

      {crops.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-gray-400">{t("common.noActiveCrops")}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {crops.map((crop) => (
            <div
              key={crop.id}
              className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card transition hover:shadow-soft"
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-gray-800">
                    {crop.name} {crop.variety && <span className="text-xs text-gray-400">({crop.variety})</span>}
                  </h4>
                  <p className="text-xs text-gray-400">
                    {crop.field__name || t("farmDetail.noFieldAssigned")}
                  </p>
                </div>
                <Badge color={statusColors[crop.status] || "gray"}>
                  {crop.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-400">{t("header.area")}</p>
                  <p className="font-medium text-gray-700">{crop.area || 0} {t("fields.ac")}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("header.expectedYield")}</p>
                  <p className="font-medium text-gray-700">{crop.expected_yield || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("agronomy.plantingDate")}</p>
                  <p className="font-medium text-gray-700">{crop.planting_date || "—"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* ASSETS TAB                                                    */
/* ============================================================ */
function AssetsTab({ data, money, t }) {
  return (
    <div>
      <Link
        to={`/assets`}
        className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
      >
        <ExternalLink size={15} /> {t("common.manageAllAssets")}
      </Link>

      <Card>
        <p className="py-8 text-center text-sm text-gray-400">
          {data.total_assets > 0
            ? t("common.assetsRegistered", { count: data.total_assets })
            : t("common.noAssetsRegistered")}
        </p>
      </Card>
    </div>
  );
}

/* ============================================================ */
/* HISTORY TAB                                                   */
/* ============================================================ */
function HistoryTab({ data, onAdd, t }) {
  const history = data.history || [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{t("common.farmHistoryTimeline")}</p>
        <Button onClick={onAdd}>
          <FileText size={15} /> {t("common.addRecord")}
        </Button>
      </div>

      {history.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-gray-400">
            {t("common.noHistoricalRecords")}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {history.map((h) => (
            <div
              key={h.id}
              className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-card"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Clock size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-gray-800">{h.title}</h4>
                    <p className="text-xs font-medium text-brand-600">
                      {h.event_type_display || h.event_type}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{h.event_date}</span>
                </div>
                {h.description && (
                  <p className="mt-1 text-sm text-gray-600">{h.description}</p>
                )}
                {h.recorded_by_name && (
                  <p className="mt-1 text-xs text-gray-400">{t("common.recordedBy", { name: h.recorded_by_name })}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
