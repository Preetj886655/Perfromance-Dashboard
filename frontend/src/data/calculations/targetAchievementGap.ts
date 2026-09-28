/**
 * Target / Achievement / Gap Analysis Calculation Engine
 *
 * Implements deterministic business logic for:
 * 1. Target = sum of production target
 * 2. Achieved = sum of actual production
 * 3. Yet to Achieve = MAX(Target - Achieved, 0) (never negative)
 * 4. Achievement % = Target > 0 ? (Achieved / Target) * 100 : 0 (can exceed 100%)
 *
 * Reuses existing period series builders from `periodEngine.ts`.
 */

import type { DprRecord } from "../normalization/normalizeDprData";
import {
  buildMonthlyTargetActualSeries,
  buildWeeklyTargetActualSeries,
  buildQuarterlyTargetActualSeries,
  buildYearlyTargetActualSeries,
  type PeriodTargetActualPoint,
} from "./periodEngine";

export type TargetAchievementGapPoint = {
  periodKey: string;
  label: string;
  target: number;
  achieved: number;
  gap: number;
  achievementPct: number;
};

export type TargetAchievementGapSummary = {
  totalTarget: number;
  totalAchieved: number;
  yetToAchieve: number;
  achievementPct: number;
  remainingPct: number;
  averageAchievement: number;
  series: TargetAchievementGapPoint[];
};

/**
 * Pure calculation helper for single-value calculations and unit tests.
 */
export function calculateGapAndAchievement(
  target: number,
  achieved: number
): {
  gap: number;
  achievementPct: number;
} {
  const validTarget = typeof target === "number" && Number.isFinite(target) ? target : 0;
  const validAchieved = typeof achieved === "number" && Number.isFinite(achieved) ? achieved : 0;

  const gap = Math.max(validTarget - validAchieved, 0);
  const achievementPct = validTarget > 0 ? (validAchieved / validTarget) * 100 : 0;

  return { gap, achievementPct };
}

/**
 * Builds the Target / Achievement / Gap series for the given records, date range, and period preset.
 * Reuses existing period engine aggregations.
 */
export function calculateTargetAchievementGap(
  records: DprRecord[],
  dateRange: { start: string; end: string },
  period: "monthly" | "weekly" | "quarterly" | "yearly" | string
): TargetAchievementGapSummary {
  let baseSeries: PeriodTargetActualPoint[] = [];

  const normalizedPeriod = (period || "monthly").toLowerCase();
  if (normalizedPeriod === "weekly") {
    baseSeries = buildWeeklyTargetActualSeries(records, dateRange);
  } else if (normalizedPeriod === "quarterly") {
    baseSeries = buildQuarterlyTargetActualSeries(records, dateRange);
  } else if (normalizedPeriod === "yearly") {
    baseSeries = buildYearlyTargetActualSeries(records, dateRange);
  } else {
    // Default to monthly
    baseSeries = buildMonthlyTargetActualSeries(records, dateRange);
  }

  const series: TargetAchievementGapPoint[] = baseSeries.map((pt) => {
    const target = typeof pt.target === "number" && Number.isFinite(pt.target) ? pt.target : 0;
    const achieved = typeof pt.actual === "number" && Number.isFinite(pt.actual) ? pt.actual : 0;
    const { gap, achievementPct } = calculateGapAndAchievement(target, achieved);

    return {
      periodKey: pt.periodKey,
      label: pt.label,
      target,
      achieved,
      gap,
      achievementPct,
    };
  });

  const totalTarget = series.reduce((sum, item) => sum + item.target, 0);
  const totalAchieved = series.reduce((sum, item) => sum + item.achieved, 0);
  const yetToAchieve = Math.max(totalTarget - totalAchieved, 0);
  const achievementPct = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;
  const remainingPct = totalTarget > 0 ? (yetToAchieve / totalTarget) * 100 : 0;
  const averageAchievement = series.length > 0 ? totalAchieved / series.length : 0;

  return {
    totalTarget,
    totalAchieved,
    yetToAchieve,
    achievementPct,
    remainingPct,
    averageAchievement,
    series,
  };
}

