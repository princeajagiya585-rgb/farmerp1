import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "./LoadingSpinner";

export default function ProtectedRoute({ children, roles }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner message={t("common.loading")} />;
  if (!user) return <Navigate to="/login" replace />;
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
