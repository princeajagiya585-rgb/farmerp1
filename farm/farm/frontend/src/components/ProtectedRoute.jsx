import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "./LoadingSpinner";

/**
 * `roles` — any listed role passes; SUPER_ADMIN always passes.
 * `ownerOnly` — restricts to the MAIN super admin (`is_superuser`), the single
 *   owner account. Ordinary super admins are refused, which `roles` alone
 *   cannot express since every SUPER_ADMIN bypasses the role check.
 */
export default function ProtectedRoute({ children, roles, ownerOnly = false }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner message={t("common.loading")} />;
  if (!user) return <Navigate to="/login" replace />;
  if (ownerOnly && !user.is_superuser) {
    return (
      <div className="p-8 text-center text-gray-500">
        <h2 className="text-lg font-semibold">{t("common.accessDenied")}</h2>
        <p className="text-sm">
          Only the main super administrator can open this page.
        </p>
      </div>
    );
  }
  if (roles && user.role !== "SUPER_ADMIN" && !roles.includes(user.role)) {
    return (
      <div className="p-8 text-center text-gray-500">
        <h2 className="text-lg font-semibold">{t("common.accessDenied")}</h2>
        <p className="text-sm">{t("common.accessDeniedMsg", { role: user.role })}</p>
      </div>
    );
  }
  return children;
}
