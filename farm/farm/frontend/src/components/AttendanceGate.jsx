import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, resource } from "../lib/api";
import LoadingSpinner from "./LoadingSpinner";

// Pages that stay reachable BEFORE today's check-in is done.
const ALLOWED_PATHS = ["/attendance", "/profile"];

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Daily attendance-first gate.
 *
 * Every new day, employees and managers must mark their attendance
 * (GPS check-in) before any other page opens — the app redirects to
 * /attendance until today's record exists. Super admins are exempt
 * (they never mark their own attendance). If the status check itself
 * fails (offline, server waking) the app is never locked out.
 */
export default function AttendanceGate({ children }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  // ok: null = checking, true = attendance done (or exempt), false = blocked
  const [state, setState] = useState({ date: todayStr(), ok: null });

  const exempt = !user || user.role === "SUPER_ADMIN";

  useEffect(() => {
    if (exempt) return undefined;

    // New day while the tab stayed open → re-check from scratch.
    if (state.ok !== null && state.date !== todayStr()) {
      setState({ date: todayStr(), ok: null });
      return undefined;
    }
    if (state.ok === true) return undefined;

    let alive = true;
    const check = async () => {
      try {
        const d = await resource("workforce/employees").list({ page_size: 200 });
        const all = d.results || d;
        const me = all.find((e) => String(e.user) === String(user.id));
        if (!me) {
          // No employee profile — nothing to check in as; never lock out.
          if (alive) setState({ date: todayStr(), ok: true });
          return;
        }
        const st = await api.get(`/workforce/attendance/today_status/?employee=${me.id}`);
        const a = st.data;
        // Checked in via GPS, or someone already marked a real status
        // (PRESENT/LEAVE/… — auto-created PENDING rows don't count).
        const ok = Boolean(
          a?.has_attendance && (a.check_in_time || (a.status && a.status !== "PENDING"))
        );
        if (alive) setState({ date: todayStr(), ok });
      } catch {
        // Offline / server waking: fail open so the app stays usable.
        if (alive) setState({ date: todayStr(), ok: true });
      }
    };

    check();
    // While blocked, keep watching so the gate lifts right after check-in.
    const timer = state.ok === false ? setInterval(check, 10000) : null;
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [exempt, user, state.ok, state.date, location.pathname]);

  if (exempt || state.ok === true) return children;

  if (state.ok === null) {
    return <LoadingSpinner message={t("attendance.gateChecking", "Checking today's attendance…")} />;
  }

  // Blocked: only the allowed pages open, everything else lands on /attendance.
  const allowed = ALLOWED_PATHS.some((p) => location.pathname.startsWith(p));
  if (!allowed) return <Navigate to="/attendance" replace />;

  return (
    <>
      <div className="flex items-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
        <AlertTriangle size={16} className="shrink-0" />
        {t(
          "attendance.gateBanner",
          "New day — please mark your attendance (GPS Check-In) first. Other pages unlock right after."
        )}
      </div>
      {children}
    </>
  );
}
