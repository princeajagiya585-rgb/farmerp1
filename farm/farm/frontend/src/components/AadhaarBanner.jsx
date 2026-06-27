import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

/**
 * Aadhaar details are now managed by the admin (added on the Users page),
 * so users no longer self-submit. This recommendation banner is disabled.
 */
export default function AadhaarBanner() {
  return null;
}

// eslint-disable-next-line no-unused-vars
function _LegacyAadhaarBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(true); // assume true until checked (no flash)
  const [dismissed, setDismissed] = useState(false);

  const dismissKey = user ? `aadhaar_banner_dismissed_${user.id}` : null;

  useEffect(() => {
    if (!user || user.role === "SUPER_ADMIN") return;
    setDismissed(dismissKey ? localStorage.getItem(dismissKey) === "1" : false);
    let active = true;
    api
      .get("/auth/users/me/")
      .then(({ data }) => active && setSubmitted(Boolean(data.aadhaar_submitted)))
      .catch(() => {});
    const onUpdated = () => setSubmitted(true);
    window.addEventListener("aadhaar-updated", onUpdated);
    return () => {
      active = false;
      window.removeEventListener("aadhaar-updated", onUpdated);
    };
  }, [user, dismissKey]);

  if (!user || user.role === "SUPER_ADMIN" || submitted || dismissed) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm shadow-sm">
      <ShieldCheck size={18} className="shrink-0 text-amber-600" />
      <span className="flex-1 text-amber-800">
        <b>Recommended:</b> verify your identity by adding your Aadhaar number and photo.
      </span>
      <button
        onClick={() => navigate("/profile")}
        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
      >
        Verify now
      </button>
      <button
        onClick={() => {
          if (dismissKey) localStorage.setItem(dismissKey, "1");
          setDismissed(true);
        }}
        className="rounded-lg p-1 text-amber-500 hover:bg-amber-100"
        title="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
