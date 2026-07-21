/**
 * Super Admin Accounts — the roster of every super admin, owner-only.
 *
 * The ordinary Users page scopes a super admin to their own farms, so it can
 * never show admins running other farms. This page reads the unscoped
 * owner-only endpoint (`/auth/users/super-admins/`) and is reachable solely by
 * the main super admin, the same account that creates these logins.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ShieldCheck, Crown, Pencil, Trash2, KeyRound, RotateCcw } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { Badge, Button, Input, Modal, PageHeader, Table } from "../components/ui";
import { api } from "../lib/api";

const fmtDate = (v) =>
  v
    ? new Date(v).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const fmtDateTime = (v) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Never signed in";

export default function SuperAdminAccounts() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [deleted, setDeleted] = useState([]); // soft-deleted super admins
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(null); // row being edited
  const [form, setForm] = useState({});
  const [deleting, setDeleting] = useState(null); // row pending soft-deletion
  const [purging, setPurging] = useState(null); // deleted row pending permanent delete
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => {
    setLoading(true);
    // Live roster + the trash of deleted admins, both owner-only. Deleted admins
    // live nowhere else: the tenant-scoped Deleted Users page hides them.
    return Promise.all([
      api.get("/auth/users/super-admins/"),
      api.get("/auth/users/deleted-super-admins/"),
    ])
      .then(([liveRes, delRes]) => {
        const live = liveRes.data;
        setRows(Array.isArray(live) ? live : live?.results || []);
        const del = delRes.data;
        setDeleted(Array.isArray(del) ? del : del?.results || []);
        setError("");
      })
      .catch((err) => {
        setError(
          err.response?.status === 403
            ? "Only the main super administrator can view super admin accounts."
            : err.response?.data?.detail || "Could not load super admin accounts.",
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const apiError = (err, fallback) => {
    const data = err.response?.data || {};
    const first = Object.values(data)[0];
    return (
      data.detail || (Array.isArray(first) ? first[0] : first) || fallback
    );
  };

  const openEdit = (row) => {
    setEditing(row);
    setFormError("");
    setForm({
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      email: row.email || "",
      phone: row.phone || "",
      password: "",
      password2: "",
    });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (form.password && form.password.length < 6) {
      setFormError("New password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.password2) {
      setFormError("The two passwords do not match.");
      return;
    }
    const payload = {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone,
    };
    // Only send a password when one was actually typed — an empty string would
    // be rejected by the serializer's min_length and blocks a plain profile edit.
    // password2 must go with it: the serializer rejects the change without it.
    if (form.password) {
      payload.password = form.password;
      payload.password2 = form.password2;
    }

    setBusy(true);
    try {
      await api.patch(`/auth/users/${editing.id}/`, payload);
      setNotice(
        form.password
          ? `Updated ${editing.username} and set a new password.`
          : `Updated ${editing.username}.`,
      );
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(apiError(err, "Could not save changes."));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/auth/users/${deleting.id}/`);
      setNotice(`Deleted ${deleting.username}.`);
      setDeleting(null);
      await load();
    } catch (err) {
      setError(apiError(err, "Could not delete the account."));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  const restoreAdmin = async (row) => {
    setBusy(true);
    try {
      await api.post(`/auth/users/${row.id}/restore/`);
      setNotice(`Restored ${row.username}${row.deleted_with_name ? "" : " and their team"}.`);
      await load();
    } catch (err) {
      setError(apiError(err, "Could not restore the account."));
    } finally {
      setBusy(false);
    }
  };

  const confirmPurge = async () => {
    setBusy(true);
    try {
      await api.post(`/auth/users/${purging.id}/purge/`);
      setNotice(`Permanently deleted ${purging.username}.`);
      setPurging(null);
      await load();
    } catch (err) {
      setError(apiError(err, "Could not permanently delete the account."));
      setPurging(null);
    } finally {
      setBusy(false);
    }
  };

  const deletedColumns = [
    {
      key: "full_name",
      header: "Administrator",
      render: (r) => <span className="font-medium text-gray-800">{r.full_name || r.username}</span>,
    },
    { key: "username", header: "Username", render: (r) => <span className="text-gray-600">{r.username}</span> },
    { key: "email", header: "Email", render: (r) => r.email || "—" },
    { key: "deleted_at", header: "Deleted On", render: (r) => fmtDateTime(r.deleted_at) },
    { key: "deleted_by_name", header: "Deleted By", render: (r) => r.deleted_by_name || "—" },
    {
      key: "actions",
      header: "Action",
      render: (r) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => restoreAdmin(r)}
            title={`Restore ${r.username} and their team`}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 transition enabled:hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={14} /> Restore
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPurging(r)}
            title={`Permanently delete ${r.username}`}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition enabled:hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      ),
    },
  ];

  const columns = [
    {
      key: "full_name",
      header: "Administrator",
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-800">{r.full_name || r.username}</span>
          {r.is_superuser && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-amber-700"
              title="Main super administrator — the only account that can create super admins"
            >
              <Crown size={10} /> Main
            </span>
          )}
        </div>
      ),
    },
    { key: "username", header: "Username", render: (r) => <span className="text-gray-600">{r.username}</span> },
    { key: "email", header: "Email", render: (r) => r.email || "—" },
    { key: "phone", header: "Phone", render: (r) => r.phone || "—" },
    {
      key: "password",
      header: "Password",
      // Passwords are stored as one-way PBKDF2 hashes — there is no plaintext
      // to show, for this account or any other. The column offers the only
      // meaningful action instead: set a new one.
      render: (r) => (
        <button
          type="button"
          onClick={() => openEdit(r)}
          title={`Set a new password for ${r.username}`}
          className="group inline-flex items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-gray-50"
        >
          <span className="font-mono text-sm tracking-[0.2em] text-gray-400">••••••••</span>
          <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-brand-700 opacity-0 transition group-hover:opacity-100">
            <KeyRound size={11} /> Set new
          </span>
        </button>
      ),
    },
    { key: "date_joined", header: "Created", render: (r) => fmtDate(r.date_joined) },
    {
      key: "is_active",
      header: "Status",
      render: (r) =>
        r.is_active ? <Badge color="green">Active</Badge> : <Badge color="gray">Suspended</Badge>,
    },
    {
      key: "actions",
      header: "Action",
      render: (r) => {
        const isSelf = r.id === user?.id;
        // The owner account can't be deleted (it alone can create super admins)
        // and you can't delete yourself — both are enforced by the API too.
        const blockReason = r.is_superuser
          ? "The main super administrator cannot be deleted"
          : isSelf
            ? "You cannot delete your own account"
            : "";
        return (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openEdit(r)}
              title={`Edit ${r.username}`}
              className="rounded-lg p-1.5 text-gray-500 transition hover:bg-brand-50 hover:text-brand-700"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              disabled={Boolean(blockReason)}
              onClick={() => setDeleting(r)}
              title={blockReason || `Delete ${r.username}`}
              className="rounded-lg p-1.5 text-gray-500 transition enabled:hover:bg-red-50 enabled:hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 size={15} />
            </button>
          </div>
        );
      },
    },
  ];

  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <div>
      <PageHeader
        title="Super Admin Accounts"
        subtitle="Every super administrator across all farms — visible to the main super admin only."
        action={
          <Link to="/users/create-super-admin">
            <Button className="bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800">
              <Plus size={16} /> Create Super Admin
            </Button>
          </Link>
        }
      />

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            className="shrink-0 text-brand-600 hover:text-brand-800"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          {error}
        </div>
      ) : (
        <>
          {/* Summary strip — the count is the point of this page. */}
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
                Total super admins
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-brand-900">
                {loading ? "—" : rows.length}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Active</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-gray-800">
                {loading ? "—" : activeCount}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Signed in as
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                <ShieldCheck size={15} className="text-brand-600" />
                {user?.full_name || user?.username}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center text-sm text-gray-400">
              Loading super admin accounts…
            </div>
          ) : (
            <Table
              columns={columns}
              rows={rows}
              empty="No super admin accounts yet."
            />
          )}

          {!loading && rows.length > 0 && (
            <p className="mt-4 text-xs text-gray-400">
              Last sign-in:{" "}
              {rows
                .map((r) => `${r.username} — ${fmtDateTime(r.last_login)}`)
                .join(" · ")}
            </p>
          )}

          {/* Deleted super admins — restore the whole team or remove for good.
              Owner-only, and the only place a deleted admin can be managed. */}
          {!loading && deleted.length > 0 && (
            <div className="mt-8">
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700">
                <Trash2 size={15} className="text-red-500" />
                Deleted Super Admins
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                  {deleted.length}
                </span>
              </h3>
              <p className="mb-3 mt-1 text-xs text-gray-400">
                Restoring an admin brings back the managers and employees archived with
                them. Permanent delete removes the whole group's logins for good.
              </p>
              <Table columns={deletedColumns} rows={deleted} empty="No deleted super admins." />
            </div>
          )}
        </>
      )}

      {/* Edit / set password */}
      <Modal
        open={Boolean(editing)}
        onClose={() => !busy && setEditing(null)}
        title={editing ? `Edit ${editing.username}` : ""}
      >
        <form onSubmit={saveEdit} className="space-y-4">
          {formError && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{formError}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First Name"
              value={form.first_name || ""}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
            <Input
              label="Last Name"
              value={form.last_name || ""}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={form.email || ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Phone"
            value={form.phone || ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <KeyRound size={13} className="text-brand-600" />
              Set a new password
            </p>
            <p className="mb-3 text-[0.7rem] leading-relaxed text-gray-500">
              Existing passwords are stored as one-way hashes and cannot be read
              back — not by you, not by anyone. Leave these blank to keep the
              current password unchanged.
            </p>
            <div className="space-y-3">
              <Input
                label="New Password"
                type="password"
                value={form.password || ""}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 6 characters"
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={form.password2 || ""}
                onChange={(e) => setForm({ ...form, password2: e.target.value })}
                placeholder="Re-enter new password"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={Boolean(deleting)}
        onClose={() => !busy && setDeleting(null)}
        title="Delete super admin account"
      >
        <p className="text-sm text-gray-600">
          Delete <strong>{deleting?.username}</strong>
          {deleting?.full_name ? ` (${deleting.full_name})` : ""}? They will no
          longer be able to sign in.
        </p>
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          Their farm managers and employees are archived with them and lose access
          too — a farm with no administrator should not stay open. Nothing is
          erased: farms, work history and records stay intact, and restoring the
          admin from Deleted Users brings the whole team back.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={confirmDelete}
            disabled={busy}
            className="bg-red-600 hover:bg-red-700"
          >
            {busy ? "Deleting…" : "Delete Account"}
          </Button>
        </div>
      </Modal>

      {/* Permanent delete (purge) confirmation */}
      <Modal
        open={Boolean(purging)}
        onClose={() => !busy && setPurging(null)}
        title="Permanently delete super admin"
      >
        <p className="text-sm text-gray-600">
          Permanently delete <strong>{purging?.username}</strong>
          {purging?.full_name ? ` (${purging.full_name})` : ""}? This cannot be undone.
        </p>
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-800">
          The managers and employees archived with this admin are permanently deleted
          too. Their farms and work history (attendance, payroll, tasks) stay intact —
          only the login accounts are removed.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setPurging(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={confirmPurge}
            disabled={busy}
            className="bg-red-600 hover:bg-red-700"
          >
            {busy ? "Deleting…" : "Delete Permanently"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
