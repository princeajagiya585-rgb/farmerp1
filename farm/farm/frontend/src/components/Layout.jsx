import { useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { LogOut, Menu, X, ChevronDown, Users, Sprout, ClipboardList, Wallet, Languages, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { navGroups, roleLabels } from "../config/nav";
import Logo from "./Logo";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";
import AadhaarBanner from "./AadhaarBanner";
import PageTransitionLoader from "./PageTransitionLoader";
import InstallAppButton from "./InstallAppButton";
import { api } from "../lib/api";


const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "gu", label: "ગુજરાતી" },
];

const navLabelKey = {
  "Dashboard": "nav.dashboard",
  "Farm Administration": "nav.farmAdmin",
  "Farm Dashboard": "nav.farmDashboard",
  "Farms & Fields": "nav.farms",
  "Crop Allocation": "nav.cropAllocation",
  "Asset Inventory": "nav.assetInventory",
  "Equipment & Machinery": "nav.equipment",
  "Maintenance Log": "nav.maintenanceLog",
  "Financial Management": "nav.finance",
  "Income & Expenses": "nav.incomeExpenses",
  "Sales": "nav.sales",
  "Purchases": "nav.purchases",
  "Payments": "nav.payments",
  "Cost Centers": "nav.costCenters",
  "Budgets": "nav.budgets",
  "Ledger": "nav.ledger",
  "Financial Reports": "nav.financialReports",
  "Reports & Analytics": "nav.reportsAnalytics",
  "HR Management": "nav.hr",
  "Employees": "nav.employees",
  "Departments": "nav.departments",
  "Skills": "nav.skills",
  "Employment History": "nav.employmentHistory",
  "Labour Allocation": "nav.labourAllocation",
  "Attendance": "nav.attendance",
  "Attendance Reports": "nav.attendanceReports",
  "Performance": "nav.performance",
  "Availability": "nav.availability",
  "Workforce Monitor": "nav.workforceMonitor",
  "Payroll": "nav.payroll",
  "Periods & Payslips": "nav.periodsPayslips",
  "Advances": "nav.advances",
  "Deductions": "nav.deductions",
  "Employee Payments": "nav.employeePayments",
  "Reports": "nav.reports",
  "Tasks & Scheduling": "nav.tasksScheduling",
  "All Tasks": "nav.allTasks",
  "Daily Report": "nav.dailyReport",
  "Scheduling": "nav.scheduling",
  "Monitoring": "nav.monitoring",
  "Time Tracking": "nav.timeTracking",    "GPS Activity": "nav.gpsActivity",
  "Location Map": "nav.locationMap",
  "Field Activities": "nav.fieldActivities",
  "Route Tracking": "nav.routeTracking",
  "Geofences": "nav.geofences",
  "Activity Monitor": "nav.activityMonitor",
  "Agronomy & Crops": "nav.agronomyCrops",
  "Crops": "nav.crops",
  "Crop Monitoring": "nav.cropMonitoring",
  "Observations": "nav.observations",
  "Input Applications": "nav.inputApplications",
  "Growth Records": "nav.growthRecords",
  "Harvest Records": "nav.harvestRecords",
  "Plantation": "nav.plantation",
  "Historical Analysis": "nav.historicalAnalysis",
  "Inventory": "nav.inventory",
  "Items": "nav.items",
  "Stock Movements": "nav.stockMovements",
  "Reorder Alerts": "nav.reorderAlerts",
  "Inventory Reports": "nav.inventoryReports",
  "Documents": "nav.documents",
  "All Documents": "nav.allDocuments",
  "Version Archive": "nav.versionArchive",
  "Breakdowns": "nav.breakdowns",
  "Administration": "nav.administration",
  "Users": "nav.users",
  "Audit Trail": "nav.auditTrail",
  "Notification Settings": "nav.notificationSettings",
};

function tLabel(t, label) {
  const key = navLabelKey[label];
  return key ? t(key) : label;
}

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const role = user?.role;
  const canSee = (roles) => role === "SUPER_ADMIN" || (roles || []).includes(role);
  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  // Super admin changes their own UI language — persist it so it sticks on reload.
  const switchLang = (code) => {
    i18n.changeLanguage(code);
    setLangOpen(false);
    api.patch("/auth/users/me/", { preferred_language: code }).then(() => {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, preferred_language: code }));
    }).catch(() => {});
  };

  // Build the visible menu: keep links the user can see, and groups that have
  // at least one visible child (children filtered to the user's role).
  const visible = navGroups
    .map((item) => {
      if (!item.children) return canSee(item.roles) ? item : null;
      const children = item.children.filter((c) => canSee(c.roles));
      return children.length ? { ...item, children } : null;
    })
    .filter(Boolean);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initials = (user?.full_name || user?.username || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Overlay for mobile */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col bg-gradient-to-b from-brand-800 to-brand-950 text-brand-50 transition-transform md:static md:translate-x-0`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Logo size={36} light tagline />
          <button className="text-brand-200 md:hidden" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <p className="px-5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-brand-300/70">
          {t("common.menu")}
        </p>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {visible.map((item) =>
            item.children ? (
              <NavGroup
                key={item.label}
                item={item}
                pathname={location.pathname}
                onNavigate={() => setOpen(false)}
                t={t}
              />
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-white/15 text-white shadow-sm ring-1 ring-white/10"
                      : "text-brand-100/90 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <item.icon size={18} className="shrink-0" />
                {tLabel(t, item.label)}
              </NavLink>
            )
          )}
        </nav>

        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-brand-200/70">
          {t("common.version")}
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="z-20 flex items-center justify-between border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur md:px-6">
          <button className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 md:hidden" onClick={() => setOpen(!open)}>
            <Menu size={22} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3 md:gap-4">
            {/* Language switcher — super admin only (users get the admin-set language). */}
            {hasRole("SUPER_ADMIN") && (
              <div className="relative">
                <button
                  onClick={() => setLangOpen(!langOpen)}
                  className="flex items-center gap-1.5 rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                  title={t("layout.languageLabel")}
                >
                  <Languages size={18} />
                  <span className="hidden text-xs font-medium sm:inline">{currentLang.label}</span>
                </button>
                {langOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
                    <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-xl border border-gray-200 bg-white py-1 shadow-lift">
                      {LANGUAGES.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => switchLang(lang.code)}
                          className={`flex w-full items-center gap-2 px-4 py-2 text-sm ${
                            lang.code === i18n.language
                              ? "bg-brand-50 font-semibold text-brand-700"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {lang.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <ThemeToggle />
            <NotificationBell />
            <NavLink
              to="/profile"
              className="flex items-center gap-2.5 rounded-xl px-2 py-1 transition hover:bg-gray-100"
              title={t("common.profile")}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
                {initials}
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-gray-700">{user?.full_name || user?.username}</p>
                <p className="text-xs text-gray-400">{roleLabels[user?.role] || user?.role}</p>
              </div>
            </NavLink>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="rounded-xl p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
              title={t("common.logout")}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6">
            <div className="mx-auto max-w-7xl animate-fade-in">
              <AadhaarBanner />
              <PageTransitionLoader>
                <Outlet />
              </PageTransitionLoader>
              <InstallAppButton />
            </div>
          </div>
        </main>
      </div>


      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm animate-fade-in rounded-2xl bg-white shadow-lift">
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle size={28} className="text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-800">Confirm Logout</h3>
              <p className="mt-2 text-sm text-gray-500">Are you sure you want to sign out?</p>
            </div>
            <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavGroup({ item, pathname, onNavigate, t }) {
  const hasActiveChild = item.children.some(
    (c) => pathname === c.to || pathname.startsWith(c.to + "/")
  );
  const [expanded, setExpanded] = useState(hasActiveChild);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
          hasActiveChild
            ? "text-white"
            : "text-brand-100/90 hover:bg-white/10 hover:text-white"
        }`}
      >
        <item.icon size={18} className="shrink-0" />
        <span className="flex-1 text-left">{tLabel(t, item.label)}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="mb-1 ml-4 space-y-0.5 border-l border-white/10 pl-3">
          {item.children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              end
              onClick={onNavigate}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                  isActive
                    ? "bg-white/15 text-white shadow-sm ring-1 ring-white/10"
                    : "text-brand-100/80 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              {tLabel(t, c.label)}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
