/**
 * Create Super Admin Account — owner-only.
 *
 * This used to be a public card on the login screen, which meant anyone could
 * mint a super admin and a farm. It now lives inside the app and is reachable
 * only by the main super admin (the account flagged `is_superuser`), who
 * provisions every other admin. The backend enforces the same rule.
 *
 * Creating an account here does NOT switch sessions — the owner stays signed in.
 */
import { useState } from "react";
import { Leaf, ShieldCheck } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui";
import GrowingTree from "../components/GrowingTree";
import LeafField from "../components/LeafField";
import { api } from "../lib/api";

const REG_FIELDS = [
  { key: "farm_name", required: true },
  { key: "first_name", required: false },
  { key: "last_name", required: false },
  { key: "username", required: true },
  { key: "email", required: true },
  { key: "phone", required: false },
  { key: "password", required: true },
  { key: "password2", required: true },
];

const EMPTY = {
  farm_name: "",
  first_name: "",
  last_name: "",
  username: "",
  email: "",
  phone: "",
  password: "",
  password2: "",
};

export default function CreateSuperAdmin() {
  const { user } = useAuth();
  const [reg, setReg] = useState(EMPTY);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState(false);

  const setField = (field) => (e) =>
    setReg((prev) => ({ ...prev, [field]: e.target.value }));

  const leaves = REG_FIELDS.filter((f) => reg[f.key]?.trim()).length;
  const complete =
    REG_FIELDS.every((f) => !f.required || reg[f.key]?.trim()) &&
    reg.password === reg.password2 &&
    reg.password.length >= 6;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (reg.password !== reg.password2) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register/", reg);
      // Deliberately no login() call: the owner keeps their own session.
      setCreated({ username: reg.username, farm: data?.farm?.name || reg.farm_name });
      setReg(EMPTY);
    } catch (err) {
      if (!err.response) {
        setError("Cannot connect to server. Check your connection and try again.");
      } else if (err.response.status === 403) {
        setError("Only the main super administrator can create super admin accounts.");
      } else {
        const data = err.response?.data || {};
        const first = Object.values(data)[0];
        setError(
          data.detail ||
            (Array.isArray(first) ? first[0] : first) ||
            "Could not create the account.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Belt and braces — the route already gates this, and so does the API.
  if (!user?.is_superuser) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Only the main super administrator can create super admin accounts.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="relative overflow-hidden rounded-3xl border border-brand-200 bg-white shadow-lift">
        <div className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-brand-50/60 to-white px-8 pt-7">
          <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-brand-200/25 blur-2xl" />
          <div className="pointer-events-none absolute -right-20 -top-10 h-52 w-52 rounded-full bg-emerald-300/20 blur-2xl" />

          <div className="relative flex items-center justify-center gap-2">
            <Leaf size={18} className="text-brand-600" />
            <h2 className="text-center text-xl font-bold tracking-tight text-brand-900">
              Create Super Admin Account
            </h2>
          </div>

          <GrowingTree grown={leaves} total={REG_FIELDS.length} complete={complete} />

          <div className="relative mx-auto -mt-2 max-w-xs">
            <p className="text-center text-xs font-medium text-brand-800">
              {complete
                ? "Your tree is in bloom — plant this farm 🌳"
                : `${leaves} of ${REG_FIELDS.length} leaves grown`}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500 ease-out"
                style={{ width: `${(leaves / REG_FIELDS.length) * 100}%` }}
              />
            </div>
          </div>

          <p className="relative mt-4 flex items-center justify-center gap-1.5 pb-5 text-center text-xs leading-relaxed text-gray-500">
            <ShieldCheck size={13} className="shrink-0 text-brand-600" />
            You are the main super administrator — only you can create these accounts.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 px-8 pb-8 pt-1">
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          {created && (
            <p className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
              Created <strong>{created.username}</strong> as super admin of{" "}
              <strong>{created.farm}</strong>. They can sign in now — you are still
              signed in as yourself.
            </p>
          )}

          <LeafField
            label="Farm Name"
            value={reg.farm_name}
            onChange={setField("farm_name")}
            placeholder="e.g. Green Valley Estate"
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <LeafField
              label="First Name"
              value={reg.first_name}
              onChange={setField("first_name")}
              placeholder="First name"
            />
            <LeafField
              label="Last Name"
              value={reg.last_name}
              onChange={setField("last_name")}
              placeholder="Last name"
            />
          </div>

          <LeafField
            label="Username"
            value={reg.username}
            onChange={setField("username")}
            placeholder="Choose a username"
            required
          />

          <LeafField
            label="Email"
            type="email"
            value={reg.email}
            onChange={setField("email")}
            placeholder="Used for password reset"
            required
          />

          <LeafField
            label="Phone"
            value={reg.phone}
            onChange={setField("phone")}
            placeholder="Optional"
          />

          <LeafField
            label="Password"
            type="password"
            value={reg.password}
            onChange={setField("password")}
            placeholder="At least 6 characters"
            invalid={Boolean(reg.password) && reg.password.length < 6}
            hint={
              reg.password && reg.password.length < 6
                ? "Needs at least 6 characters."
                : undefined
            }
            required
          />

          <LeafField
            label="Confirm Password"
            type="password"
            value={reg.password2}
            onChange={setField("password2")}
            placeholder="Re-enter password"
            invalid={Boolean(reg.password2) && reg.password !== reg.password2}
            hint={
              reg.password2 && reg.password !== reg.password2
                ? "Passwords don't match yet."
                : undefined
            }
            required
          />

          <div className="flex gap-3 pt-1">
            <Button
              type="submit"
              className="flex-1 bg-gradient-to-r from-brand-600 to-brand-700 py-2.5 shadow-soft hover:from-brand-700 hover:to-brand-800"
              disabled={loading}
            >
              <Leaf size={16} className={loading ? "animate-pulse" : ""} />
              {loading ? "Planting…" : "Plant This Farm"}
            </Button>
            {(leaves > 0 || created) && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setReg(EMPTY);
                  setError("");
                  setCreated(null);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
