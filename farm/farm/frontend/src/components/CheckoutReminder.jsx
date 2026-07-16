import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlarmClock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, resource } from "../lib/api";

// Local hour (0-23) after which the "confirm check-out" reminder shows.
const REMINDER_HOUR = 20;

/**
 * Daily check-out reminder.
 *
 * From 20:00 local time onward, employees and farm managers who checked in
 * today but haven't checked out yet see a persistent "confirm check-out"
 * banner on every page. It disappears as soon as they check out (polled
 * every minute + on tab focus) and resets automatically at midnight.
 * Super admins never see it — they don't mark their own attendance.
 */
export default function CheckoutReminder() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [show, setShow] = useState(false);
  const employeeIdRef = useRef(null);

  const eligible = user && (user.role === "EMPLOYEE" || user.role === "FARM_MANAGER");

  useEffect(() => {
    if (!eligible) {
      setShow(false);
      return undefined;
    }
    let alive = true;

    const check = async () => {
      // Before 20:00 (and after midnight) there is nothing to remind about.
      if (new Date().getHours() < REMINDER_HOUR) {
        if (alive) setShow(false);
        return;
      }
      try {
        if (!employeeIdRef.current) {
          const d = await resource("workforce/employees").list({ page_size: 200 });
          const all = d.results || d;
          const me = all.find((e) => String(e.user) === String(user.id));
          if (!me) {
            if (alive) setShow(false);
            return;
          }
          employeeIdRef.current = me.id;
        }
        const st = await api.get(
          `/workforce/attendance/today_status/?employee=${employeeIdRef.current}`
        );
        const a = st.data;
        const pendingCheckout = Boolean(
          a?.has_attendance && a.check_in_time && !a.check_out_time
        );
        if (alive) setShow(pendingCheckout);
      } catch {
        // Offline / server waking: keep the current state, try again next tick.
      }
    };

    check();
    const timer = setInterval(check, 60000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [eligible, user, location.pathname]);

  if (!show) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 shadow-sm animate-fade-in">
      <AlarmClock size={18} className="shrink-0 text-amber-600" />
      <span className="flex-1">
        {t(
          "attendance.checkoutReminder",
          "It's past 8:00 PM — please confirm your check-out for today."
        )}
      </span>
      <button
        onClick={() => navigate("/attendance")}
        className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700"
      >
        {t("attendance.checkoutReminderAction", "Check out now")}
      </button>
    </div>
  );
}
