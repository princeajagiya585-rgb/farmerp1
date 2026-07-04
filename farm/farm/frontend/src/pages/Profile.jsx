import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Mail, Phone, Save, Lock, CheckCircle2, AlertCircle, ShieldCheck, Upload } from "lucide-react";
import { api, toFormData } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, PhotoThumb, Select, PageHeader, Badge } from "../components/ui";
import { roleLabels } from "../config/nav";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "mr", label: "Marathi" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
];

function initials(user) {
  const name =
    user?.full_name ||
    `${user?.first_name || ""} ${user?.last_name || ""}`.trim() ||
    user?.username ||
    "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function Banner({ kind, children }) {
  if (!children) return null;
  const ok = kind === "success";
  const Icon = ok ? CheckCircle2 : AlertCircle;
  return (
    <div
      className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        ok
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      <Icon size={16} />
      <span>{children}</span>
    </div>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [profile, setProfile] = useState(user || null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ kind: "", text: "" });

  const [pwd, setPwd] = useState({
    old_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState({ kind: "", text: "" });

  // Aadhaar verification (optional / recommended)
  const [aadhaar, setAadhaar] = useState({ number: "", file: null });
  const [savingAadhaar, setSavingAadhaar] = useState(false);
  const [aadhaarMsg, setAadhaarMsg] = useState({ kind: "", text: "" });

  useEffect(() => {
    let active = true;
    api
      .get("/auth/users/me/")
      .then(({ data }) => {
        if (!active) return;
        setProfile(data);
        setForm({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          email: data.email || "",
          phone: data.phone || "",
        });
        setAadhaar((a) => ({ ...a, number: data.aadhaar_number || "" }));
      })
      .catch(() => {
        /* keep context user as fallback */
      });
    return () => {
      active = false;
    };
  }, []);

  const onFormChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submitProfile = async (e) => {
    e.preventDefault();
    setProfileMsg({ kind: "", text: "" });
    setSavingProfile(true);
    try {
      const { data } = await api.patch("/auth/users/me/", form);
      setProfile((p) => ({ ...(p || {}), ...data }));
      setProfileMsg({ kind: "success", text: "Profile updated successfully." });
    } catch (err) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.email?.[0] ||
        "Could not update profile. Please try again.";
      setProfileMsg({ kind: "error", text: detail });
    } finally {
      setSavingProfile(false);
    }
  };

  const onPwdChange = (e) =>
    setPwd((p) => ({ ...p, [e.target.name]: e.target.value }));

  const submitPassword = async (e) => {
    e.preventDefault();
    setPwdMsg({ kind: "", text: "" });

    if (pwd.new_password.length < 6) {
      setPwdMsg({ kind: "error", text: "New password must be at least 6 characters." });
      return;
    }
    if (pwd.new_password !== pwd.confirm_password) {
      setPwdMsg({ kind: "error", text: "New password and confirmation do not match." });
      return;
    }

    setSavingPwd(true);
    try {
      await api.post("/auth/users/change_password/", {
        old_password: pwd.old_password,
        new_password: pwd.new_password,
      });
      setPwd({ old_password: "", new_password: "", confirm_password: "" });
      setPwdMsg({ kind: "success", text: "Password changed successfully." });
    } catch (err) {
      const data = err.response?.data || {};
      const detail =
        data.old_password?.[0] ||
        data.old_password ||
        data.new_password?.[0] ||
        data.detail ||
        "Could not change password. Please try again.";
      setPwdMsg({ kind: "error", text: detail });
    } finally {
      setSavingPwd(false);
    }
  };

  const submitAadhaar = async (e) => {
    e.preventDefault();
    setAadhaarMsg({ kind: "", text: "" });
    const num = (aadhaar.number || "").replace(/\s/g, "");
    if (num && !/^\d{12}$/.test(num)) {
      setAadhaarMsg({ kind: "error", text: "Aadhaar number must be 12 digits." });
      return;
    }
    if (!num && !aadhaar.file) {
      setAadhaarMsg({ kind: "error", text: "Enter your Aadhaar number or upload a photo." });
      return;
    }
    setSavingAadhaar(true);
    try {
      const payload = { aadhaar_number: num };
      if (aadhaar.file) payload.aadhaar_photo = aadhaar.file;
      const { data } = await api.patch("/auth/users/me/", toFormData(payload));
      setProfile((p) => ({ ...(p || {}), ...data }));
      setAadhaar({ number: data.aadhaar_number || "", file: null });
      setAadhaarMsg({ kind: "success", text: "Aadhaar details saved. Thank you!" });
      // let the recommendation banner hide itself
      window.dispatchEvent(new CustomEvent("aadhaar-updated"));
    } catch (err) {
      const d = err.response?.data || {};
      const detail =
        d.aadhaar_photo?.[0] || d.aadhaar_number?.[0] || d.detail ||
        "Could not save Aadhaar details. Please try again.";
      setAadhaarMsg({ kind: "error", text: detail });
    } finally {
      setSavingAadhaar(false);
    }
  };

  const u = profile || user || {};
  const isSuperAdmin = u.role === "SUPER_ADMIN";
  const fullName =
    u.full_name ||
    `${u.first_name || ""} ${u.last_name || ""}`.trim() ||
    u.username ||
    "Unnamed User";

  return (
    <div>
      <PageHeader title={t("profile.title")} subtitle={t("profile.subtitle")} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Account summary */}
        <Card title={t("profile.account")} className="lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-600">
              {initials(u)}
            </div>
            <p className="mt-3 text-lg font-semibold text-gray-800">{fullName}</p>
            <p className="text-sm text-gray-500">@{u.username}</p>
            <div className="mt-2">
              <Badge color="purple">{roleLabels[u.role] || u.role || "—"}</Badge>
            </div>
          </div>

          <div className="mt-5 space-y-3 border-t border-gray-100 pt-4 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Mail size={16} className="text-gray-400" />
              <span className="truncate">{u.email || "No email"}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Phone size={16} className="text-gray-400" />
              <span>{u.phone || "No phone"}</span>
            </div>
          </div>
        </Card>

        {/* Edit profile + Change password (super admin only) */}
        <div className="space-y-5 lg:col-span-2">
          {isSuperAdmin && (
            <Card title={t("profile.editProfile")}>
              <Banner kind={profileMsg.kind}>{profileMsg.text}</Banner>
              <form onSubmit={submitProfile} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="First Name" name="first_name" value={form.first_name} onChange={onFormChange} />
                  <Input label="Last Name" name="last_name" value={form.last_name} onChange={onFormChange} />
                  <Input label="Email" name="email" type="email" value={form.email} onChange={onFormChange} />
                  <Input label="Phone" name="phone" value={form.phone} onChange={onFormChange} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingProfile}>
                    <Save size={16} />
                    {savingProfile ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {isSuperAdmin && (
            <Card title={t("profile.changePassword")}>
              <Banner kind={pwdMsg.kind}>{pwdMsg.text}</Banner>
              <form onSubmit={submitPassword} className="space-y-4">
                <Input label="Current Password" name="old_password" type="password" value={pwd.old_password} onChange={onPwdChange} required />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="New Password (min 6)" name="new_password" type="password" value={pwd.new_password} onChange={onPwdChange} required />
                  <Input label="Confirm New Password" name="confirm_password" type="password" value={pwd.confirm_password} onChange={onPwdChange} required />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingPwd}>
                    <Lock size={16} />
                    {savingPwd ? "Updating…" : "Change Password"}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <ShieldCheck size={16} className="text-brand-600" />
                Aadhaar Details
              </span>
            }
          >
            <p className="mb-4 text-sm text-gray-500">
              These details are managed by your administrator. You can view them here but cannot edit them.
            </p>
            {u.aadhaar_submitted ? (
              <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                <CheckCircle2 size={18} className="shrink-0 text-green-600" />
                <div className="flex-1 text-sm text-green-800">
                  Aadhaar on file{u.aadhaar_number ? ` · ${u.aadhaar_number}` : ""}
                </div>
                {u.aadhaar_photo_url && <PhotoThumb url={u.aadhaar_photo_url} alt="Aadhaar" size={80} />}
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
                No Aadhaar details on file yet. Your administrator will add them.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
