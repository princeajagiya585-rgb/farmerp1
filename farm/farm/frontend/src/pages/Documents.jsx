import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, FileText, Download, GitBranch, Camera, Pencil, Trash2 } from "lucide-react";
import { api, resource } from "../lib/api";
import { compressImage } from "../lib/imageCompress";
import CameraCapture from "../components/CameraCapture";
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Table, Textarea } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const repo = resource("documents");
const CATS = ["FARM", "COMPLIANCE", "INVOICE", "EMPLOYEE", "MACHINERY", "OTHER"];
const blankForm = { title: "", category: "OTHER", farm: "", description: "", tags: "", expiry_date: "", file: null };

export default function Documents() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canWrite = hasRole("SUPER_ADMIN", "FARM_MANAGER");
  const [rows, setRows] = useState([]);
  const [farms, setFarms] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [ver, setVer] = useState(null); // {doc, file, notes} for the add-version modal
  const [edit, setEdit] = useState(null); // {id, title, category, farm, description, tags, expiry_date}
  const [del, setDel] = useState(null); // document pending delete confirmation
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [docCameraOpen, setDocCameraOpen] = useState(false);
  const [verCameraOpen, setVerCameraOpen] = useState(false);

  const load = () => repo.list().then((d) => setRows(Array.isArray(d) ? d : d.results || []));
  useEffect(() => {
    load();
    resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("category", form.category);
      if (form.farm) fd.append("farm", form.farm);
      if (form.description) fd.append("description", form.description);
      if (form.tags) fd.append("tags", form.tags);
      if (form.expiry_date) fd.append("expiry_date", form.expiry_date);
      if (form.file) fd.append("file", form.file);
      await api.post("/documents/", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setOpen(false);
      setForm(blankForm);
      load();
    } catch (e) {
      setErr(JSON.stringify(e.response?.data) || "Upload failed.");
    } finally {
      setSaving(false);
    }
  };

  const saveVersion = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", ver.file);
      if (ver.notes) fd.append("notes", ver.notes);
      await api.post(`/documents/${ver.doc.id}/add_version/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setVer(null);
      load();
    } catch (e) {
      setErr(JSON.stringify(e.response?.data) || "Version upload failed.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      await repo.update(edit.id, {
        title: edit.title,
        category: edit.category,
        farm: edit.farm || null,
        description: edit.description,
        tags: edit.tags,
        expiry_date: edit.expiry_date || null,
      });
      setEdit(null);
      load();
    } catch (e) {
      setErr(JSON.stringify(e.response?.data) || "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setSaving(true);
    setErr("");
    try {
      await repo.remove(del.id);
      setDel(null);
      load();
    } catch (e) {
      setErr(JSON.stringify(e.response?.data) || "Delete failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("documents.titlePg")}
        subtitle={t("documents.subtitlePg")}
        action={canWrite && <Button onClick={() => { setForm(blankForm); setErr(""); setOpen(true); }}><Plus size={16} /> Upload</Button>}
      />
      <Card>
        <Table
          columns={[
            { key: "title", header: t("header.title"), render: (r) => (<span className="flex items-center gap-2"><FileText size={15} className="text-gray-400" /> {r.title}</span>) },
            { key: "category", header: t("header.category"), render: (r) => <Badge color="blue">{r.category}</Badge> },
            { key: "farm_name", header: t("header.farm"), render: (r) => r.farm_name || "—" },
            {
              key: "description",
              header: t("header.description"),
              render: (r) => (
                <span className="block max-w-[220px] truncate" title={r.description || ""}>
                  {r.description || "—"}
                </span>
              ),
            },
            { key: "tags", header: t("header.tags"), render: (r) => r.tags || "—" },
            { key: "version", header: t("header.ver"), render: (r) => `v${r.version} (${r.version_count || 0} archived)` },
            { key: "expiry_date", header: t("header.expiry"), render: (r) => r.expiry_date || "—" },
            { key: "created_at", header: t("header.uploaded"), render: (r) => new Date(r.created_at).toLocaleDateString() },
            {
              key: "_a",
              header: t("header.actions"),
              render: (r) => (
                <div className="flex items-center gap-2">
                  {r.file_url && (
                    <a href={r.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline" title="Download">
                      <Download size={14} />
                    </a>
                  )}
                  {canWrite && (
                    <button onClick={() => { setVer({ doc: r, file: null, notes: "" }); setErr(""); }} className="inline-flex items-center gap-1 text-gray-500 hover:text-brand-600" title="Upload new version">
                      <GitBranch size={14} />
                    </button>
                  )}
                  {canWrite && (
                    <button
                      onClick={() => {
                        setEdit({
                          id: r.id,
                          title: r.title || "",
                          category: r.category || "OTHER",
                          farm: r.farm || "",
                          description: r.description || "",
                          tags: r.tags || "",
                          expiry_date: r.expiry_date || "",
                        });
                        setErr("");
                      }}
                      className="inline-flex items-center gap-1 text-gray-500 hover:text-brand-600"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {canWrite && (
                    <button
                      onClick={() => { setDel(r); setErr(""); }}
                      className="inline-flex items-center gap-1 text-gray-500 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          rows={rows}
          empty="No documents."
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t("documents.uploadDocument")}>
        <form onSubmit={save} className="space-y-3">
          {err && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{err}</p>}
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={CATS} />
          <Select label="Farm" value={form.farm} onChange={(e) => setForm({ ...form, farm: e.target.value })}>
            <option value="">— none (org-wide) —</option>
            {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
          <Input label="Tags (comma separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
          <div className="text-sm">
            <span className="mb-1 block font-medium text-gray-600">File</span>
            <div className="flex items-center gap-2">
              <input type="file" accept="image/*,.pdf" capture="environment" onChange={async (e) => { const f = e.target.files[0]; const small = f ? await compressImage(f) : f; setForm((prev) => ({ ...prev, file: small })); }} className="text-sm" />
              <button
                type="button"
                onClick={() => setDocCameraOpen(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
              >
                <Camera size={16} /> {t("common.takePhoto")}
              </button>
            </div>
            {form.file instanceof File && <p className="mt-1 text-xs text-gray-500">{form.file.name}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.file}>{saving ? "Uploading…" : "Upload"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!ver} onClose={() => setVer(null)} title={ver ? `New version of "${ver.doc.title}"` : ""}>
        {ver && (
          <form onSubmit={saveVersion} className="space-y-3">
            {err && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{err}</p>}
            <p className="text-sm text-gray-500">Current: v{ver.doc.version}. The existing file is archived and the version bumps to v{ver.doc.version + 1}.</p>
            <Input label="Version notes" value={ver.notes} onChange={(e) => setVer({ ...ver, notes: e.target.value })} />
            <div className="text-sm">
              <span className="mb-1 block font-medium text-gray-600">New file</span>
              <div className="flex items-center gap-2">
                <input type="file" accept="image/*,.pdf" capture="environment" onChange={async (e) => { const f = e.target.files[0]; const small = f ? await compressImage(f) : f; setVer((prev) => ({ ...prev, file: small })); }} className="text-sm" />
                <button
                  type="button"
                  onClick={() => setVerCameraOpen(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
                >
                  <Camera size={16} /> {t("common.takePhoto")}
                </button>
              </div>
              {ver.file instanceof File && <p className="mt-1 text-xs text-gray-500">{ver.file.name}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setVer(null)}>Cancel</Button>
              <Button type="submit" disabled={saving || !ver.file}>{saving ? "Uploading…" : "Upload Version"}</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Edit "${edit.title}"` : ""}>
        {edit && (
          <form onSubmit={saveEdit} className="space-y-3">
            {err && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{err}</p>}
            <Input label="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required />
            <Select label="Category" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} options={CATS} />
            <Select label="Farm" value={edit.farm} onChange={(e) => setEdit({ ...edit, farm: e.target.value })}>
              <option value="">— none (org-wide) —</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
            <Input label="Tags (comma separated)" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} />
            <Textarea label="Description" rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            <Input label="Expiry Date" type="date" value={edit.expiry_date} onChange={(e) => setEdit({ ...edit, expiry_date: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} title="Delete Document">
        {del && (
          <div className="space-y-4">
            {err && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{err}</p>}
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <span className="font-semibold">"{del.title}"</span>?
              This also removes its archived versions and cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDel(null)}>Cancel</Button>
              <Button type="button" variant="danger" onClick={confirmDelete} disabled={saving}>
                {saving ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <CameraCapture
        open={docCameraOpen}
        title={t("common.takePhoto")}
        onClose={() => setDocCameraOpen(false)}
        onCapture={(file) => { setForm((prev) => ({ ...prev, file })); setDocCameraOpen(false); }}
      />
      <CameraCapture
        open={verCameraOpen}
        title={t("common.takePhoto")}
        onClose={() => setVerCameraOpen(false)}
        onCapture={(file) => { setVer((prev) => (prev ? { ...prev, file } : prev)); setVerCameraOpen(false); }}
      />
    </div>
  );
}
