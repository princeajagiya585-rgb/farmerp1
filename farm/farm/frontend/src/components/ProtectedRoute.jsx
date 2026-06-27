import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, roles }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-gray-400">{t("common.loading")}</div>;
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
