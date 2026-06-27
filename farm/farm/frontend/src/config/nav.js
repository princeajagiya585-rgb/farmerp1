import {
  LayoutDashboard, Tractor, Users, Wallet, ClipboardList, Sprout,
  Boxes, FileText, Banknote, MapPin, BarChart3, UserCog, AlertTriangle,
} from "lucide-react";

// roles allowed to see each nav item. SUPER_ADMIN always sees everything.
export const ALL = ["SUPER_ADMIN", "FARM_MANAGER", "EMPLOYEE"];

const FM = "FARM_MANAGER";
const EM = "EMPLOYEE";

/**
 * Module-grouped navigation. Each entry is either:
 *  - a link:  { to, label, icon, roles }
 *  - a group: { label, icon, roles?, children: [{ to, label, roles }] }
 * A group renders as a collapsible dropdown of its sub-modules.
 */
export const navGroups = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ALL },

  {
    label: "Farm Administration",
    icon: Tractor,
    children: [
      { to: "/farms/dashboard", label: "Farm Dashboard", roles: [FM] },
      { to: "/farms", label: "Farms & Fields", roles: [FM] },
      { to: "/farms/crop-allocation", label: "Crop Allocation", roles: [FM] },
      { to: "/assets", label: "Asset Inventory", roles: [FM] },
      { to: "/assets/equipment", label: "Equipment & Machinery", roles: [FM] },
      { to: "/assets/maintenance", label: "Maintenance Log", roles: [FM] },
    ],
  },

  {
    label: "Financial Management",
    icon: Banknote,
    children: [
      { to: "/finance", label: "Income & Expenses", roles: [FM] },
      { to: "/finance/sales", label: "Sales", roles: [FM, EM] },
      { to: "/finance/purchases", label: "Purchases", roles: [FM, EM] },
      { to: "/finance/payments", label: "Payments", roles: [FM, EM] },
      { to: "/finance/cost-centers", label: "Cost Centers", roles: [FM] },
      { to: "/finance/budgets", label: "Budgets", roles: [FM] },
      { to: "/finance/ledger", label: "Ledger", roles: [FM] },
      { to: "/finance/reports", label: "Financial Reports", roles: [FM] },
      { to: "/reports", label: "Reports & Analytics", roles: [FM] },
    ],
  },

  {
    label: "HR Management",
    icon: Users,
    children: [
      { to: "/workforce", label: "Employees", roles: [FM] },
      { to: "/hr/departments", label: "Departments", roles: [FM] },
      { to: "/hr/skills", label: "Skills", roles: [FM] },
      { to: "/hr/employment-history", label: "Employment History", roles: [FM] },
      { to: "/hr/allocation", label: "Labour Allocation", roles: [FM] },
      { to: "/attendance", label: "Attendance", roles: ALL },
      { to: "/hr/attendance-reports", label: "Attendance Reports", roles: [FM] },
      { to: "/hr/performance", label: "Performance", roles: [FM] },
      { to: "/hr/availability", label: "Availability", roles: [FM] },
      { to: "/hr/monitor", label: "Workforce Monitor", roles: [FM] },
    ],
  },

  {
    label: "Payroll",
    icon: Wallet,
    children: [
      { to: "/payroll", label: "Periods & Payslips", roles: [FM, EM] },
      { to: "/payroll/advances", label: "Advances", roles: [FM] },
      { to: "/payroll/deductions", label: "Deductions", roles: [FM] },
      { to: "/payroll/payments", label: "Employee Payments", roles: [FM] },
      { to: "/payroll/reports", label: "Reports", roles: [FM] },
    ],
  },
  {
    label: "Tasks & Scheduling",
    icon: ClipboardList,
    children: [
      { to: "/tasks", label: "All Tasks", roles: ALL },
      { to: "/tasks/daily-report", label: "Daily Report", roles: ALL },
      { to: "/tasks/scheduling", label: "Scheduling", roles: [FM] },
      { to: "/tasks/monitor", label: "Monitoring", roles: [FM] },
      { to: "/tasks/time-tracking", label: "Time Tracking", roles: [FM] },
    ],
  },
  {
    label: "GPS Activity",
    icon: MapPin,
    children: [
      { to: "/gps", label: "Location Map", roles: ALL },
      { to: "/gps/activities", label: "Field Activities", roles: [FM] },
      { to: "/gps/routes", label: "Route Tracking", roles: [FM] },
      { to: "/gps/geofences", label: "Geofences", roles: [FM, EM] },
      { to: "/gps/monitor", label: "Activity Monitor", roles: ALL },
    ],
  },
  {
    label: "Agronomy & Crops",
    icon: Sprout,
    children: [
      { to: "/agronomy", label: "Crops", roles: [FM, EM] },
      { to: "/agronomy/monitoring", label: "Crop Monitoring", roles: [FM, EM] },
      { to: "/agronomy/observations", label: "Observations", roles: [FM, EM] },
      { to: "/agronomy/inputs", label: "Input Applications", roles: [FM, EM] },
      { to: "/agronomy/growth", label: "Growth Records", roles: [FM, EM] },
      { to: "/agronomy/harvest", label: "Harvest Records", roles: [FM, EM] },
      { to: "/agronomy/plantation", label: "Plantation", roles: [FM, EM] },
      { to: "/agronomy/analysis", label: "Historical Analysis", roles: [FM] },
    ],
  },
  {
    label: "Inventory",
    icon: Boxes,
    children: [
      { to: "/inventory", label: "Items", roles: [FM] },
      { to: "/inventory/movements", label: "Stock Movements", roles: [FM] },
      { to: "/inventory/alerts", label: "Reorder Alerts", roles: [FM] },
      { to: "/inventory/reports", label: "Reports", roles: [FM] },
    ],
  },
  {
    label: "Documents",
    icon: FileText,
    children: [
      { to: "/documents", label: "All Documents", roles: [FM] },
      { to: "/documents/versions", label: "Version Archive", roles: [FM] },
    ],
  },
  { to: "/breakdowns", label: "Breakdowns", icon: AlertTriangle, roles: [FM, EM] },

  {
    label: "Administration",
    icon: UserCog,
    children: [
      { to: "/users", label: "Users", roles: ["SUPER_ADMIN"] },
      { to: "/notification-settings", label: "Notification Settings", roles: ["SUPER_ADMIN", "FARM_MANAGER", "EMPLOYEE"] },
    ],
  },
];

export const roleLabels = {
  SUPER_ADMIN: "Super Administrator",
  FARM_MANAGER: "Farm Manager",
  EMPLOYEE: "Employee / Labour",
};
