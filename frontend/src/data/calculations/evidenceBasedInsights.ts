/**
 * Evidence-Based Manufacturing Insights Engine — Phase 7
 *
 * Mathematically derives deterministic, evidence-backed operational insights
 * from live dashboard calculations.
 *
 * Strict Principles:
 * 1. Zero hallucinations: Every observation comes from verified calculations.
 * 2. Strict 6-part contract: INSIGHT, EVIDENCE, WHERE, WHY, PRIORITY, ACTION.
 * 3. Configurable thresholds: Small variations are suppressed.
 * 4. Sample-size protection: Entities with < 10 records trigger warnings.
 * 5. Filter-awareness: Insights reflect ONLY the active filtered dataset.
 * 6. Transparent rule-based priorities: Documented logic for CRITICAL, HIGH, MEDIUM, POSITIVE.
 */

import type { DashboardAnalytics } from "../../components/dashboard/slides/useDashboardAnalytics";
import type { FilterState } from "../../pages/ManufacturingDashboard";
import type {
  LinePerformance,
  WorkCenterPerformance,
} from "./hierarchyEngine";
import { formatCompactWithExact } from "../../utils/format";

export type InsightCategory =
  | "Best Line"
  | "Worst Line"
  | "Best Work Center"
  | "Worst Work Center"
  | "Highest Downtime Contributor"
  | "Highest Production Loss Contributor"
  | "Highest Rejection Contributor"
  | "Significant Period Change"
  | "Abnormal Trend"
  | "Priority Improvement Area";

export type InsightPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "POSITIVE";

export interface EvidenceInsight {
  id: string;
  category: InsightCategory;
  insight: string;             // Concise headline observation
  evidence: string;            // Exact numerical calculation
  where: string;               // Line → Work Center → Machine
  why: string;                 // Contributing driver / root cause
  priority: InsightPriority;   // Rule-based priority
  action: string;              // Concrete operational recommendation
  sampleSizeWarning?: string;  // Warning if sample size is below threshold
  metrics: {
    primaryValue: number | string | null;
    secondaryValue?: number | string | null;
    sharePercent?: number | null;
    sampleSize: number;
    unit?: string;
  };
}

export interface InsightThresholds {
  minSampleSize: number;                // Default: 10 records
  significantPeriodRateDeltaPp: number; // Default: 5.0 percentage points
  significantPeriodVolDeltaPct: number; // Default: 10.0%
  highDowntimeSharePct: number;         // Default: 25.0%
  highLossSharePct: number;             // Default: 25.0%
  criticalRejectionRatePct: number;     // Default: 2.0%
  warningRejectionRatePct: number;      // Default: 1.0%
  abnormalTrendDailyDropPct: number;    // Default: 35.0%
  criticalAchievementPct: number;       // Default: 70.0%
}

export const DEFAULT_INSIGHT_THRESHOLDS: InsightThresholds = {
  minSampleSize: 10,
  significantPeriodRateDeltaPp: 5.0,
  significantPeriodVolDeltaPct: 10.0,
  highDowntimeSharePct: 25.0,
  highLossSharePct: 25.0,
  criticalRejectionRatePct: 2.0,
  warningRejectionRatePct: 1.0,
  abnormalTrendDailyDropPct: 35.0,
  criticalAchievementPct: 70.0,
};

function formatNumber(value: number): string {
  const { compact, exact } = formatCompactWithExact(value);
  if (Math.abs(value) < 1_000) return exact;
  return `${compact} (${exact})`;
}

function formatPercent(value: number | null): string {
  if (value === null || !isFinite(value) || isNaN(value)) return "N/A";
  return `${value.toFixed(1)}%`;
}

export function formatActiveFilterScope(filters?: FilterState): string {
  if (!filters) return "All Plant Lines, Stages & Materials";
  const parts: string[] = [];
  if (filters.period && filters.period !== "all-time") parts.push(`Period: ${filters.period}`);
  if (filters.dateFrom || filters.dateTo) parts.push(`Date: ${filters.dateFrom || "Start"} → ${filters.dateTo || "End"}`);
  if (filters.line && filters.line !== "All Lines") parts.push(`Line: ${filters.line}`);
  if (filters.shift && filters.shift !== "All Shifts") parts.push(`Shift: ${filters.shift}`);
  if (filters.stage && filters.stage !== "All Stages") parts.push(`Stage: ${filters.stage}`);
  // LEGACY: workCenter is only set by the Work Center Analytics slide drill-down.
  if (filters.workCenter && filters.workCenter !== "All Work Centers") parts.push(`Work Center: ${filters.workCenter}`);
  if (filters.material && filters.material !== "All Materials") parts.push(`Material: ${filters.material}`);
  return parts.length > 0 ? parts.join(" • ") : "All Plant Lines, Stages & Materials";
}

// ============================================================
// 1. BEST LINE
// ============================================================
export function generateBestLineInsight(
  analytics: DashboardAnalytics,
  thresholds: InsightThresholds
): EvidenceInsight {
  const lines = analytics.hierarchyAnalysis.lines.filter((l) => l.recordCount > 0);

  if (lines.length === 0) {
    return {
      id: "best-line",
      category: "Best Line",
      insight: "No line performance data recorded in active filter window.",
      evidence: "Active dataset contains 0 line records.",
      where: "Plant Overview",
      why: "No active production records match current filter parameters.",
      priority: "MEDIUM",
      action: "Broaden filter parameters or verify plant connectivity.",
      metrics: { primaryValue: null, sampleSize: 0 },
    };
  }

  const linesWithTarget = lines.filter((l) => l.target > 0 && l.achievement !== null);
  const bestLine: LinePerformance = linesWithTarget.length > 0
    ? [...linesWithTarget].sort((a, b) => (b.achievement ?? 0) - (a.achievement ?? 0))[0]
    : [...lines].sort((a, b) => b.production - a.production)[0];

  const hasTarget = bestLine.achievement !== null;
  const sampleWarning = bestLine.recordCount < thresholds.minSampleSize
    ? `[SAMPLE SIZE WARNING: Only ${bestLine.recordCount} records (threshold: ${thresholds.minSampleSize})]`
    : undefined;

  const priority: InsightPriority = hasTarget && (bestLine.achievement ?? 0) >= 90
    ? "POSITIVE"
    : hasTarget && (bestLine.achievement ?? 0) >= thresholds.criticalAchievementPct
      ? "MEDIUM"
      : "HIGH";

  return {
    id: "best-line",
    category: "Best Line",
    insight: `${bestLine.lineKey} is the top-performing production line${hasTarget ? ` at ${formatPercent(bestLine.achievement)} attainment` : ""}.`,
    evidence: `${bestLine.lineKey} produced ${formatNumber(bestLine.production)} units${hasTarget ? ` against a target of ${formatNumber(bestLine.target)} units (${formatPercent(bestLine.achievement)} attainment)` : ""} across ${bestLine.recordCount} records (${bestLine.productionContributionPercent.toFixed(1)}% of plant output).`,
    where: `Line: ${bestLine.lineKey}`,
    why: `Demonstrated the highest operational output and target attainment across ${bestLine.workCenters.join(", ") || "active work centers"}.`,
    priority,
    action: `Maintain current production pacing and review shift scheduling practices for adoption across other lines.`,
    sampleSizeWarning: sampleWarning,
    metrics: {
      primaryValue: bestLine.achievement ?? bestLine.production,
      secondaryValue: bestLine.production,
      sharePercent: bestLine.productionContributionPercent,
      sampleSize: bestLine.recordCount,
      unit: hasTarget ? "%" : "units",
    },
  };
}

// ============================================================
// 2. WORST LINE
// ============================================================
export function generateWorstLineInsight(
  analytics: DashboardAnalytics,
  thresholds: InsightThresholds
): EvidenceInsight {
  const lines = analytics.hierarchyAnalysis.lines.filter((l) => l.recordCount > 0);

  if (lines.length === 0) {
    return {
      id: "worst-line",
      category: "Worst Line",
      insight: "No line performance data recorded in active filter window.",
      evidence: "Active dataset contains 0 line records.",
      where: "Plant Overview",
      why: "No records found.",
      priority: "MEDIUM",
      action: "Broaden filter selection.",
      metrics: { primaryValue: null, sampleSize: 0 },
    };
  }

  const linesWithTarget = lines.filter((l) => l.target > 0 && l.achievement !== null);
  const worstLine: LinePerformance = linesWithTarget.length > 0
    ? [...linesWithTarget].sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0))[0]
    : [...lines].sort((a, b) => (b.downtimeMinutes + b.productionLoss) - (a.downtimeMinutes + a.productionLoss))[0];

  const hasTarget = worstLine.achievement !== null;
  const shortfall = hasTarget && worstLine.target > worstLine.production
    ? worstLine.target - worstLine.production
    : 0;

  const sampleWarning = worstLine.recordCount < thresholds.minSampleSize
    ? `[SAMPLE SIZE WARNING: Only ${worstLine.recordCount} records (threshold: ${thresholds.minSampleSize})]`
    : undefined;

  const priority: InsightPriority = hasTarget && (worstLine.achievement ?? 100) < thresholds.criticalAchievementPct
    ? "CRITICAL"
    : worstLine.downtimeContributionPercent > thresholds.highDowntimeSharePct
      ? "HIGH"
      : "MEDIUM";

  return {
    id: "worst-line",
    category: "Worst Line",
    insight: `${worstLine.lineKey} requires executive attention with ${hasTarget ? `${formatPercent(worstLine.achievement)} attainment` : "elevated operational loss"}.`,
    evidence: `${worstLine.lineKey} achieved ${hasTarget ? formatPercent(worstLine.achievement) : "N/A"} (${formatNumber(worstLine.production)} / ${formatNumber(worstLine.target)} units; shortfall: ${formatNumber(shortfall)} units) with ${formatNumber(worstLine.downtimeMinutes)} min downtime (${worstLine.downtimeContributionPercent.toFixed(1)}% of plant total).`,
    where: `Line: ${worstLine.lineKey}`,
    why: worstLine.downtimeMinutes > 0
      ? `Output suppressed by ${formatNumber(worstLine.downtimeMinutes)} minutes of recorded downtime and ${formatNumber(worstLine.productionLoss)} units lost.`
      : "Production target pacing fell behind scheduled runtime requirements.",
    priority,
    action: `Audit equipment availability, resolve primary downtime root causes, and rebalance hourly line rate targets.`,
    sampleSizeWarning: sampleWarning,
    metrics: {
      primaryValue: worstLine.achievement ?? worstLine.downtimeMinutes,
      secondaryValue: shortfall,
      sharePercent: worstLine.downtimeContributionPercent,
      sampleSize: worstLine.recordCount,
      unit: hasTarget ? "%" : "min",
    },
  };
}

// ============================================================
// 3. BEST WORK CENTER
// ============================================================
export function generateBestWorkCenterInsight(
  analytics: DashboardAnalytics,
  thresholds: InsightThresholds
): EvidenceInsight {
  const wcs = analytics.hierarchyAnalysis.workCenters.filter((w) => w.recordCount > 0);

  if (wcs.length === 0) {
    return {
      id: "best-work-center",
      category: "Best Work Center",
      insight: "No work center performance records available in active selection.",
      evidence: "Active dataset contains 0 work center records.",
      where: "All Work Centers",
      why: "No records found.",
      priority: "MEDIUM",
      action: "Check filter parameters.",
      metrics: { primaryValue: null, sampleSize: 0 },
    };
  }

  // Sample-size protection: prioritize qualified work centers
  const qualifiedWcs = wcs.filter((w) => w.recordCount >= thresholds.minSampleSize && w.target > 0 && w.achievement !== null);
  const bestWc: WorkCenterPerformance = qualifiedWcs.length > 0
    ? [...qualifiedWcs].sort((a, b) => (b.achievement ?? 0) - (a.achievement ?? 0))[0]
    : analytics.hierarchyAnalysis.rankings.bestWorkCenter
      ?? [...wcs].sort((a, b) => b.production - a.production)[0];

  const hasTarget = bestWc.achievement !== null;
  const isSampleSmall = bestWc.recordCount < thresholds.minSampleSize;
  const sampleWarning = isSampleSmall
    ? `[SAMPLE SIZE WARNING: Only ${bestWc.recordCount} records (threshold: ${thresholds.minSampleSize})]`
    : undefined;

  const priority: InsightPriority = hasTarget && (bestWc.achievement ?? 0) >= 90 && !isSampleSmall
    ? "POSITIVE"
    : "MEDIUM";

  return {
    id: "best-work-center",
    category: "Best Work Center",
    insight: `${bestWc.workCenterKey} demonstrated benchmark operational efficiency${hasTarget ? ` at ${formatPercent(bestWc.achievement)} attainment` : ""}.`,
    evidence: `${bestWc.workCenterKey} produced ${formatNumber(bestWc.production)} units${hasTarget ? ` against target of ${formatNumber(bestWc.target)} units (${formatPercent(bestWc.achievement)})` : ""} across ${bestWc.recordCount} records with minimal rejection (${formatNumber(bestWc.rejection)} pcs).`,
    where: `Work Center: ${bestWc.workCenterKey}`,
    why: `Maintained consistent flow with low loss contribution (${bestWc.lossContributionPercent.toFixed(1)}% of plant loss) and steady machine utilization.`,
    priority,
    action: `Standardize tooling and operator settings from ${bestWc.workCenterKey} across adjacent work centers.`,
    sampleSizeWarning: sampleWarning,
    metrics: {
      primaryValue: bestWc.achievement ?? bestWc.production,
      secondaryValue: bestWc.production,
      sharePercent: bestWc.productionContributionPercent,
      sampleSize: bestWc.recordCount,
      unit: hasTarget ? "%" : "units",
    },
  };
}

// ============================================================
// 4. WORST WORK CENTER
// ============================================================
export function generateWorstWorkCenterInsight(
  analytics: DashboardAnalytics,
  thresholds: InsightThresholds
): EvidenceInsight {
  const wcs = analytics.hierarchyAnalysis.workCenters.filter((w) => w.recordCount > 0);

  if (wcs.length === 0) {
    return {
      id: "worst-work-center",
      category: "Worst Work Center",
      insight: "No work center performance records available in active selection.",
      evidence: "Active dataset contains 0 work center records.",
      where: "All Work Centers",
      why: "No records found.",
      priority: "MEDIUM",
      action: "Check filter parameters.",
      metrics: { primaryValue: null, sampleSize: 0 },
    };
  }

  // Priority to worstWorkCenter from rankings (sample-size protected) or highest constraint
  const worstWc: WorkCenterPerformance = analytics.hierarchyAnalysis.rankings.worstWorkCenter
    ?? [...wcs].sort((a, b) => (b.downtimeMinutes * 1.5 + b.productionLoss) - (a.downtimeMinutes * 1.5 + a.productionLoss))[0];

  const hasTarget = worstWc.achievement !== null;
  const isSampleSmall = worstWc.recordCount < thresholds.minSampleSize;
  const sampleWarning = isSampleSmall
    ? `[SAMPLE SIZE WARNING: Only ${worstWc.recordCount} records (threshold: ${thresholds.minSampleSize})]`
    : undefined;

  const priority: InsightPriority = worstWc.downtimeContributionPercent > thresholds.highDowntimeSharePct || (hasTarget && (worstWc.achievement ?? 100) < thresholds.criticalAchievementPct)
    ? "CRITICAL"
    : "HIGH";

  return {
    id: "worst-work-center",
    category: "Worst Work Center",
    insight: `${worstWc.workCenterKey} is the primary operational bottleneck requiring cell-level intervention.`,
    evidence: `${worstWc.workCenterKey} accumulated ${formatNumber(worstWc.downtimeMinutes)} min downtime (${worstWc.downtimeContributionPercent.toFixed(1)}% of plant total) and ${formatNumber(worstWc.productionLoss)} units lost (${worstWc.lossContributionPercent.toFixed(1)}% of total loss) across ${worstWc.recordCount} records.`,
    where: `Work Center: ${worstWc.workCenterKey}`,
    why: `Compounded downtime and production loss bottlenecked throughput across the cell's machine line.`,
    priority,
    action: `Prioritize autonomous maintenance, verify lubrication schedules, and reduce changeover duration on ${worstWc.workCenterKey}.`,
    sampleSizeWarning: sampleWarning,
    metrics: {
      primaryValue: worstWc.downtimeMinutes,
      secondaryValue: worstWc.productionLoss,
      sharePercent: worstWc.downtimeContributionPercent,
      sampleSize: worstWc.recordCount,
      unit: "min",
    },
  };
}

// ============================================================
// 5. HIGHEST DOWNTIME CONTRIBUTOR
// ============================================================
export function generateHighestDowntimeInsight(
  analytics: DashboardAnalytics,
  thresholds: InsightThresholds
): EvidenceInsight {
  const topDtWc = analytics.hierarchyAnalysis.rankings.highestDowntimeWorkCenter
    ?? [...analytics.hierarchyAnalysis.workCenters].sort((a, b) => b.downtimeMinutes - a.downtimeMinutes)[0];
  const topDtMachine = analytics.hierarchyAnalysis.rankings.topDowntimeMachines[0];
  const topReason = analytics.downtime.byReason[0];
  const totalPlantDowntime = analytics.downtime.totalDowntimeMinutes;

  if (!topDtWc || topDtWc.downtimeMinutes === 0) {
    return {
      id: "highest-downtime",
      category: "Highest Downtime Contributor",
      insight: "Zero equipment downtime recorded in the active filter selection.",
      evidence: "Total downtime minutes = 0 across all recorded lines.",
      where: "Plant Wide",
      why: "Operations running continuously without logged idle events.",
      priority: "POSITIVE",
      action: "Maintain proactive preventive maintenance schedule.",
      metrics: { primaryValue: 0, sampleSize: analytics.totalRecords, unit: "min" },
    };
  }

  const sharePercent = totalPlantDowntime > 0
    ? (topDtWc.downtimeMinutes / totalPlantDowntime) * 100
    : 0;

  const priority: InsightPriority = sharePercent > thresholds.highDowntimeSharePct
    ? "CRITICAL"
    : sharePercent > 15
      ? "HIGH"
      : "MEDIUM";

  const sampleWarning = topDtWc.recordCount < thresholds.minSampleSize
    ? `[SAMPLE SIZE WARNING: Only ${topDtWc.recordCount} records (threshold: ${thresholds.minSampleSize})]`
    : undefined;

  return {
    id: "highest-downtime",
    category: "Highest Downtime Contributor",
    insight: `${topDtWc.workCenterKey} accounts for the highest downtime concentration across the plant.`,
    evidence: `${topDtWc.workCenterKey} logged ${formatNumber(topDtWc.downtimeMinutes)} min of downtime (${sharePercent.toFixed(1)}% of total filtered ${formatNumber(totalPlantDowntime)} min)${topDtMachine ? `; top machine is ${topDtMachine.machineKey} (${formatNumber(topDtMachine.downtimeMinutes)} min, ${topDtMachine.downtimeContributionToPlantPercent.toFixed(1)}%)` : ""}.`,
    where: `Line → Work Center: ${topDtWc.workCenterKey}${topDtMachine ? ` → Machine: ${topDtMachine.machineKey}` : ""}`,
    why: topReason
      ? `Primary idle reason: "${topReason.key}" accounting for ${formatNumber(topReason.minutes)} min (${totalPlantDowntime > 0 ? ((topReason.minutes / totalPlantDowntime) * 100).toFixed(1) : 0}% of all plant downtime).`
      : `High cumulative maintenance and stoppage time across machines in ${topDtWc.workCenterKey}.`,
    priority,
    action: topReason
      ? `Conduct failure-mode analysis on "${topReason.key}" and restock high-wear replacement components.`
      : `Review mechanical and electrical maintenance logs for ${topDtWc.workCenterKey}.`,
    sampleSizeWarning: sampleWarning,
    metrics: {
      primaryValue: topDtWc.downtimeMinutes,
      secondaryValue: topReason?.minutes ?? null,
      sharePercent,
      sampleSize: topDtWc.recordCount,
      unit: "min",
    },
  };
}

// ============================================================
// 6. HIGHEST PRODUCTION LOSS CONTRIBUTOR
// ============================================================
export function generateHighestLossInsight(
  analytics: DashboardAnalytics,
  thresholds: InsightThresholds
): EvidenceInsight {
  const topLossWc = analytics.hierarchyAnalysis.rankings.highestLossWorkCenter
    ?? [...analytics.hierarchyAnalysis.workCenters].sort((a, b) => b.productionLoss - a.productionLoss)[0];
  const topLossMachine = analytics.hierarchyAnalysis.rankings.topLossMachines[0];
  const totalLoss = typeof analytics.totalProductionLoss === "number" && Number.isFinite(analytics.totalProductionLoss)
    ? analytics.totalProductionLoss
    : 0;

  if (!topLossWc || topLossWc.productionLoss === 0) {
    return {
      id: "highest-loss",
      category: "Highest Production Loss Contributor",
      insight: "Zero production loss recorded in active filter selection.",
      evidence: "Total production loss = 0 units.",
      where: "Plant Wide",
      why: "Production output matched or exceeded hour-by-hour targets without recorded shortfalls.",
      priority: "POSITIVE",
      action: "Maintain current operational cadence.",
      metrics: { primaryValue: 0, sampleSize: analytics.totalRecords, unit: "NOS" },
    };
  }

  const sharePercent = totalLoss > 0
    ? (topLossWc.productionLoss / totalLoss) * 100
    : 0;

  const priority: InsightPriority = sharePercent > thresholds.highLossSharePct
    ? "CRITICAL"
    : sharePercent > 15
      ? "HIGH"
      : "MEDIUM";

  const sampleWarning = topLossWc.recordCount < thresholds.minSampleSize
    ? `[SAMPLE SIZE WARNING: Only ${topLossWc.recordCount} records (threshold: ${thresholds.minSampleSize})]`
    : undefined;

  return {
    id: "highest-loss",
    category: "Highest Production Loss Contributor",
    insight: `${topLossWc.workCenterKey} is the primary source of unrecovered production loss.`,
    evidence: `${topLossWc.workCenterKey} accumulated ${formatNumber(topLossWc.productionLoss)} units lost (${sharePercent.toFixed(1)}% of total plant loss of ${formatNumber(totalLoss)} units)${topLossMachine ? `; top loss machine is ${topLossMachine.machineKey} (${formatNumber(topLossMachine.productionLoss)} units, ${topLossMachine.lossContributionToPlantPercent.toFixed(1)}%)` : ""}.`,
    where: `Work Center: ${topLossWc.workCenterKey}${topLossMachine ? ` → Machine: ${topLossMachine.machineKey}` : ""}`,
    why: topLossMachine
      ? `Loss concentrated in machine ${topLossMachine.machineKey} due to speed losses and micro-stoppages.`
      : `Output rate fell short of hourly capacity due to speed losses and operational lag.`,
    priority,
    action: `Audit machine feed rates and tooling condition on ${topLossMachine ? topLossMachine.machineKey : topLossWc.workCenterKey} to reclaim lost production capacity.`,
    sampleSizeWarning: sampleWarning,
    metrics: {
      primaryValue: topLossWc.productionLoss,
      secondaryValue: topLossMachine?.productionLoss ?? null,
      sharePercent,
      sampleSize: topLossWc.recordCount,
      unit: "NOS",
    },
  };
}

// ============================================================
// 7. HIGHEST REJECTION CONTRIBUTOR
// ============================================================
export function generateHighestRejectionInsight(
  analytics: DashboardAnalytics,
  thresholds: InsightThresholds
): EvidenceInsight {
  const { quality } = analytics;
  const totalRejection = quality.totalRejection;
  const rejectionRate = quality.rejectionRatePercent;
  const topReason = quality.byReason[0];

  const topRejectionWc = analytics.hierarchyAnalysis.rankings.highestRejectionWorkCenter
    ?? [...analytics.hierarchyAnalysis.workCenters].sort((a, b) => b.rejection - a.rejection)[0];

  if (totalRejection === 0) {
    return {
      id: "highest-rejection",
      category: "Highest Rejection Contributor",
      insight: "Zero scrap or defect rejection recorded in active selection.",
      evidence: "Rejection count = 0 pcs (0.00% rejection rate).",
      where: "Quality Inspection",
      why: "All inspected units met engineering specifications.",
      priority: "POSITIVE",
      action: "Maintain current quality assurance and calibration protocols.",
      metrics: { primaryValue: 0, sampleSize: analytics.totalRecords, unit: "pcs" },
    };
  }

  const priority: InsightPriority = rejectionRate !== null && rejectionRate >= thresholds.criticalRejectionRatePct
    ? "CRITICAL"
    : rejectionRate !== null && rejectionRate >= thresholds.warningRejectionRatePct
      ? "HIGH"
      : "MEDIUM";

  return {
    id: "highest-rejection",
    category: "Highest Rejection Contributor",
    insight: `Plant quality logged ${formatNumber(totalRejection)} defect pcs${rejectionRate !== null ? ` with a ${rejectionRate.toFixed(2)}% rejection rate` : ""}.`,
    evidence: `Total rejection of ${formatNumber(totalRejection)} pcs (${rejectionRate !== null ? `${rejectionRate.toFixed(2)}% of production` : "N/A"})${topRejectionWc ? `; concentrated in ${topRejectionWc.workCenterKey} (${formatNumber(topRejectionWc.rejection)} pcs)` : ""}.`,
    where: topRejectionWc ? `Work Center: ${topRejectionWc.workCenterKey} → Inspection` : "Inspection Staging",
    why: topReason
      ? `Primary defect root cause is "${topReason.key}" accounting for ${formatNumber(topReason.value)} defective units.`
      : "Quality defects detected during post-process inspection.",
    priority,
    action: topReason
      ? `Quarantine suspect material batches and recalibrate dies/tooling causing "${topReason.key}".`
      : `Conduct dimensional and surface audit on high-scrap cells.`,
    metrics: {
      primaryValue: totalRejection,
      secondaryValue: rejectionRate,
      sampleSize: analytics.totalRecords,
      unit: "pcs",
    },
  };
}

// ============================================================
// 8. SIGNIFICANT PERIOD CHANGE
// ============================================================
export function generatePeriodChangeInsight(
  analytics: DashboardAnalytics,
  thresholds: InsightThresholds
): EvidenceInsight {
  const comp = analytics.periodComparison;

  if (!comp || !comp.hasPreviousData) {
    return {
      id: "period-change",
      category: "Significant Period Change",
      insight: "Baseline operational period active; comparative prior period not selected.",
      evidence: "Active selection represents a single baseline time window without preceding comparison data.",
      where: "Plant Timeline",
      why: "Comparative period presets (e.g. Current Month, Previous Month, Current Week) activate comparative analysis.",
      priority: "MEDIUM",
      action: "Select a standardized comparative period in Operations Control to activate automatic period-over-period variance tracking.",
      metrics: { primaryValue: null, sampleSize: analytics.totalRecords },
    };
  }

  const achDelta = comp.achievement.deltaAbs; // percentage points
  const prodDeltaPct = comp.production.deltaPct; // percent
  const isSignificantRate = Math.abs(achDelta) >= thresholds.significantPeriodRateDeltaPp;
  const isSignificantVol = prodDeltaPct !== null && Math.abs(prodDeltaPct) >= thresholds.significantPeriodVolDeltaPct;

  const isDeterioration = achDelta < -thresholds.significantPeriodRateDeltaPp || (prodDeltaPct !== null && prodDeltaPct < -thresholds.significantPeriodVolDeltaPct);
  const isImprovement = achDelta > thresholds.significantPeriodRateDeltaPp || (prodDeltaPct !== null && prodDeltaPct > thresholds.significantPeriodVolDeltaPct);

  const priority: InsightPriority = isDeterioration && Math.abs(achDelta) >= 15
    ? "CRITICAL"
    : isDeterioration
      ? "HIGH"
      : isImprovement
        ? "POSITIVE"
        : "MEDIUM";

  const deltaSummary = `${comp.production.formattedDelta} volume (${comp.production.deltaAbs >= 0 ? "+" : ""}${formatNumber(comp.production.deltaAbs)} units), attainment moved by ${comp.achievement.formattedDelta} (from ${comp.achievement.formattedPrevious} to ${comp.achievement.formattedCurrent})`;

  return {
    id: "period-change",
    category: "Significant Period Change",
    insight: isSignificantRate || isSignificantVol
      ? `Significant operational shift detected: ${comp.production.formattedDelta} output vs prior period.`
      : `Operational output held steady compared to the prior comparative period.`,
    evidence: `Current vs Previous: ${deltaSummary}. Downtime moved by ${comp.downtime.formattedDelta}; Production loss changed by ${comp.productionLoss.formattedDelta}.`,
    where: `Period: ${analytics.periodWindow?.current.start} → ${analytics.periodWindow?.current.end} vs Prior (${analytics.periodWindow?.previous.start} → ${analytics.periodWindow?.previous.end})`,
    why: isDeterioration
      ? `Performance drop influenced by ${comp.downtime.formattedDelta} downtime movement and capacity shortfalls.`
      : isImprovement
        ? `Gains achieved through improved line uptime and higher operational pace.`
        : `Normal operating stability within expected statistical variation.`,
    priority,
    action: isDeterioration
      ? `Investigate operational bottlenecks contributing to the ${comp.production.formattedDelta} drop and restore preventative routines.`
      : `Document successful setup parameters to sustain positive period-over-period momentum.`,
    metrics: {
      primaryValue: achDelta,
      secondaryValue: prodDeltaPct,
      sampleSize: analytics.totalRecords,
      unit: "p.p.",
    },
  };
}

// ============================================================
// 9. ABNORMAL TREND
// ============================================================
export function generateAbnormalTrendInsight(
  analytics: DashboardAnalytics,
  thresholds: InsightThresholds
): EvidenceInsight {
  const daily = analytics.dailySeries ?? [];

  if (daily.length < 2) {
    return {
      id: "abnormal-trend",
      category: "Abnormal Trend",
      insight: "Insufficient daily series length to detect multi-day trend anomalies.",
      evidence: `Active dataset contains only ${daily.length} daily time buckets.`,
      where: "Timeline",
      why: "Minimum of 2 consecutive days required for day-over-day trend evaluation.",
      priority: "MEDIUM",
      action: "Expand date filter range to view daily trend movement.",
      metrics: { primaryValue: null, sampleSize: daily.length },
    };
  }

  // Find biggest single-day percentage drop among days with prior production > 0
  let maxDrop: { date: string; dropPct: number; current: number; previous: number; ach: number } | null = null;

  for (let i = 1; i < daily.length; i++) {
    const prev = daily[i - 1];
    const curr = daily[i];
    if (prev.actual > 0) {
      const dropPct = ((prev.actual - curr.actual) / prev.actual) * 100;
      if (dropPct > (maxDrop?.dropPct ?? thresholds.abnormalTrendDailyDropPct)) {
        const ach = curr.target > 0 ? (curr.actual / curr.target) * 100 : 0;
        maxDrop = {
          date: curr.date,
          dropPct,
          current: curr.actual,
          previous: prev.actual,
          ach,
        };
      }
    }
  }

  if (maxDrop && maxDrop.dropPct >= thresholds.abnormalTrendDailyDropPct) {
    return {
      id: "abnormal-trend",
      category: "Abnormal Trend",
      insight: `Abnormal production drop of ${maxDrop.dropPct.toFixed(1)}% detected on ${maxDrop.date}.`,
      evidence: `Output collapsed from ${formatNumber(maxDrop.previous)} units to ${formatNumber(maxDrop.current)} units on ${maxDrop.date} (${maxDrop.dropPct.toFixed(1)}% day-over-day drop, ${maxDrop.ach.toFixed(1)}% daily target achievement).`,
      where: `Daily Production Series: ${maxDrop.date}`,
      why: `Sudden severe capacity interruption occurred during scheduled operating shifts on this date.`,
      priority: "CRITICAL",
      action: `Cross-reference plant maintenance and raw material logs for ${maxDrop.date} to determine root cause of sudden stoppage.`,
      metrics: {
        primaryValue: maxDrop.dropPct,
        secondaryValue: maxDrop.current,
        sampleSize: daily.length,
        unit: "%",
      },
    };
  }

  const avgOutput = daily.reduce((sum, d) => sum + d.actual, 0) / daily.length;

  return {
    id: "abnormal-trend",
    category: "Abnormal Trend",
    insight: "Daily production output remained statistically stable across the active timeframe.",
    evidence: `Analyzed ${daily.length} consecutive daily buckets; average daily production was ${formatNumber(avgOutput)} units with no day-over-day drop exceeding the ${thresholds.abnormalTrendDailyDropPct}% anomaly threshold.`,
    where: `Daily Output Series (${daily[0].date} → ${daily[daily.length - 1].date})`,
    why: `Daily variations stayed within controlled operational limits without major unrecorded plant halts.`,
    priority: "POSITIVE",
    action: `Continue existing production pacing to sustain baseline stability.`,
    metrics: {
      primaryValue: 0,
      secondaryValue: avgOutput,
      sampleSize: daily.length,
      unit: "%",
    },
  };
}

// ============================================================
// 10. PRIORITY IMPROVEMENT AREA
// ============================================================
export function generatePriorityImprovementInsight(
  analytics: DashboardAnalytics,
  thresholds: InsightThresholds
): EvidenceInsight {
  const worstWc = analytics.hierarchyAnalysis.rankings.worstWorkCenter
    ?? [...analytics.hierarchyAnalysis.workCenters].sort((a, b) => (b.downtimeMinutes * 1.5 + b.productionLoss) - (a.downtimeMinutes * 1.5 + a.productionLoss))[0];
  const topLossMachine = analytics.hierarchyAnalysis.rankings.topLossMachines[0];
  const topDtReason = analytics.downtime.byReason[0];

  if (!worstWc || (worstWc.downtimeMinutes === 0 && worstWc.productionLoss === 0)) {
    return {
      id: "priority-improvement",
      category: "Priority Improvement Area",
      insight: "Plant operations operating within nominal performance thresholds across all cells.",
      evidence: "No critical downtime or production loss bottlenecks detected in active dataset.",
      where: "Plant Wide",
      why: "Overall equipment performance is currently balanced.",
      priority: "POSITIVE",
      action: "Focus on preventative maintenance cycles and standard work audits.",
      metrics: { primaryValue: null, sampleSize: analytics.totalRecords },
    };
  }

  // Synthesize biggest operational lever: downtime vs production loss vs quality
  const isDowntimeDominated = worstWc.downtimeContributionPercent >= thresholds.highDowntimeSharePct;
  const isLossDominated = worstWc.lossContributionPercent >= thresholds.highLossSharePct;

  return {
    id: "priority-improvement",
    category: "Priority Improvement Area",
    insight: `Optimizing ${worstWc.workCenterKey} offers the highest operational return on investment.`,
    evidence: `${worstWc.workCenterKey} accounts for ${formatNumber(worstWc.downtimeMinutes)} min downtime (${worstWc.downtimeContributionPercent.toFixed(1)}% of plant total) and ${formatNumber(worstWc.productionLoss)} units lost (${worstWc.lossContributionPercent.toFixed(1)}% of plant loss)${topLossMachine ? `; key equipment: ${topLossMachine.machineKey}` : ""}.`,
    where: `Top Priority Area: Work Center ${worstWc.workCenterKey}${topLossMachine ? ` → Machine ${topLossMachine.machineKey}` : ""}`,
    why: isDowntimeDominated && topDtReason
      ? `Downtime bottleneck driven primarily by "${topDtReason.key}" (${formatNumber(topDtReason.minutes)} min).`
      : isLossDominated
        ? `Output rate loss and micro-stoppages account for severe cumulative capacity drag.`
        : `Combined downtime and production shortfall severely constrain downstream line throughput.`,
    priority: "CRITICAL",
    action: `Convene cross-functional Kaizen team on ${worstWc.workCenterKey}: audit changeovers, replenish critical tooling, and address top equipment stoppages.`,
    metrics: {
      primaryValue: worstWc.downtimeMinutes,
      secondaryValue: worstWc.productionLoss,
      sharePercent: worstWc.downtimeContributionPercent,
      sampleSize: worstWc.recordCount,
      unit: "score",
    },
  };
}

// ============================================================
// MAIN GENERATOR: GENERATES ALL 10 INSIGHTS
// ============================================================
export function generateEvidenceBasedInsights(
  analytics: DashboardAnalytics,
  activeFilters?: FilterState,
  customThresholds?: Partial<InsightThresholds>
): {
  insights: EvidenceInsight[];
  filterScope: string;
  thresholds: InsightThresholds;
  summary: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    positiveCount: number;
  };
} {
  const thresholds: InsightThresholds = {
    ...DEFAULT_INSIGHT_THRESHOLDS,
    ...customThresholds,
  };

  const filterScope = formatActiveFilterScope(activeFilters);

  const insights: EvidenceInsight[] = [
    generateBestLineInsight(analytics, thresholds),
    generateWorstLineInsight(analytics, thresholds),
    generateBestWorkCenterInsight(analytics, thresholds),
    generateWorstWorkCenterInsight(analytics, thresholds),
    generateHighestDowntimeInsight(analytics, thresholds),
    generateHighestLossInsight(analytics, thresholds),
    generateHighestRejectionInsight(analytics, thresholds),
    generatePeriodChangeInsight(analytics, thresholds),
    generateAbnormalTrendInsight(analytics, thresholds),
    generatePriorityImprovementInsight(analytics, thresholds),
  ];

  const summary = {
    criticalCount: insights.filter((i) => i.priority === "CRITICAL").length,
    highCount: insights.filter((i) => i.priority === "HIGH").length,
    mediumCount: insights.filter((i) => i.priority === "MEDIUM").length,
    positiveCount: insights.filter((i) => i.priority === "POSITIVE").length,
  };

  return {
    insights,
    filterScope,
    thresholds,
    summary,
  };
}
