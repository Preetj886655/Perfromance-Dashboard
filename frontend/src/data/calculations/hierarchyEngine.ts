/**
 * Hierarchy Engine — Phase 4: Line, Work Center & Machine Performance
 *
 * Implements the operational manufacturing hierarchy:
 *   Line (ERC, SKL, BFS, Injection Moulding)
 *     ↓
 *   Work Center (Autocopy, MPI, IBH, Quenching, Tempering, Unmapped)
 *     ↓
 *   Raw Machine (Autocopying-1..9, SBL, Bar corpper 1, etc.)
 *
 * Features:
 * - Line performance (Production, Target, Achievement %, Downtime, Loss, Rejection, Rejection Rate, Utilization)
 * - Work Center performance & downtime/loss contribution percentages
 * - Machine drill-down & equipment telemetry (idle reason / rejection reason breakdowns)
 * - Minimum sample-size protection for ranking algorithms
 * - Mathematical reconciliation verification (Plant Total == Sum of Work Centers == Sum of Machines)
 * - Time-series trend generation by Work Center
 */

import type { DprRecord } from "../normalization/normalizeDprData";
import { BUSINESS_LINES, normalizeLine } from "../normalization/lineShiftMaterial";
import { sortWorkCenters } from "../normalization/workCenterMapping";

export type LinePerformance = {
  lineKey: string;                     // e.g. "ERC Line", "SKL Line"
  rawLine: string;                     // e.g. "ERC", "SKL"
  recordCount: number;
  production: number;
  target: number;
  achievement: number | null;
  downtimeMinutes: number;
  productionLoss: number;
  rejection: number;
  rejectionRate: number | null;
  utilizationPercent: number | null;
  downtimeContributionPercent: number; // vs plant total
  lossContributionPercent: number;     // vs plant total
  productionContributionPercent: number;
  workCenters: string[];
};

export type WorkCenterPerformance = {
  workCenterKey: string;               // e.g. "Autocopy", "MPI", "Unmapped"
  recordCount: number;
  production: number;
  target: number;
  achievement: number | null;
  downtimeMinutes: number;
  productionLoss: number;
  rejection: number;
  rejectionRate: number | null;
  downtimeContributionPercent: number; // vs active parent total
  lossContributionPercent: number;     // vs active parent total
  productionContributionPercent: number;
  machinesCount: number;
  machines: string[];
  qualifiedForRanking: boolean;
  qualificationReason?: string;
};

export type ReasonBreakdownItem = {
  reason: string;
  amount: number;
  percent: number;
};

export type MachinePerformance = {
  machineKey: string;                  // Raw machine name
  workCenterKey: string;               // Mapped Work Center
  lineKey: string;                     // Mapped Line
  recordCount: number;
  production: number;
  target: number;
  achievement: number | null;
  downtimeMinutes: number;
  productionLoss: number;
  rejection: number;
  rejectionRate: number | null;
  downtimeContributionToWorkCenterPercent: number;
  lossContributionToWorkCenterPercent: number;
  downtimeContributionToPlantPercent: number;
  lossContributionToPlantPercent: number;
  topIdleReasons: ReasonBreakdownItem[];
  topRejectionReasons: ReasonBreakdownItem[];
  qualifiedForRanking: boolean;
};

export type HierarchyRankings = {
  bestWorkCenter: WorkCenterPerformance | null;
  worstWorkCenter: WorkCenterPerformance | null;
  highestDowntimeWorkCenter: WorkCenterPerformance | null;
  highestLossWorkCenter: WorkCenterPerformance | null;
  highestRejectionWorkCenter: WorkCenterPerformance | null;
  topDowntimeMachines: MachinePerformance[];
  topLossMachines: MachinePerformance[];
  topRejectionMachines: MachinePerformance[];
  topProductionMachines: MachinePerformance[];
};

export type WorkCenterTrendPoint = {
  date: string;
  [workCenterKey: string]: string | number;
};

export type HierarchyAnalysis = {
  lines: LinePerformance[];
  workCenters: WorkCenterPerformance[];
  machines: MachinePerformance[];
  rankings: HierarchyRankings;
  trendByWorkCenter: WorkCenterTrendPoint[];
  plantTotals: {
    production: number;
    target: number;
    achievement: number | null;
    downtimeMinutes: number;
    productionLoss: number;
    rejection: number;
    rejectionRate: number | null;
    totalRecords: number;
  };
  reconciliation: {
    workCenterProductionDiff: number;
    workCenterDowntimeDiff: number;
    workCenterLossDiff: number;
    isReconciled: boolean;
  };
};

/** Row-level target calculation aligned with productionKpis.ts. */
export function getRowTarget(row: DprRecord): number {
  if (typeof row.targetProduction === "number" && Number.isFinite(row.targetProduction)) {
    return row.targetProduction;
  }
  if (!(typeof row.targetQtyPerHour === "number" && Number.isFinite(row.targetQtyPerHour))) {
    return 0;
  }
  const hourFactor =
    typeof row.productionHour === "number" && Number.isFinite(row.productionHour)
      ? row.productionHour
      : typeof row.availableTimeMinutes === "number" && Number.isFinite(row.availableTimeMinutes)
        ? row.availableTimeMinutes / 60
        : 1;
  return row.targetQtyPerHour * hourFactor;
}

/** Row-level downtime calculation (planned + unplanned). */
export function getRowDowntime(row: DprRecord): number {
  const planned = typeof row.plannedDownTimeMinutes === "number" && Number.isFinite(row.plannedDownTimeMinutes) ? row.plannedDownTimeMinutes : 0;
  const unplanned = typeof row.totalIdleTimeMinutes === "number" && Number.isFinite(row.totalIdleTimeMinutes) ? row.totalIdleTimeMinutes : 0;
  return planned + unplanned;
}

/** Safe division for percentage calculation. */
export function safePercent(numerator: number, denominator: number): number {
  if (denominator <= 0 || !Number.isFinite(denominator) || !Number.isFinite(numerator)) return 0;
  return (numerator / denominator) * 100;
}

/**
 * Calculates complete hierarchical analysis across Line, Work Center, and Machine dimensions.
 */
export function calculateHierarchyAnalysis(records: DprRecord[]): HierarchyAnalysis {
  // 1. Plant Totals
  let totalProd = 0;
  let totalTarget = 0;
  let totalDowntime = 0;
  let totalLoss = 0;
  let totalRejection = 0;
  let utilSum = 0;
  let utilCount = 0;

  for (const row of records) {
    totalProd += row.actualProductionQty ?? 0;
    totalTarget += getRowTarget(row);
    totalDowntime += getRowDowntime(row);
    totalLoss += typeof row.productionLoss === "number" && Number.isFinite(row.productionLoss) ? row.productionLoss : 0;
    totalRejection += row.totalRejectionQty ?? 0;
    if (typeof row.machineUtilizationRatio === "number" && Number.isFinite(row.machineUtilizationRatio)) {
      utilSum += row.machineUtilizationRatio;
      utilCount++;
    }
  }

  const plantTotals = {
    production: totalProd,
    target: totalTarget,
    achievement: totalTarget > 0 ? (totalProd / totalTarget) * 100 : null,
    downtimeMinutes: totalDowntime,
    productionLoss: totalLoss,
    rejection: totalRejection,
    rejectionRate: totalProd > 0 ? (totalRejection / totalProd) * 100 : null,
    totalRecords: records.length,
  };

  // 2. Line Breakdown
  const lineMap = new Map<string, {
    rawLine: string;
    recordCount: number;
    production: number;
    target: number;
    downtimeMinutes: number;
    productionLoss: number;
    rejection: number;
    utilSum: number;
    utilCount: number;
    workCenters: Set<string>;
  }>();

  // Ensure all 4 supported business lines exist in the map
  for (const bl of BUSINESS_LINES) {
    lineMap.set(bl, {
      rawLine: bl.replace(" Line", ""),
      recordCount: 0,
      production: 0,
      target: 0,
      downtimeMinutes: 0,
      productionLoss: 0,
      rejection: 0,
      utilSum: 0,
      utilCount: 0,
      workCenters: new Set<string>(),
    });
  }

  for (const row of records) {
    const rawLine = row.lineName?.trim() || "Unknown";
    const lineKey = normalizeLine(rawLine) || rawLine;
    const existing = lineMap.get(lineKey) ?? {
      rawLine,
      recordCount: 0,
      production: 0,
      target: 0,
      downtimeMinutes: 0,
      productionLoss: 0,
      rejection: 0,
      utilSum: 0,
      utilCount: 0,
      workCenters: new Set<string>(),
    };

    existing.recordCount++;
    existing.production += row.actualProductionQty ?? 0;
    existing.target += getRowTarget(row);
    existing.downtimeMinutes += getRowDowntime(row);
    existing.productionLoss += typeof row.productionLoss === "number" && Number.isFinite(row.productionLoss) ? row.productionLoss : 0;
    existing.rejection += row.totalRejectionQty ?? 0;
    if (typeof row.machineUtilizationRatio === "number" && Number.isFinite(row.machineUtilizationRatio)) {
      existing.utilSum += row.machineUtilizationRatio;
      existing.utilCount++;
    }
    if (row.workCenter) {
      existing.workCenters.add(row.workCenter);
    }

    lineMap.set(lineKey, existing);
  }

  const lines: LinePerformance[] = [...lineMap.entries()].map(([lineKey, d]) => ({
    lineKey,
    rawLine: d.rawLine,
    recordCount: d.recordCount,
    production: d.production,
    target: d.target,
    achievement: d.target > 0 ? (d.production / d.target) * 100 : null,
    downtimeMinutes: d.downtimeMinutes,
    productionLoss: d.productionLoss,
    rejection: d.rejection,
    rejectionRate: d.production > 0 ? (d.rejection / d.production) * 100 : null,
    utilizationPercent: d.utilCount > 0 ? (d.utilSum / d.utilCount) * 100 : null,
    downtimeContributionPercent: safePercent(d.downtimeMinutes, totalDowntime),
    lossContributionPercent: safePercent(d.productionLoss, totalLoss),
    productionContributionPercent: safePercent(d.production, totalProd),
    workCenters: Array.from(d.workCenters),
  })).sort((a, b) => b.production - a.production);

  // 3. Work Center Breakdown
  const wcMap = new Map<string, {
    recordCount: number;
    production: number;
    target: number;
    downtimeMinutes: number;
    productionLoss: number;
    rejection: number;
    machines: Set<string>;
  }>();

  for (const row of records) {
    const wcKey = row.workCenter || "Unmapped";
    const machine = (row.machineName || row.machineNo || "").trim();

    const existing = wcMap.get(wcKey) ?? {
      recordCount: 0,
      production: 0,
      target: 0,
      downtimeMinutes: 0,
      productionLoss: 0,
      rejection: 0,
      machines: new Set<string>(),
    };

    existing.recordCount++;
    existing.production += row.actualProductionQty ?? 0;
    existing.target += getRowTarget(row);
    existing.downtimeMinutes += getRowDowntime(row);
    existing.productionLoss += typeof row.productionLoss === "number" && Number.isFinite(row.productionLoss) ? row.productionLoss : 0;
    existing.rejection += row.totalRejectionQty ?? 0;
    if (machine) {
      existing.machines.add(machine);
    }

    wcMap.set(wcKey, existing);
  }

  // Calculate median production for sample-size threshold
  const prods = [...wcMap.values()].map((w) => w.production).filter((p) => p > 0).sort((a, b) => a - b);
  const medianProd = prods.length > 0 ? prods[Math.floor(prods.length / 2)] : 0;
  const minRowsThreshold = Math.min(50, Math.max(10, Math.floor(records.length * 0.02)));

  const workCenters: WorkCenterPerformance[] = [...wcMap.entries()].map(([wcKey, d]) => {
    // Qualification rule: at least 50 rows (or 2% of slice) OR at least 20% of median production, AND target > 0
    const hasSufficientRows = d.recordCount >= minRowsThreshold;
    const hasSufficientVolume = medianProd > 0 ? d.production >= medianProd * 0.2 : d.production > 0;
    const hasTarget = d.target > 0;
    const qualifiedForRanking = (hasSufficientRows || hasSufficientVolume) && hasTarget;

    let qualificationReason = "Qualified";
    if (!hasTarget) {
      qualificationReason = "No production target recorded";
    } else if (!hasSufficientRows && !hasSufficientVolume) {
      qualificationReason = `Insufficient sample size (< ${minRowsThreshold} records and < 20% median volume)`;
    }

    return {
      workCenterKey: wcKey,
      recordCount: d.recordCount,
      production: d.production,
      target: d.target,
      achievement: d.target > 0 ? (d.production / d.target) * 100 : null,
      downtimeMinutes: d.downtimeMinutes,
      productionLoss: d.productionLoss,
      rejection: d.rejection,
      rejectionRate: d.production > 0 ? (d.rejection / d.production) * 100 : null,
      downtimeContributionPercent: safePercent(d.downtimeMinutes, totalDowntime),
      lossContributionPercent: safePercent(d.productionLoss, totalLoss),
      productionContributionPercent: safePercent(d.production, totalProd),
      machinesCount: d.machines.size,
      machines: Array.from(d.machines),
      qualifiedForRanking,
      qualificationReason,
    };
  });

  // Sort by approved business order, then alphabetically, Unmapped last
  const orderedWcKeys = sortWorkCenters(workCenters.map((w) => w.workCenterKey));
  workCenters.sort((a, b) => orderedWcKeys.indexOf(a.workCenterKey) - orderedWcKeys.indexOf(b.workCenterKey));

  // 4. Machine Breakdown
  const machineMap = new Map<string, {
    workCenterKey: string;
    lineKey: string;
    recordCount: number;
    production: number;
    target: number;
    downtimeMinutes: number;
    productionLoss: number;
    rejection: number;
    idleReasons: Map<string, number>;
    rejectionReasons: Map<string, number>;
  }>();

  for (const row of records) {
    const machine = (row.machineName || row.machineNo || "Unspecified").trim();
    const wcKey = row.workCenter || "Unmapped";
    const lineKey = normalizeLine(row.lineName?.trim()) || row.lineName?.trim() || "Unknown";

    const existing = machineMap.get(machine) ?? {
      workCenterKey: wcKey,
      lineKey,
      recordCount: 0,
      production: 0,
      target: 0,
      downtimeMinutes: 0,
      productionLoss: 0,
      rejection: 0,
      idleReasons: new Map<string, number>(),
      rejectionReasons: new Map<string, number>(),
    };

    existing.recordCount++;
    existing.production += row.actualProductionQty ?? 0;
    existing.target += getRowTarget(row);
    const dt = getRowDowntime(row);
    existing.downtimeMinutes += dt;
    existing.productionLoss += typeof row.productionLoss === "number" && Number.isFinite(row.productionLoss) ? row.productionLoss : 0;
    const rej = row.totalRejectionQty ?? 0;
    existing.rejection += rej;

    // Track idle reasons
    if (row.idleReasonBreakup && row.idleReasonBreakup.length > 0) {
      for (const item of row.idleReasonBreakup) {
        existing.idleReasons.set(item.reason, (existing.idleReasons.get(item.reason) ?? 0) + item.minutes);
      }
    } else if (row.idleReason && dt > 0) {
      existing.idleReasons.set(row.idleReason, (existing.idleReasons.get(row.idleReason) ?? 0) + dt);
    }

    // Track rejection reasons
    if (row.rejectionReasonBreakup && row.rejectionReasonBreakup.length > 0) {
      for (const item of row.rejectionReasonBreakup) {
        existing.rejectionReasons.set(item.reason, (existing.rejectionReasons.get(item.reason) ?? 0) + item.qty);
      }
    } else if (row.rejectionReason && rej > 0) {
      existing.rejectionReasons.set(row.rejectionReason, (existing.rejectionReasons.get(row.rejectionReason) ?? 0) + rej);
    }

    machineMap.set(machine, existing);
  }

  // Pre-index work center downtime/loss totals for machine contribution calculation
  const wcDowntimeTotals = new Map<string, number>();
  const wcLossTotals = new Map<string, number>();
  for (const wc of workCenters) {
    wcDowntimeTotals.set(wc.workCenterKey, wc.downtimeMinutes);
    wcLossTotals.set(wc.workCenterKey, wc.productionLoss);
  }

  const machines: MachinePerformance[] = [...machineMap.entries()].map(([machineKey, d]) => {
    const parentWcDowntime = wcDowntimeTotals.get(d.workCenterKey) ?? 0;
    const parentWcLoss = wcLossTotals.get(d.workCenterKey) ?? 0;

    const topIdleReasons = [...d.idleReasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, amount]) => ({
        reason,
        amount,
        percent: safePercent(amount, d.downtimeMinutes),
      }));

    const topRejectionReasons = [...d.rejectionReasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, amount]) => ({
        reason,
        amount,
        percent: safePercent(amount, d.rejection),
      }));

    return {
      machineKey,
      workCenterKey: d.workCenterKey,
      lineKey: d.lineKey,
      recordCount: d.recordCount,
      production: d.production,
      target: d.target,
      achievement: d.target > 0 ? (d.production / d.target) * 100 : null,
      downtimeMinutes: d.downtimeMinutes,
      productionLoss: d.productionLoss,
      rejection: d.rejection,
      rejectionRate: d.production > 0 ? (d.rejection / d.production) * 100 : null,
      downtimeContributionToWorkCenterPercent: safePercent(d.downtimeMinutes, parentWcDowntime),
      lossContributionToWorkCenterPercent: safePercent(d.productionLoss, parentWcLoss),
      downtimeContributionToPlantPercent: safePercent(d.downtimeMinutes, totalDowntime),
      lossContributionToPlantPercent: safePercent(d.productionLoss, totalLoss),
      topIdleReasons,
      topRejectionReasons,
      qualifiedForRanking: d.recordCount >= 20 && d.target > 0,
    };
  }).sort((a, b) => b.downtimeMinutes - a.downtimeMinutes);

  // 5. Rankings Calculation (with sample-size protection)
  const qualifiedWcs = workCenters.filter((w) => w.qualifiedForRanking && w.achievement !== null);
  const sortedWcByAch = [...qualifiedWcs].sort((a, b) => (b.achievement ?? 0) - (a.achievement ?? 0));

  const bestWorkCenter = sortedWcByAch.length > 0 ? sortedWcByAch[0] : null;
  const worstWorkCenter = sortedWcByAch.length > 1 ? sortedWcByAch[sortedWcByAch.length - 1] : null;

  const sortedWcByDt = [...workCenters].sort((a, b) => b.downtimeMinutes - a.downtimeMinutes);
  const highestDowntimeWorkCenter = sortedWcByDt.length > 0 ? sortedWcByDt[0] : null;

  const sortedWcByLoss = [...workCenters].sort((a, b) => b.productionLoss - a.productionLoss);
  const highestLossWorkCenter = sortedWcByLoss.length > 0 ? sortedWcByLoss[0] : null;

  const sortedWcByRej = [...workCenters].sort((a, b) => b.rejection - a.rejection);
  const highestRejectionWorkCenter = sortedWcByRej.length > 0 ? sortedWcByRej[0] : null;

  const topDowntimeMachines = [...machines].sort((a, b) => b.downtimeMinutes - a.downtimeMinutes).slice(0, 10);
  const topLossMachines = [...machines].sort((a, b) => b.productionLoss - a.productionLoss).slice(0, 10);
  const topRejectionMachines = [...machines].sort((a, b) => b.rejection - a.rejection).slice(0, 10);
  const topProductionMachines = [...machines].sort((a, b) => b.production - a.production).slice(0, 10);

  const rankings: HierarchyRankings = {
    bestWorkCenter,
    worstWorkCenter,
    highestDowntimeWorkCenter,
    highestLossWorkCenter,
    highestRejectionWorkCenter,
    topDowntimeMachines,
    topLossMachines,
    topRejectionMachines,
    topProductionMachines,
  };

  // 6. Trend by Work Center
  const trendMap = new Map<string, Map<string, number>>();
  for (const row of records) {
    if (!row.date) continue;
    const wcKey = row.workCenter || "Unmapped";
    const prod = row.actualProductionQty ?? 0;
    const dateEntry = trendMap.get(row.date) ?? new Map<string, number>();
    dateEntry.set(wcKey, (dateEntry.get(wcKey) ?? 0) + prod);
    trendMap.set(row.date, dateEntry);
  }

  const sortedDates = [...trendMap.keys()].sort((a, b) => a.localeCompare(b));
  const trendByWorkCenter: WorkCenterTrendPoint[] = sortedDates.map((date) => {
    const point: WorkCenterTrendPoint = { date };
    const dateEntry = trendMap.get(date);
    if (dateEntry) {
      for (const [wc, p] of dateEntry.entries()) {
        point[wc] = p;
      }
    }
    return point;
  });

  // 7. Mathematical Reconciliation Verification
  const sumWcProd = workCenters.reduce((sum, w) => sum + w.production, 0);
  const sumWcDt = workCenters.reduce((sum, w) => sum + w.downtimeMinutes, 0);
  const sumWcLoss = workCenters.reduce((sum, w) => sum + w.productionLoss, 0);

  const prodDiff = Math.abs(totalProd - sumWcProd);
  const dtDiff = Math.abs(totalDowntime - sumWcDt);
  const lossDiff = Math.abs(totalLoss - sumWcLoss);

  // Precision tolerance of 0.001
  const isReconciled = prodDiff < 0.001 && dtDiff < 0.001 && lossDiff < 0.001;

  return {
    lines,
    workCenters,
    machines,
    rankings,
    trendByWorkCenter,
    plantTotals,
    reconciliation: {
      workCenterProductionDiff: prodDiff,
      workCenterDowntimeDiff: dtDiff,
      workCenterLossDiff: lossDiff,
      isReconciled,
    },
  };
}
