import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Search, UserX, Trash2, AlertTriangle } from "lucide-react";
import LoadingSpinner from "../components/LoadingSpinner";
import { resource, api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Badge, Button, Card, Modal, ToastContainer, useToast } from "../components/ui";
import { roleLabels } from "../config/nav";

const usersRepo = resource("auth/users");

export default function DeletedUsers() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [restoring, setRestoring] = useState(null); // user id being restored
  const [restoreConfirm, setRestoreConfirm] = useState(null); // user to restore
  const [purgeConfirm, setPurgeConfirm] = useState(false); // confirm permanent delete-all
  const [purging, setPurging] = useState(false);
  const [purgeOne, setPurgeOne] = useState(null); // single user pending permanent delete
  const [purgingOne, setPurgingOne] = useState(null); // user id being purged
  const [toasts, addToast, removeToast] = useToast();

  const loadDeletedUsers = useCallback(async () => {
    // ⛔ Do NOT fire API calls until auth initialization completes.
    // This prevents the request from racing ahead of token setup.
    if (authLoading || !user) return;
    setLoading(true);
    try {
      const data = await usersRepo.collectionAction("deleted", { page_size: 200 });
      setUsers(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.warn("[DeletedUsers] Failed to load deleted users:", err?.response?.status, err?.message);
    } finally {
      setLoading(false);
    }
  }, [authLoading, user]);

  useEffect(() => {
    loadDeletedUsers();
  }, [loadDeletedUsers]);

  const handleRestore = async () => {
    if (!restoreConfirm) return;
    const user = restoreConfirm;
    setRestoring(user.id);
    try {
      await usersRepo.action(user.id, "restore");
      setRestoreConfirm(null);
      addToast(`User "${user.username}" restored successfully.`, "success");
      loadDeletedUsers();
    } catch (e) {
      setRestoreConfirm(null);
      const detail = e?.response?.data?.detail || "Failed to restore user.";
      addToast(detail, "error");
    } finally {
      setRestoring(null);
    }
  };

  const handlePurge = async () => {
    setPurging(true);
    try {
      const res = await api.post("/auth/users/purge-deleted/");
      const n = res?.data?.deleted ?? users.length;
      setPurgeConfirm(false);
      addToast(`Permanently deleted ${n} user(s).`, "success");
      loadDeletedUsers();
    } catch (e) {
      setPurgeConfirm(false);
      const detail = e?.response?.data?.detail || "Failed to permanently delete users.";
      addToast(detail, "error");
    } finally {
      setPurging(false);
    }
  };

  // Staff archived alongside a super admin go with them when that admin is
  // erased for good — the confirmation says how many, so the reach of the
  // button is visible before it is pressed.
  const linkedTo = (u) => users.filter((x) => x.deleted_with === u.id);

  const handlePurgeOne = async () => {
    if (!purgeOne) return;
    const target = purgeOne;
    setPurgingOne(target.id);
    try {
      const res = await api.post(`/auth/users/${target.id}/purge/`);
      const n = res?.data?.deleted ?? 1;
      setPurgeOne(null);
      addToast(
        n > 1
          ? `Permanently deleted "${target.username}" and ${n - 1} linked account(s).`
          : `Permanently deleted "${target.username}".`,
        "success",
      );
      loadDeletedUsers();
    } catch (e) {
      setPurgeOne(null);
      const detail = e?.response?.data?.detail || "Failed to permanently delete user.";
      addToast(detail, "error");
    } finally {
      setPurgingOne(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Deleted Users</h2>
            <p className="mt-1 text-sm text-gray-500">
              Soft-deleted users. You can restore them, or permanently delete them all.
            </p>
          </div>
          {users.length > 0 && user?.role === "SUPER_ADMIN" && (
            <Button variant="danger" onClick={() => setPurgeConfirm(true)} disabled={purging}>
              <Trash2 size={16} /> Delete All Permanently
            </Button>
          )}
        </div>

        <div className="px-6 py-4">
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search deleted users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
            />
          </div>

          {loading ? (
            <LoadingSpinner fullScreen={false} size="md" message={t("common.loading")} />
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <UserX size={48} className="mb-3" />
              <p className="text-sm font-medium">
                {users.length === 0
                  ? "No deleted users found."
                  : "No users match your search."}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {users.length === 0
                  ? "When you delete a user from the Users page, they will appear here."
                  : "Try a different search term."}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-red-200">
                  <thead className="bg-gradient-to-r from-red-100 to-orange-100">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-red-900">
                        {t("header.username")}
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-red-900">
                        {t("header.name")}
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-red-900">
                        {t("header.role")}
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-red-900">
                        Deleted On
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-red-900">
                        Deleted By
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-red-900">
                        {t("header.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-200">
                    {filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-red-200 bg-gradient-to-r from-red-50/50 to-orange-50/50 opacity-80 hover:opacity-100 transition-opacity"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {user.username}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {user.full_name || "—"}
                          {user.deleted_with_name && (
                            <span className="mt-0.5 block text-[0.7rem] text-red-600">
                              archived with {user.deleted_with_name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge color="purple">{roleLabels[user.role] || user.role}</Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {user.deleted_at
                            ? new Date(user.deleted_at).toLocaleDateString("en-IN", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {user.deleted_by_name || "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setRestoreConfirm(user)}
                              disabled={restoring === user.id || purgingOne === user.id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              <RotateCcw size={13} />
                              {restoring === user.id ? "Restoring..." : "Restore"}
                            </button>
                            <button
                              onClick={() => setPurgeOne(user)}
                              disabled={restoring === user.id || purgingOne === user.id}
                              title={`Permanently delete ${user.username}`}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              <Trash2 size={13} />
                              {purgingOne === user.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ── Restore Confirmation Modal ────────────────────── */}
      <Modal open={!!restoreConfirm} onClose={() => setRestoreConfirm(null)} title="Restore User" width="max-w-sm">
        {restoreConfirm && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-green-50 p-4 text-sm text-green-800 ring-1 ring-green-200">
              <RotateCcw size={20} className="shrink-0 text-green-600" />
              <p>
                Are you sure you want to restore user{" "}
                <strong>{restoreConfirm.username}</strong>?
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <p>
                <span className="font-medium text-gray-700">Username:</span>{" "}
                {restoreConfirm.username}
              </p>
              <p>
                <span className="font-medium text-gray-700">Name:</span>{" "}
                {restoreConfirm.full_name || "—"}
              </p>
              <p>
                <span className="font-medium text-gray-700">Role:</span>{" "}
                {roleLabels[restoreConfirm.role] || restoreConfirm.role}
              </p>
              <p>
                <span className="font-medium text-gray-700">Deleted:</span>{" "}
                {restoreConfirm.deleted_at
                  ? new Date(restoreConfirm.deleted_at).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </p>
            </div>
            <p className="text-xs text-green-700 bg-green-50 rounded-lg p-3">
              <strong>Note:</strong> The user will be reactivated with their original
              username, role, and farm assignments. They will be able to log in
              immediately after restoration.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRestoreConfirm(null)}
                disabled={restoring === restoreConfirm.id}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleRestore}
                disabled={restoring === restoreConfirm.id}
                className="!bg-green-600 hover:!bg-green-700"
              >
                {restoring === restoreConfirm.id ? (
                  "Restoring..."
                ) : (
                  <>
                    <RotateCcw size={15} /> Restore User
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Single Permanent Delete Confirmation Modal ────────────────── */}
      <Modal
        open={!!purgeOne}
        onClose={() => !purgingOne && setPurgeOne(null)}
        title="Delete Permanently"
        width="max-w-sm"
      >
        {purgeOne && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
              <AlertTriangle size={20} className="shrink-0 text-red-600" />
              <p>
                Permanently delete <strong>{purgeOne.username}</strong>? This{" "}
                <strong>cannot be undone</strong> — the account can no longer be
                restored.
              </p>
            </div>
            {linkedTo(purgeOne).length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
                <p className="font-medium">
                  {linkedTo(purgeOne).length} linked account(s) will be erased too:
                </p>
                <p className="mt-1">
                  {linkedTo(purgeOne)
                    .map((u) => u.full_name || u.username)
                    .join(", ")}
                </p>
              </div>
            )}
            <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              Attendance and payroll history is kept (the employee record stays,
              just unlinked). Notifications and location pings are removed.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPurgeOne(null)}
                disabled={purgingOne === purgeOne.id}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handlePurgeOne}
                disabled={purgingOne === purgeOne.id}
              >
                {purgingOne === purgeOne.id ? (
                  "Deleting..."
                ) : (
                  <>
                    <Trash2 size={15} /> Delete Permanently
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Permanent Delete-All Confirmation Modal ────────────────────── */}
      <Modal open={purgeConfirm} onClose={() => setPurgeConfirm(false)} title="Delete All Permanently" width="max-w-sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
            <AlertTriangle size={20} className="shrink-0 text-red-600" />
            <p>
              This will <strong>permanently delete all {users.length} deleted user(s)</strong>.
              This <strong>cannot be undone</strong> — they can no longer be restored.
            </p>
          </div>
          <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            Their attendance and payroll history is kept (the employee record stays,
            just unlinked). Their notifications and location pings are removed.
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setPurgeConfirm(false)} disabled={purging}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={handlePurge} disabled={purging}>
              {purging ? "Deleting..." : (<><Trash2 size={15} /> Delete All Permanently</>)}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
