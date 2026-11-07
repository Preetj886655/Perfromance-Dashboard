/**
 * useDashboardAnalytics Hook
 *
 * Shared analytics computation for carousel slides. Wraps the existing
 * calculation engine (productionKpis / downtimeAnalysis / qualityAnalysis /
 * oeeCalculator / manufacturingAnalysis) and adds the group-level breakdowns
 * (line, shift, stage, work center) the slides need.
 *
 * All expensive calculations are memoized to avoid recomputation across slides.
 */

import { useMemo } from "react";
import {
  calculateDowntimeAnalysis,
  type DowntimeAnalysis,
  type DowntimePoint,
} from "../../../data/calculations/downtimeAnalysis";
import { calculateOeeSummary, type OeeSummary } from "../../../data/calculations/oeeCalculator";
import { calculateProductionKpis, type ProductionKpis } from "../../../data/calculations/productionKpis";
import { calculateQualityAnalysis, type QualityAnalysis } from "../../../data/calculations/qualityAnalysis";
import {
  calculateManufacturingAnalysis,
  type ManufacturingAnalysis,
} from "../../../data/calculations/manufacturingAnalysis";
import {
  type PeriodWindow,
  type PeriodComparison,
  type TrendDataPoint,
  comparePeriods,
  buildGranularTrendSeries,
  type PeriodTargetActualPoint,
  buildMonthlyTargetActualSeries,
  buildWeeklyTargetActualSeries,
  buildQuarterlyTargetActualSeries,
  buildYearlyTargetActualSeries,
} from "../../../data/calculations/periodEngine";
import {
  calculateHierarchyAnalysis,
  type HierarchyAnalysis,
} from "../../../data/calculations/hierarchyEngine";
import type { DprRecord } from "../../../data/normalization/normalizeDprData";

/** Aggregated per-group statistics used by performance / work-center slides. */
export type GroupStat = {
  key: string;
  production: number;
  target: number;
  downtime: number;
  rejection: number;
  productionLoss: number;
  achievement: number | null;
};

export type DashboardAnalytics = {
  productionKpis: ProductionKpis;
  downtime: DowntimeAnalysis;
  quality: QualityAnalysis;
  oeeSummary: OeeSummary;
  manufacturing: ManufacturingAnalysis;
  dailySeries: Array<{ date: string; actual: number; target: number }>;
  downtimeDailySeries: Array<{ date: string; minutes: number }>;
  byLine: GroupStat[];
  byShift: GroupStat[];
  byStage: GroupStat[];
  byMaterial: GroupStat[];
  byWorkCenter: GroupStat[];
    downtimeByWorkCenter: DowntimePoint[];
  downtimeByStage: DowntimePoint[];
  downtimeByLine: DowntimePoint[];
  downtimeByShift: DowntimePoint[];
  lossByWorkCenter: DowntimePoint[];
  lossByStage: DowntimePoint[];
  lossByLine: DowntimePoint[];
  lossByShift: DowntimePoint[];
  lossByMachine: DowntimePoint[];
  lossByMaterial: DowntimePoint[];
  lossDailySeries: Array<{ date: string; loss: number }>;
  productionByMachine: Array<{ key: string; value: number }>;
  totalProductionLoss: number;
  totalRecords: number;
  dateRange: { start: string; end: string };
  periodWindow?: PeriodWindow;
  previousRecordsCount: number;
  periodComparison: PeriodComparison;
  granularTrendSeries: TrendDataPoint[];
  monthlyTargetActual: PeriodTargetActualPoint[];
  weeklyTargetActual: PeriodTargetActualPoint[];
  quarterlyTargetActual: PeriodTargetActualPoint[];
  yearlyTargetActual: PeriodTargetActualPoint[];
  hierarchyAnalysis: HierarchyAnalysis;
};

/** Row-level production target (target/hr × hours), mirroring productionKpis logic. */
function rowTarget(row: DprRecord): number {
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

/** Row-level total downtime (planned + unplanned). */
function rowDowntime(row: DprRecord): number {
  const planned = typeof row.plannedDownTimeMinutes === "number" && Number.isFinite(row.plannedDownTimeMinutes) ? row.plannedDownTimeMinutes : 0;
  const unplanned = typeof row.totalIdleTimeMinutes === "number" && Number.isFinite(row.totalIdleTimeMinutes) ? row.totalIdleTimeMinutes : 0;
  return planned + unplanned;
}

function buildDailySeries(records: DprRecord[]) {
  const byDate = new Map<string, { actual: number; target: number }>();
  for (const row of records) {
    if (!row.date) continue;
    const entry = byDate.get(row.date) ?? { actual: 0, target: 0 };
    entry.actual += row.actualProductionQty ?? 0;
    entry.target += rowTarget(row);
    byDate.set(row.date, entry);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, actual: data.actual, target: data.target }));
}


function buildDowntimeDailySeries(records: DprRecord[]) {
  const byDate = new Map<string, number>();
  for (const row of records) {
    if (!row.date) continue;
    const minutes = rowDowntime(row);
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + minutes);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, minutes]) => ({ date, minutes }));
}


/** Row-level production loss (Prod Loss NOS). */
function rowProductionLoss(row: DprRecord): number {
  const value = row.productionLoss;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}


/** Daily production-loss trend (NOS). */
function buildLossDailySeries(records: DprRecord[]) {
  const byDate = new Map<string, number>();
  for (const row of records) {
    if (!row.date) continue;
    const loss = rowProductionLoss(row);
    if (!Number.isFinite(loss) || loss <= 0) continue;
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + loss);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, loss]) => ({ date, loss }));
}

export function useDashboardAnalytics(
  records: DprRecord[],
  previousRecords: DprRecord[] = [],
  periodWindow?: PeriodWindow
): DashboardAnalytics {
  const productionKpis = useMemo(() => calculateProductionKpis(records), [records]);
  const downtime = useMemo(() => calculateDowntimeAnalysis(records), [records]);
  const quality = useMemo(() => calculateQualityAnalysis(records), [records]);
  const oeeSummary = useMemo(() => calculateOeeSummary(records), [records]);
  const manufacturing = useMemo(() => calculateManufacturingAnalysis(records), [records]);

  const trendGranularity = periodWindow?.trendGranularity ?? "monthly";
  const granularTrendSeries = useMemo(
    () => buildGranularTrendSeries(records, trendGranularity),
    [records, trendGranularity]
  );

  const dailySeries = useMemo(() => {
    if (granularTrendSeries.length > 0) {
      return granularTrendSeries.map((d) => ({
        date: d.label,
        actual: d.production,
        target: d.target,
      }));
    }
    return buildDailySeries(records);
  }, [records, granularTrendSeries]);

  const downtimeDailySeries = useMemo(() => {
    if (granularTrendSeries.length > 0) {
      return granularTrendSeries.map((d) => ({
        date: d.label,
        minutes: d.downtime,
      }));
    }
    return buildDowntimeDailySeries(records);
  }, [records, granularTrendSeries]);

  const lossDailySeries = useMemo(() => {
    if (granularTrendSeries.length > 0) {
      return granularTrendSeries.map((d) => ({
        date: d.label,
        loss: d.productionLoss,
      }));
    }
    return buildLossDailySeries(records);
  }, [records, granularTrendSeries]);

  // Single-pass unified aggregations over records to slash execution time
  const unifiedBreakdowns = useMemo(() => {
    const lineBuckets = new Map<string, GroupStat>();
    const shiftBuckets = new Map<string, GroupStat>();
    const stageBuckets = new Map<string, GroupStat>();
    const materialBuckets = new Map<string, GroupStat>();
    const wcBuckets = new Map<string, GroupStat>();

    const dtWc = new Map<string, number>();
    const dtStage = new Map<string, number>();
    const dtLine = new Map<string, number>();
    const dtShift = new Map<string, number>();

    const lossWc = new Map<string, number>();
    const lossStage = new Map<string, number>();
    const lossLine = new Map<string, number>();
    const lossShift = new Map<string, number>();
    const lossMachine = new Map<string, number>();
    const lossMaterial = new Map<string, number>();

    let totalLoss = 0;
    let minDate = "";
    let maxDate = "";

    const addGroup = (buckets: Map<string, GroupStat>, rawKey: string | undefined, prod: number, tgt: number, dt: number, rej: number, loss: number) => {
      const key = rawKey?.trim();
      if (!key) return;
      let entry = buckets.get(key);
      if (!entry) {
        entry = { key, production: 0, target: 0, downtime: 0, rejection: 0, productionLoss: 0, achievement: null };
        buckets.set(key, entry);
      }
      entry.production += prod;
      entry.target += tgt;
      entry.downtime += dt;
      entry.rejection += rej;
      entry.productionLoss += loss;
    };

    const addPoint = (buckets: Map<string, number>, rawKey: string | undefined, val: number) => {
      const key = rawKey?.trim();
      if (!key || !Number.isFinite(val) || val <= 0) return;
      buckets.set(key, (buckets.get(key) ?? 0) + val);
    };

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const prod = row.actualProductionQty ?? 0;
      const tgt = rowTarget(row);
      const dt = rowDowntime(row);
      const rej = row.totalRejectionQty ?? 0;
      const loss = typeof row.productionLoss === "number" && Number.isFinite(row.productionLoss) ? row.productionLoss : 0;

      if (loss > 0) totalLoss += loss;

      if (row.date) {
        if (!minDate || row.date < minDate) minDate = row.date;
        if (!maxDate || row.date > maxDate) maxDate = row.date;
      }

      addGroup(lineBuckets, row.lineName, prod, tgt, dt, rej, loss);
      addGroup(shiftBuckets, row.shift, prod, tgt, dt, rej, loss);
      addGroup(stageBuckets, row.rawStage, prod, tgt, dt, rej, loss);
      addGroup(materialBuckets, row.material, prod, tgt, dt, rej, loss);
      addGroup(wcBuckets, row.workCenter, prod, tgt, dt, rej, loss);

      addPoint(dtWc, row.workCenter, dt);
      addPoint(dtStage, row.rawStage, dt);
      addPoint(dtLine, row.lineName, dt);
      addPoint(dtShift, row.shift, dt);

      addPoint(lossWc, row.workCenter, loss);
      addPoint(lossStage, row.rawStage, loss);
      addPoint(lossLine, row.lineName, loss);
      addPoint(lossShift, row.shift, loss);
      addPoint(lossMachine, row.machineName || row.machineNo, loss);
      addPoint(lossMaterial, row.material, loss);
    }

    const finalizeGroup = (buckets: Map<string, GroupStat>): GroupStat[] =>
      [...buckets.values()].map((e) => ({
        ...e,
        achievement: e.target > 0 ? (e.production / e.target) * 100 : null,
      }));

    const finalizePoints = (buckets: Map<string, number>): DowntimePoint[] =>
      [...buckets.entries()]
        .map(([key, minutes]) => ({ key, minutes }))
        .sort((a, b) => b.minutes - a.minutes);

    return {
      byLine: finalizeGroup(lineBuckets),
      byShift: finalizeGroup(shiftBuckets),
      byStage: finalizeGroup(stageBuckets),
      byMaterial: finalizeGroup(materialBuckets),
      byWorkCenter: finalizeGroup(wcBuckets),
      downtimeByWorkCenter: finalizePoints(dtWc),
      downtimeByStage: finalizePoints(dtStage),
      downtimeByLine: finalizePoints(dtLine),
      downtimeByShift: finalizePoints(dtShift),
      lossByWorkCenter: finalizePoints(lossWc),
      lossByStage: finalizePoints(lossStage),
      lossByLine: finalizePoints(lossLine),
      lossByShift: finalizePoints(lossShift),
      lossByMachine: finalizePoints(lossMachine),
      lossByMaterial: finalizePoints(lossMaterial),
      totalProductionLoss: totalLoss,
      dateRange: { start: minDate, end: maxDate },
    };
  }, [records]);

  const {
    byLine,
    byShift,
    byStage,
    byMaterial,
    byWorkCenter,
    downtimeByWorkCenter,
    downtimeByStage,
    downtimeByLine,
    downtimeByShift,
    lossByWorkCenter,
    lossByStage,
    lossByLine,
    lossByShift,
    lossByMachine,
    lossByMaterial,
    totalProductionLoss,
    dateRange,
  } = unifiedBreakdowns;

  const periodComparison = useMemo(
    () => comparePeriods(records, previousRecords),
    [records, previousRecords]
  );

  const hierarchyAnalysis = useMemo(
    () => calculateHierarchyAnalysis(records),
    [records]
  );

  // Target vs Actual period series — one per aggregation grain, all from the
  // same filtered record set so the four charts stay perfectly consistent.
  const monthlyTargetActual = useMemo(
    () => buildMonthlyTargetActualSeries(records, dateRange),
    [records, dateRange]
  );
  const weeklyTargetActual = useMemo(
    () => buildWeeklyTargetActualSeries(records, dateRange),
    [records, dateRange]
  );
  const quarterlyTargetActual = useMemo(
    () => buildQuarterlyTargetActualSeries(records, dateRange),
    [records, dateRange]
  );
  const yearlyTargetActual = useMemo(
    () => buildYearlyTargetActualSeries(records, dateRange),
    [records, dateRange]
  );

  // Memoize the aggregate object so slide elements are not rebuilt on every render.
  return useMemo(
    () => ({
      productionKpis,
      downtime,
      quality,
      oeeSummary,
      manufacturing,
      dailySeries,
      downtimeDailySeries,
      byLine,
      byShift,
      byStage,
      byMaterial,
      byWorkCenter,
      downtimeByWorkCenter,
      downtimeByStage,
      downtimeByLine,
      downtimeByShift,
      lossByWorkCenter,
      lossByStage,
      lossByLine,
      lossByShift,
      lossByMachine,
      lossByMaterial,
      lossDailySeries,
      productionByMachine: manufacturing.productionByMachine,
      totalProductionLoss,
      totalRecords: records.length,
      dateRange,
      periodWindow,
      previousRecordsCount: previousRecords.length,
      periodComparison,
      granularTrendSeries,
      monthlyTargetActual,
      weeklyTargetActual,
      quarterlyTargetActual,
      yearlyTargetActual,
      hierarchyAnalysis,
    }),
    [
      productionKpis,
      downtime,
      quality,
      oeeSummary,
      manufacturing,
      dailySeries,
      downtimeDailySeries,
      byLine,
      byShift,
      byStage,
      byMaterial,
      byWorkCenter,
      downtimeByWorkCenter,
      downtimeByStage,
      downtimeByLine,
      downtimeByShift,
      lossByWorkCenter,
      lossByStage,
      lossByLine,
      lossByShift,
      lossByMachine,
      lossByMaterial,
      lossDailySeries,
      totalProductionLoss,
      records,
      dateRange,
      periodWindow,
      previousRecords.length,
      periodComparison,
      granularTrendSeries,
      monthlyTargetActual,
      weeklyTargetActual,
      quarterlyTargetActual,
      yearlyTargetActual,
      hierarchyAnalysis,
    ]
  );
}
