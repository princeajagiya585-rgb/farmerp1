import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

// Every page is lazy-loaded into its own chunk so the first paint only ships
// the app shell + the page being visited, instead of all ~65 pages at once.
// If a deploy replaced the hashed chunk files while a tab was open, the
// dynamic import fails — reload once to pick up the fresh build.
const lazyLoad = (importer) =>
  lazy(() =>
    importer()
      .then((m) => {
        sessionStorage.removeItem("chunk-reload");
        return m;
      })
      .catch((err) => {
        if (!sessionStorage.getItem("chunk-reload")) {
          sessionStorage.setItem("chunk-reload", "1");
          window.location.reload();
          return new Promise(() => {}); // page is reloading
        }
        throw err;
      })
  );

const Login = lazyLoad(() => import("./pages/Login"));
const Dashboard = lazyLoad(() => import("./pages/Dashboard"));
const FarmsAndFields = lazyLoad(() => import("./pages/FarmsAndFields"));
const Assets = lazyLoad(() => import("./pages/Assets"));
const Equipment = lazyLoad(() => import("./pages/Equipment"));
const AssetMaintenance = lazyLoad(() => import("./pages/AssetMaintenance"));
const Workforce = lazyLoad(() => import("./pages/Workforce"));
const WorkerDetail = lazyLoad(() => import("./pages/WorkerDetail"));
const Departments = lazyLoad(() => import("./pages/Departments"));
const Skills = lazyLoad(() => import("./pages/Skills"));
const EmploymentHistory = lazyLoad(() => import("./pages/EmploymentHistory"));
const LabourAllocation = lazyLoad(() => import("./pages/LabourAllocation"));
const Performance = lazyLoad(() => import("./pages/Performance"));
const AvailabilityPage = lazyLoad(() => import("./pages/Availability"));
const AttendanceReports = lazyLoad(() => import("./pages/AttendanceReports"));
const WorkforceMonitor = lazyLoad(() => import("./pages/WorkforceMonitor"));
const Attendance = lazyLoad(() => import("./pages/Attendance"));
const Payroll = lazyLoad(() => import("./pages/Payroll"));
const PayrollAdvances = lazyLoad(() => import("./pages/PayrollAdvances"));
const PayrollPayments = lazyLoad(() => import("./pages/PayrollPayments"));
const PayrollReports = lazyLoad(() => import("./pages/PayrollReports"));
const Tasks = lazyLoad(() => import("./pages/Tasks"));
const TaskScheduling = lazyLoad(() => import("./pages/TaskScheduling"));
const DailyTaskReport = lazyLoad(() => import("./pages/DailyTaskReport"));
const TaskMonitor = lazyLoad(() => import("./pages/TaskMonitor"));
const TimeTrackingReports = lazyLoad(() => import("./pages/TimeTrackingReports"));
const Agronomy = lazyLoad(() => import("./pages/Agronomy"));
const AgronomyObservations = lazyLoad(() => import("./pages/AgronomyObservations"));
const AgronomyInputs = lazyLoad(() => import("./pages/AgronomyInputs"));
const AgronomyGrowth = lazyLoad(() => import("./pages/AgronomyGrowth"));
const AgronomyHarvest = lazyLoad(() => import("./pages/AgronomyHarvest"));
const AgronomyPlantation = lazyLoad(() => import("./pages/AgronomyPlantation"));
const AgronomyAnalysis = lazyLoad(() => import("./pages/AgronomyAnalysis"));
const CropMonitoring = lazyLoad(() => import("./pages/CropMonitoring"));
const Inventory = lazyLoad(() => import("./pages/Inventory"));
const InventoryMovements = lazyLoad(() => import("./pages/InventoryMovements"));
const InventoryAlerts = lazyLoad(() => import("./pages/InventoryAlerts"));
const InventoryReports = lazyLoad(() => import("./pages/InventoryReports"));
const Documents = lazyLoad(() => import("./pages/Documents"));
const DocumentVersions = lazyLoad(() => import("./pages/DocumentVersions"));
const Finance = lazyLoad(() => import("./pages/Finance"));
const FinanceSales = lazyLoad(() => import("./pages/FinanceSales"));
const FinancePurchases = lazyLoad(() => import("./pages/FinancePurchases"));
const FinancePayments = lazyLoad(() => import("./pages/FinancePayments"));
const FinanceCostCenters = lazyLoad(() => import("./pages/FinanceCostCenters"));
const FinanceBudgets = lazyLoad(() => import("./pages/FinanceBudgets"));
const FinanceLedger = lazyLoad(() => import("./pages/FinanceLedger"));
const FinanceReports = lazyLoad(() => import("./pages/FinanceReports"));
const GPS = lazyLoad(() => import("./pages/GPS"));
const GpsActivities = lazyLoad(() => import("./pages/GpsActivities"));
const RouteTracking = lazyLoad(() => import("./pages/RouteTracking"));
const Geofences = lazyLoad(() => import("./pages/Geofences"));
const GpsMonitor = lazyLoad(() => import("./pages/GpsMonitor"));
const Breakdowns = lazyLoad(() => import("./pages/Breakdowns"));
const Reports = lazyLoad(() => import("./pages/Reports"));
const Users = lazyLoad(() => import("./pages/Users"));
const DeletedUsers = lazyLoad(() => import("./pages/DeletedUsers"));
const AuditLogs = lazyLoad(() => import("./pages/AuditLogs"));
const Notifications = lazyLoad(() => import("./pages/Notifications"));
const NotificationSettings = lazyLoad(() => import("./pages/NotificationSettings"));
const Profile = lazyLoad(() => import("./pages/Profile"));
const CropDetail = lazyLoad(() => import("./pages/CropDetail"));
const CropAllocation = lazyLoad(() => import("./pages/CropAllocation"));
const FarmDashboard = lazyLoad(() => import("./pages/FarmDashboard"));
const FarmDetail = lazyLoad(() => import("./pages/FarmDetail"));
const NotFound = lazyLoad(() => import("./pages/NotFound"));

const R = (roles, el) => <ProtectedRoute roles={roles}>{el}</ProtectedRoute>;

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/farms" element={R(["FARM_MANAGER"], <FarmsAndFields />)} />
        <Route path="/farms/dashboard" element={R(["FARM_MANAGER"], <FarmDashboard />)} />
        <Route path="/farms/:id" element={R(["FARM_MANAGER"], <FarmDetail />)} />
        <Route path="/assets" element={R(["FARM_MANAGER"], <Assets />)} />
        <Route path="/assets/equipment" element={R(["FARM_MANAGER"], <Equipment />)} />
        <Route path="/assets/maintenance" element={R(["FARM_MANAGER"], <AssetMaintenance />)} />
        <Route path="/farms/crop-allocation" element={R(["FARM_MANAGER"], <CropAllocation />)} />
        <Route path="/workforce" element={R(["FARM_MANAGER"], <Workforce />)} />
        <Route path="/workforce/:id/financials" element={R(["FARM_MANAGER", "SUPER_ADMIN", "EMPLOYEE"], <WorkerDetail />)} />
        <Route path="/hr/departments" element={R(["FARM_MANAGER"], <Departments />)} />
        <Route path="/hr/skills" element={R(["FARM_MANAGER"], <Skills />)} />
        <Route path="/hr/employment-history" element={R(["FARM_MANAGER"], <EmploymentHistory />)} />
        <Route path="/hr/allocation" element={R(["FARM_MANAGER"], <LabourAllocation />)} />
        <Route path="/hr/attendance-reports" element={R(["FARM_MANAGER"], <AttendanceReports />)} />
        <Route path="/hr/performance" element={R(["FARM_MANAGER"], <Performance />)} />
        <Route path="/hr/availability" element={R(["FARM_MANAGER"], <AvailabilityPage />)} />
        <Route path="/hr/monitor" element={R(["FARM_MANAGER"], <WorkforceMonitor />)} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/payroll" element={R(["FARM_MANAGER", "EMPLOYEE"], <Payroll />)} />
        <Route path="/payroll/advances" element={R(["FARM_MANAGER"], <PayrollAdvances />)} />
        <Route path="/payroll/payments" element={R(["FARM_MANAGER"], <PayrollPayments />)} />
        <Route path="/payroll/reports" element={R(["FARM_MANAGER"], <PayrollReports />)} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/tasks/scheduling" element={R(["FARM_MANAGER", "SUPER_ADMIN"], <TaskScheduling />)} />
        <Route path="/tasks/monitor" element={R(["FARM_MANAGER"], <TaskMonitor />)} />
        <Route path="/tasks/time-tracking" element={R(["FARM_MANAGER"], <TimeTrackingReports />)} />
        <Route path="/tasks/daily-report" element={<DailyTaskReport />} />
        <Route path="/agronomy" element={R(["FARM_MANAGER", "EMPLOYEE"], <Agronomy />)} />
        <Route path="/agronomy/observations" element={R(["FARM_MANAGER", "EMPLOYEE"], <AgronomyObservations />)} />
        <Route path="/agronomy/inputs" element={R(["FARM_MANAGER", "EMPLOYEE"], <AgronomyInputs />)} />
        <Route path="/agronomy/growth" element={R(["FARM_MANAGER", "EMPLOYEE"], <AgronomyGrowth />)} />
        <Route path="/agronomy/harvest" element={R(["FARM_MANAGER", "EMPLOYEE"], <AgronomyHarvest />)} />
        <Route path="/agronomy/plantation" element={R(["FARM_MANAGER", "EMPLOYEE"], <AgronomyPlantation />)} />
        <Route path="/agronomy/analysis" element={R(["FARM_MANAGER"], <AgronomyAnalysis />)} />
        <Route path="/agronomy/monitoring" element={R(["FARM_MANAGER", "EMPLOYEE"], <CropMonitoring />)} />
        <Route path="/agronomy/:id" element={R(["FARM_MANAGER", "EMPLOYEE"], <CropDetail />)} />
        <Route path="/inventory" element={R(["FARM_MANAGER"], <Inventory />)} />
        <Route path="/inventory/movements" element={R(["FARM_MANAGER"], <InventoryMovements />)} />
        <Route path="/inventory/alerts" element={R(["FARM_MANAGER"], <InventoryAlerts />)} />
        <Route path="/inventory/reports" element={R(["FARM_MANAGER"], <InventoryReports />)} />
        <Route path="/documents" element={R(["FARM_MANAGER"], <Documents />)} />
        <Route path="/documents/versions" element={R(["FARM_MANAGER"], <DocumentVersions />)} />
        <Route path="/finance" element={R(["FARM_MANAGER"], <Finance />)} />
        <Route path="/finance/sales" element={R(["FARM_MANAGER", "EMPLOYEE"], <FinanceSales />)} />
        <Route path="/finance/purchases" element={R(["FARM_MANAGER", "EMPLOYEE"], <FinancePurchases />)} />
        <Route path="/finance/payments" element={R(["FARM_MANAGER", "EMPLOYEE"], <FinancePayments />)} />
        <Route path="/finance/cost-centers" element={R(["FARM_MANAGER"], <FinanceCostCenters />)} />
        <Route path="/finance/budgets" element={R(["FARM_MANAGER"], <FinanceBudgets />)} />
        <Route path="/finance/ledger" element={R(["FARM_MANAGER"], <FinanceLedger />)} />
        <Route path="/finance/reports" element={R(["FARM_MANAGER"], <FinanceReports />)} />
        <Route path="/gps" element={<GPS />} />
        <Route path="/gps/activities" element={R(["FARM_MANAGER"], <GpsActivities />)} />
        <Route path="/gps/routes" element={R(["FARM_MANAGER"], <RouteTracking />)} />
        <Route path="/gps/geofences" element={R(["FARM_MANAGER", "EMPLOYEE"], <Geofences />)} />
        <Route path="/gps/monitor" element={R(["FARM_MANAGER", "EMPLOYEE"], <GpsMonitor />)} />
        <Route path="/breakdowns" element={R(["FARM_MANAGER", "EMPLOYEE"], <Breakdowns />)} />
        <Route path="/reports" element={R(["FARM_MANAGER"], <Reports />)} />
        <Route path="/users" element={R(["SUPER_ADMIN"], <Users />)} />
        <Route path="/users/deleted" element={R(["SUPER_ADMIN"], <DeletedUsers />)} />
        <Route path="/audit" element={R(["SUPER_ADMIN"], <AuditLogs />)} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/notification-settings" element={<NotificationSettings />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}
