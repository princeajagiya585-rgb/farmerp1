import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import FarmsAndFields from "./pages/FarmsAndFields";
import Assets from "./pages/Assets";
import Equipment from "./pages/Equipment";
import AssetMaintenance from "./pages/AssetMaintenance";
import Workforce from "./pages/Workforce";
import WorkerDetail from "./pages/WorkerDetail";
import Departments from "./pages/Departments";
import Skills from "./pages/Skills";
import EmploymentHistory from "./pages/EmploymentHistory";
import LabourAllocation from "./pages/LabourAllocation";
import Performance from "./pages/Performance";
import AvailabilityPage from "./pages/Availability";
import AttendanceReports from "./pages/AttendanceReports";
import WorkforceMonitor from "./pages/WorkforceMonitor";
import Attendance from "./pages/Attendance";
import Payroll from "./pages/Payroll";
import PayrollAdvances from "./pages/PayrollAdvances";
import PayrollDeductions from "./pages/PayrollDeductions";
import PayrollPayments from "./pages/PayrollPayments";
import PayrollReports from "./pages/PayrollReports";
import Tasks from "./pages/Tasks";
import TaskScheduling from "./pages/TaskScheduling";
import DailyTaskReport from "./pages/DailyTaskReport";
import TaskMonitor from "./pages/TaskMonitor";
import TimeTrackingReports from "./pages/TimeTrackingReports";
import Agronomy from "./pages/Agronomy";
import AgronomyObservations from "./pages/AgronomyObservations";
import AgronomyInputs from "./pages/AgronomyInputs";
import AgronomyGrowth from "./pages/AgronomyGrowth";
import AgronomyHarvest from "./pages/AgronomyHarvest";
import AgronomyPlantation from "./pages/AgronomyPlantation";
import AgronomyAnalysis from "./pages/AgronomyAnalysis";
import CropMonitoring from "./pages/CropMonitoring";
import Inventory from "./pages/Inventory";
import InventoryMovements from "./pages/InventoryMovements";
import InventoryAlerts from "./pages/InventoryAlerts";
import InventoryReports from "./pages/InventoryReports";
import Documents from "./pages/Documents";
import DocumentVersions from "./pages/DocumentVersions";
import Finance from "./pages/Finance";
import FinanceSales from "./pages/FinanceSales";
import FinancePurchases from "./pages/FinancePurchases";
import FinancePayments from "./pages/FinancePayments";
import FinanceCostCenters from "./pages/FinanceCostCenters";
import FinanceBudgets from "./pages/FinanceBudgets";
import FinanceLedger from "./pages/FinanceLedger";
import FinanceReports from "./pages/FinanceReports";
import GPS from "./pages/GPS";
import GpsActivities from "./pages/GpsActivities";
import RouteTracking from "./pages/RouteTracking";
import Geofences from "./pages/Geofences";
import GpsMonitor from "./pages/GpsMonitor";
import Breakdowns from "./pages/Breakdowns";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import DeletedUsers from "./pages/DeletedUsers";
import AuditLogs from "./pages/AuditLogs";
import Notifications from "./pages/Notifications";
import NotificationSettings from "./pages/NotificationSettings";
import Profile from "./pages/Profile";
import CropDetail from "./pages/CropDetail";
import CropAllocation from "./pages/CropAllocation";
import FarmDashboard from "./pages/FarmDashboard";
import FarmDetail from "./pages/FarmDetail";
import NotFound from "./pages/NotFound";

const R = (roles, el) => <ProtectedRoute roles={roles}>{el}</ProtectedRoute>;

export default function App() {
  return (
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
        <Route path="/payroll/deductions" element={R(["FARM_MANAGER"], <PayrollDeductions />)} />
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
  );
}
