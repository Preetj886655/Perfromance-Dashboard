export interface MaintenanceRecord {
  id: string;
  plantCode: string | null;
  machine: string;
  machineOwner: string | null;
  date: string | null; // ISO YYYY-MM-DD
  shift: string | null; // A, B, A/B
  downtimeMinutes: number;
  breakdownType: string; // Mechanical, Electrical, etc.
  breakdownDescription: string | null;
  counterMeasure: string | null;
  rootCause: string | null;
  correctiveAction: string | null;
  spareParts: string | null;
  targetDate: string | null;
  attendedBy: string | null;
  availableTime: string | number | null;
  productionLoss: string | number | null;
  remarks: string | null;
}

export interface MaintenanceConnectionStatus {
  source: "google-sheets" | "local-reference";
  connectionStatus: "connected" | "offline";
  status: "connected" | "offline";
  spreadsheetId: string;
  worksheet: string;
  recordCount: number;
  minDate: string | null;
  maxDate: string | null;
  cacheHit?: boolean;
  lastSuccessfulSync: string | null;
  lastUpdated: string | null;
  serviceAccount?: string | null;
  error: string | null;
}

export interface MaintenanceApiResponse extends MaintenanceConnectionStatus {
  data: MaintenanceRecord[];
}

export interface MaintenanceFilterState {
  dateFrom: string;
  dateTo: string;
  machine: string;
  shift: string;
  breakdownType: string;
  attendedBy: string;
  search: string;
}

export interface MaintenanceFilterOptions {
  minDate: string;
  maxDate: string;
  defaultDateFrom: string;
  machines: string[];
  shifts: string[];
  breakdownTypes: string[];
  technicians: string[];
}

export interface MaintenanceKpis {
  totalDowntimeMinutes: number;
  totalDowntimeHours: number;
  totalIncidents: number;
  mttrMinutes: number; // Mean Time To Repair
  mttrHours: number;
  topMachineName: string | null;
  topMachineDowntime: number;
  topCategory: string | null;
  topCategoryPercent: number;
  mechanicalDowntime: number;
  electricalDowntime: number;
  totalProductionLoss: number;
}

export interface DowntimeTrendPoint {
  period: string; // Date or month string
  downtimeMinutes: number;
  downtimeHours: number;
  incidents: number;
}

export interface MachineParetoPoint {
  machine: string;
  downtimeMinutes: number;
  downtimeHours: number;
  incidents: number;
  percentage: number;
  cumulativePercentage: number;
}

export interface CategoryBreakdownPoint {
  category: string;
  downtimeMinutes: number;
  incidents: number;
  percentage: number;
}

export interface ShiftBreakdownPoint {
  shift: string;
  downtimeMinutes: number;
  incidents: number;
  percentage: number;
}

export interface TechnicianPerformancePoint {
  technician: string;
  incidentsAttended: number;
  totalDowntimeMinutes: number;
  avgResolutionMinutes: number;
}

export interface MaintenanceAnalytics {
  kpis: MaintenanceKpis;
  trend: DowntimeTrendPoint[];
  machinePareto: MachineParetoPoint[];
  categoryDistribution: CategoryBreakdownPoint[];
  shiftDistribution: ShiftBreakdownPoint[];
  technicianPerformance: TechnicianPerformancePoint[];
  filteredRecords: MaintenanceRecord[];
}

