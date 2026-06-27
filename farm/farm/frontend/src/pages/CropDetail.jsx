import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Leaf } from "lucide-react";
import { api } from "../lib/api";
import { Card, Button, Badge, Table, Modal, Input, Select, Textarea } from "../components/ui";

const statusColor = {
  PLANNED: "gray",
  PLANTED: "blue",
  GROWING: "green",
  HARVESTED: "purple",
  FAILED: "red",
};

const obsTypeColor = {
  PEST: "red",
  DISEASE: "red",
  NUTRIENT: "yellow",
  WEATHER: "blue",
  GROWTH: "green",
};

const severityColor = { LOW: "gray", MEDIUM: "yellow", HIGH: "red" };

const inputTypeColor = {
  FERTILIZER: "green",
  PESTICIDE: "red",
  HERBICIDE: "yellow",
  BIOLOGICAL: "blue",
  IRRIGATION: "blue",
};

function Fact({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-700">{value ?? "—"}</p>
    </div>
  );
}

// Generic add-record modal driven by a list of field descriptors.
function AddModal({ open, onClose, title, fields, onSubmit }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({});
      setError("");
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {};
      fields.forEach((f) => {
        let v = form[f.name];
        if (v === undefined || v === "") {
          payload[f.name] = null;
          return;
        }
        payload[f.name] = f.type === "number" ? Number(v) : v;
      });
      await onSubmit(payload);
      onClose();
    } catch (err) {
      const d = err.response?.data;
      setError(typeof d === "object" ? JSON.stringify(d) : d || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        {fields.map((f) => {
          const common = {
            value: form[f.name] ?? "",
            onChange: (e) => setForm({ ...form, [f.name]: e.target.value }),
            required: f.required,
          };
          if (f.type === "select")
            return (
              <Select key={f.name} label={f.label} {...common}>
                <option value="">— select —</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            );
          if (f.type === "textarea")
            return <Textarea key={f.name} label={f.label} rows={3} {...common} />;
          return <Input key={f.name} label={f.label} type={f.type || "text"} {...common} />;
        })}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CropDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [crop, setCrop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // "observation" | "input" | "harvest"

  const fetchHistory = async () => {
    try {
      const { data } = await api.get(`/agronomy/crops/${id}/history/`);
      setCrop(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to load crop.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <p className="py-12 text-center text-gray-400">Loading…</p>;
  if (error || !crop)
    return (
      <div>
        <Button variant="secondary" onClick={() => navigate("/agronomy")}>
          <ArrowLeft size={16} /> Back
        </Button>
        <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-600">{error || "Not found."}</p>
      </div>
    );

  const observations = crop.observations || [];
  const inputApplications = crop.input_applications || [];
  const growthRecords = crop.growth_records || [];
  const harvestRecords = crop.harvest_records || [];
  const farm = crop.farm;

  const addObservation = (payload) =>
    api.post("/agronomy/observations/", { ...payload, crop: id, farm }).then(fetchHistory);
  const addInput = (payload) =>
    api.post("/agronomy/input-applications/", { ...payload, crop: id, farm }).then(fetchHistory);
  const addHarvest = (payload) =>
    api.post("/agronomy/harvest-records/", { ...payload, crop: id, farm }).then(fetchHistory);

  return (
    <div className="space-y-5">
      <Button variant="secondary" onClick={() => navigate("/agronomy")}>
        <ArrowLeft size={16} /> Back
      </Button>

      {/* Crop summary */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="rounded-lg bg-green-100 p-2 text-green-600">
            <Leaf size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              {crop.name}
              {crop.variety ? ` · ${crop.variety}` : ""}
            </h2>
          </div>
          <Badge color={statusColor[crop.status] || "gray"}>{crop.status}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Fact label="Farm" value={crop.farm_name} />
          <Fact label="Season" value={crop.season} />
          <Fact label="Area (ac)" value={crop.area} />
          <Fact label="Growth Stage" value={crop.growth_stage} />
          <Fact label="Planting Date" value={crop.planting_date} />
          <Fact label="Expected Harvest" value={crop.expected_harvest_date} />
          <Fact label="Expected Yield" value={crop.expected_yield} />
        </div>
      </Card>

      {/* Observations */}
      <Card
        title={`Observations (${observations.length})`}
        action={
          <Button onClick={() => setModal("observation")}>
            <Plus size={16} /> Add
          </Button>
        }
      >
        <Table
          columns={[
            { key: "observed_on", header: t("header.date") },
            {
              key: "observation_type",
              header: t("header.type"),
              render: (r) => <Badge color={obsTypeColor[r.observation_type] || "gray"}>{r.observation_type}</Badge>,
            },
            {
              key: "severity",
              header: t("header.severity"),
              render: (r) => <Badge color={severityColor[r.severity] || "gray"}>{r.severity}</Badge>,
            },
            { key: "title", header: t("header.title") },
            { key: "description", header: t("header.description") },
          ]}
          rows={observations}
        />
      </Card>

      {/* Input Applications */}
      <Card
        title={`Input Applications (${inputApplications.length})`}
        action={
          <Button onClick={() => setModal("input")}>
            <Plus size={16} /> Add
          </Button>
        }
      >
        <Table
          columns={[
            { key: "applied_on", header: t("header.date") },
            {
              key: "input_type",
              header: t("header.type"),
              render: (r) => <Badge color={inputTypeColor[r.input_type] || "gray"}>{r.input_type}</Badge>,
            },
            { key: "product_name", header: t("header.product") },
            { key: "qty", header: t("header.quantity"), render: (r) => `${r.quantity ?? ""} ${r.unit ?? ""}`.trim() },
            { key: "dosage", header: t("header.dosage") },
            { key: "cost", header: t("header.cost") },
          ]}
          rows={inputApplications}
        />
      </Card>

      {/* Growth Records (read-only) */}
      <Card title={`Growth Records (${growthRecords.length})`}>
        <Table
          columns={[
            { key: "date", header: t("header.date") },
            { key: "stage", header: t("header.stage") },
            { key: "height_cm", header: t("header.height") },
            { key: "health_index", header: t("header.healthIndex") },
          ]}
          rows={growthRecords}
        />
      </Card>

      {/* Harvest Records */}
      <Card
        title={`Harvest Records (${harvestRecords.length})`}
        action={
          <Button onClick={() => setModal("harvest")}>
            <Plus size={16} /> Add
          </Button>
        }
      >
        <Table
          columns={[
            { key: "date", header: t("header.date") },
            { key: "qty", header: t("header.quantity"), render: (r) => `${r.quantity ?? ""} ${r.unit ?? ""}`.trim() },
            { key: "quality_grade", header: t("header.grade") },
            { key: "yield_per_acre", header: t("header.yieldPerAcre") },
            { key: "revenue", header: t("header.revenue") },
          ]}
          rows={harvestRecords}
        />
      </Card>

      <AddModal
        open={modal === "observation"}
        onClose={() => setModal(null)}
        title="Add Observation"
        onSubmit={addObservation}
        fields={[
          { name: "observed_on", label: "Observed On", type: "date", required: true },
          {
            name: "observation_type",
            label: "Type",
            type: "select",
            options: ["PEST", "DISEASE", "NUTRIENT", "WEATHER", "GROWTH"],
            required: true,
          },
          { name: "severity", label: "Severity", type: "select", options: ["LOW", "MEDIUM", "HIGH"], required: true },
          { name: "title", label: "Title", required: true },
          { name: "description", label: "Description", type: "textarea" },
        ]}
      />

      <AddModal
        open={modal === "input"}
        onClose={() => setModal(null)}
        title="Add Input Application"
        onSubmit={addInput}
        fields={[
          { name: "applied_on", label: "Applied On", type: "date", required: true },
          {
            name: "input_type",
            label: "Type",
            type: "select",
            options: ["FERTILIZER", "PESTICIDE", "HERBICIDE", "BIOLOGICAL", "IRRIGATION"],
            required: true,
          },
          { name: "product_name", label: "Product Name", required: true },
          { name: "quantity", label: "Quantity", type: "number" },
          { name: "unit", label: "Unit" },
          { name: "dosage", label: "Dosage" },
          { name: "cost", label: "Cost", type: "number" },
        ]}
      />

      <AddModal
        open={modal === "harvest"}
        onClose={() => setModal(null)}
        title="Add Harvest Record"
        onSubmit={addHarvest}
        fields={[
          { name: "date", label: "Date", type: "date", required: true },
          { name: "quantity", label: "Quantity", type: "number" },
          { name: "unit", label: "Unit" },
          { name: "quality_grade", label: "Quality Grade" },
          { name: "yield_per_acre", label: "Yield per Acre", type: "number" },
          { name: "revenue", label: "Revenue", type: "number" },
        ]}
      />
    </div>
  );
}
