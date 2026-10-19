import type {
  CategoryBreakdownPoint,
  DowntimeTrendPoint,
  MachineParetoPoint,
  MaintenanceAnalytics,
  MaintenanceFilterOptions,
  MaintenanceFilterState,
  MaintenanceKpis,
  MaintenanceRecord,
  ShiftBreakdownPoint,
  TechnicianPerformancePoint,
} from "./types";

export function deriveMaintenanceFilterOptions(
  records: MaintenanceRecord[],
): MaintenanceFilterOptions {
  const dates = records
    .map((r) => r.date)
    .filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)))
    .sort();

  const minDate = dates[0] ?? "2024-01-01";
  const maxDate = dates[dates.length - 1] ?? "2026-10-08";

  // Derive initial start date: Jan 1 of current year (e.g. 2026-01-01)
  const currentYear = new Date().getFullYear();
  const currentYearStart = `${currentYear}-01-01`;
  const defaultDateFrom =
    currentYearStart <= maxDate && currentYearStart >= minDate
      ? currentYearStart
      : minDate;

  const machineSet = new Set<string>();
  const shiftSet = new Set<string>();
  const typeSet = new Set<string>();
  const techSet = new Set<string>();

  for (const r of records) {
    if (r.machine) machineSet.add(r.machine);
    if (r.shift) shiftSet.add(r.shift);
    if (r.breakdownType) typeSet.add(r.breakdownType);
    if (r.attendedBy) techSet.add(r.attendedBy);
  }

  return {
    minDate,
    maxDate,
    defaultDateFrom,
    machines: Array.from(machineSet).sort((a, b) => a.localeCompare(b)),
    shifts: Array.from(shiftSet).sort((a, b) => a.localeCompare(b)),
    breakdownTypes: Array.from(typeSet).sort((a, b) => a.localeCompare(b)),
    technicians: Array.from(techSet).sort((a, b) => a.localeCompare(b)),
  };
}

export function filterMaintenanceRecords(
  records: MaintenanceRecord[],
  filters: MaintenanceFilterState,
): MaintenanceRecord[] {
  const searchLower = filters.search.trim().toLowerCase();

  return records.filter((r) => {
    // Date filter
    if (r.date) {
      if (filters.dateFrom && r.date < filters.dateFrom) return false;
      if (filters.dateTo && r.date > filters.dateTo) return false;
    } else if (filters.dateFrom || filters.dateTo) {
      // Exclude undated rows when date filter is active
      return false;
    }

    // Machine filter
    if (filters.machine && filters.machine !== "ALL" && r.machine !== filters.machine) {
      return false;
    }

    // Shift filter
    if (filters.shift && filters.shift !== "ALL" && r.shift !== filters.shift) {
      return false;
    }

    // Breakdown type filter
    if (
      filters.breakdownType &&
      filters.breakdownType !== "ALL" &&
      r.breakdownType !== filters.breakdownType
    ) {
      return false;
    }

    // Attended by / Technician filter
    if (
      filters.attendedBy &&
      filters.attendedBy !== "ALL" &&
      r.attendedBy !== filters.attendedBy
    ) {
      return false;
    }

    // Search query filter across text fields
    if (searchLower) {
      const match =
        r.machine.toLowerCase().includes(searchLower) ||
        (r.breakdownDescription && r.breakdownDescription.toLowerCase().includes(searchLower)) ||
        (r.rootCause && r.rootCause.toLowerCase().includes(searchLower)) ||
        (r.correctiveAction && r.correctiveAction.toLowerCase().includes(searchLower)) ||
        (r.spareParts && r.spareParts.toLowerCase().includes(searchLower)) ||
        (r.attendedBy && r.attendedBy.toLowerCase().includes(searchLower)) ||
        (r.remarks && r.remarks.toLowerCase().includes(searchLower));

      if (!match) return false;
    }

    return true;
  });
}

export function calculateMaintenanceAnalytics(
  records: MaintenanceRecord[],
): MaintenanceAnalytics {
  const totalIncidents = records.length;
  let totalDowntimeMinutes = 0;
  let mechanicalDowntime = 0;
  let electricalDowntime = 0;
  let totalProductionLoss = 0;

  const machineMap = new Map<string, { downtime: number; incidents: number }>();
  const categoryMap = new Map<string, { downtime: number; incidents: number }>();
  const shiftMap = new Map<string, { downtime: number; incidents: number }>();
  const techMap = new Map<string, { downtime: number; incidents: number }>();
  const trendMap = new Map<string, { downtime: number; incidents: number }>();

  for (const r of records) {
    const dt = r.downtimeMinutes || 0;
    totalDowntimeMinutes += dt;

    if (r.breakdownType === "Mechanical") {
      mechanicalDowntime += dt;
    } else if (r.breakdownType === "Electrical") {
      electricalDowntime += dt;
    }

    if (typeof r.productionLoss === "number") {
      totalProductionLoss += r.productionLoss;
    }

    // Machine aggregation
    const m = r.machine;
    const mEntry = machineMap.get(m) ?? { downtime: 0, incidents: 0 };
    mEntry.downtime += dt;
    mEntry.incidents += 1;
    machineMap.set(m, mEntry);

    // Category aggregation
    const cat = r.breakdownType || "Uncategorized";
    const catEntry = categoryMap.get(cat) ?? { downtime: 0, incidents: 0 };
    catEntry.downtime += dt;
    catEntry.incidents += 1;
    categoryMap.set(cat, catEntry);

    // Shift aggregation
    const sh = r.shift || "Unknown";
    const shEntry = shiftMap.get(sh) ?? { downtime: 0, incidents: 0 };
    shEntry.downtime += dt;
    shEntry.incidents += 1;
    shiftMap.set(sh, shEntry);

    // Technician aggregation
    if (r.attendedBy) {
      const tech = r.attendedBy.trim();
      const techEntry = techMap.get(tech) ?? { downtime: 0, incidents: 0 };
      techEntry.downtime += dt;
      techEntry.incidents += 1;
      techMap.set(tech, techEntry);
    }

    // Trend grouping: group by Month (YYYY-MM)
    if (r.date) {
      const periodKey = r.date.slice(0, 7); // YYYY-MM
      const tEntry = trendMap.get(periodKey) ?? { downtime: 0, incidents: 0 };
      tEntry.downtime += dt;
      tEntry.incidents += 1;
      trendMap.set(periodKey, tEntry);
    }
  }

  const totalDowntimeHours = Math.round((totalDowntimeMinutes / 60) * 10) / 10;
  const mttrMinutes =
    totalIncidents > 0 ? Math.round((totalDowntimeMinutes / totalIncidents) * 10) / 10 : 0;
  const mttrHours = Math.round((mttrMinutes / 60) * 10) / 10;

  // Machine Pareto calculation
  const machineList = Array.from(machineMap.entries())
    .map(([machine, stats]) => ({
      machine,
      downtimeMinutes: Math.round(stats.downtime * 10) / 10,
      downtimeHours: Math.round((stats.downtime / 60) * 10) / 10,
      incidents: stats.incidents,
      percentage: totalDowntimeMinutes > 0 ? (stats.downtime / totalDowntimeMinutes) * 100 : 0,
    }))
    .sort((a, b) => b.downtimeMinutes - a.downtimeMinutes);

  let runningCumulative = 0;
  const machinePareto: MachineParetoPoint[] = machineList.map((m) => {
    runningCumulative += m.percentage;
    return {
      ...m,
      percentage: Math.round(m.percentage * 10) / 10,
      cumulativePercentage: Math.min(100, Math.round(runningCumulative * 10) / 10),
    };
  });

  const topMachineName = machinePareto[0]?.machine ?? null;
  const topMachineDowntime = machinePareto[0]?.downtimeMinutes ?? 0;

  // Category distribution
  const categoryDistribution: CategoryBreakdownPoint[] = Array.from(categoryMap.entries())
    .map(([category, stats]) => ({
      category,
      downtimeMinutes: Math.round(stats.downtime * 10) / 10,
      incidents: stats.incidents,
      percentage:
        totalDowntimeMinutes > 0
          ? Math.round((stats.downtime / totalDowntimeMinutes) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.downtimeMinutes - a.downtimeMinutes);

  const topCategory = categoryDistribution[0]?.category ?? null;
  const topCategoryPercent = categoryDistribution[0]?.percentage ?? 0;

  // Shift distribution
  const shiftDistribution: ShiftBreakdownPoint[] = Array.from(shiftMap.entries())
    .map(([shift, stats]) => ({
      shift,
      downtimeMinutes: Math.round(stats.downtime * 10) / 10,
      incidents: stats.incidents,
      percentage:
        totalDowntimeMinutes > 0
          ? Math.round((stats.downtime / totalDowntimeMinutes) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.downtimeMinutes - a.downtimeMinutes);

  // Technician performance
  const technicianPerformance: TechnicianPerformancePoint[] = Array.from(techMap.entries())
    .map(([technician, stats]) => ({
      technician,
      incidentsAttended: stats.incidents,
      totalDowntimeMinutes: Math.round(stats.downtime * 10) / 10,
      avgResolutionMinutes:
        stats.incidents > 0 ? Math.round((stats.downtime / stats.incidents) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.incidentsAttended - a.incidentsAttended);

  // Trend points
  const trend: DowntimeTrendPoint[] = Array.from(trendMap.entries())
    .map(([period, stats]) => ({
      period,
      downtimeMinutes: Math.round(stats.downtime * 10) / 10,
      downtimeHours: Math.round((stats.downtime / 60) * 10) / 10,
      incidents: stats.incidents,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const kpis: MaintenanceKpis = {
    totalDowntimeMinutes: Math.round(totalDowntimeMinutes * 10) / 10,
    totalDowntimeHours,
    totalIncidents,
    mttrMinutes,
    mttrHours,
    topMachineName,
    topMachineDowntime,
    topCategory,
    topCategoryPercent,
    mechanicalDowntime: Math.round(mechanicalDowntime * 10) / 10,
    electricalDowntime: Math.round(electricalDowntime * 10) / 10,
    totalProductionLoss: Math.round(totalProductionLoss * 10) / 10,
  };

  return {
    kpis,
    trend,
    machinePareto,
    categoryDistribution,
    shiftDistribution,
    technicianPerformance,
    filteredRecords: records,
  };
}

