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

/** Aggregate records into GroupStat buckets for a given dimension. */
function buildGroupStats(records: DprRecord[], keySelector: (row: DprRecord) => string | undefined): GroupStat[] {
  const buckets = new Map<string, GroupStat>();
  records.forEach((row) => {
    const key = keySelector(row)?.trim();
    if (!key) return;
    const entry = buckets.get(key) ?? { key, production: 0, target: 0, downtime: 0, rejection: 0, productionLoss: 0, achievement: null };
    entry.production += row.actualProductionQty ?? 0;
    entry.target += rowTarget(row);
    entry.downtime += rowDowntime(row);
    entry.rejection += row.totalRejectionQty ?? 0;
    entry.productionLoss += typeof row.productionLoss === "number" && Number.isFinite(row.productionLoss) ? row.productionLoss : 0;
    buckets.set(key, entry);
  });
  return [...buckets.values()].map((entry) => ({
    ...entry,
    achievement: entry.target > 0 ? (entry.production / entry.target) * 100 : null,
  }));
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

/** Downtime (minutes) aggregated by an arbitrary dimension. */
function buildDowntimePoints(records: DprRecord[], keySelector: (row: DprRecord) => string | undefined): DowntimePoint[] {
  const buckets = new Map<string, number>();
  records.forEach((row) => {
    const key = keySelector(row)?.trim();
    if (!key) return;
    const minutes = rowDowntime(row);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    buckets.set(key, (buckets.get(key) ?? 0) + minutes);
  });
    return [...buckets.entries()]
    .map(([key, minutes]) => ({ key, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** Row-level production loss (Prod Loss NOS). */
function rowProductionLoss(row: DprRecord): number {
  const value = row.productionLoss;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Production loss (NOS) aggregated by an arbitrary dimension. */
function buildProductionLossPoints(
  records: DprRecord[],
  keySelector: (row: DprRecord) => string | undefined
): DowntimePoint[] {
  const buckets = new Map<string, number>();
  records.forEach((row) => {
    const key = keySelector(row)?.trim();
    if (!key) return;
    const loss = rowProductionLoss(row);
    if (!Number.isFinite(loss) || loss <= 0) return;
    buckets.set(key, (buckets.get(key) ?? 0) + loss);
  });
  return [...buckets.entries()]
    .map(([key, minutes]) => ({ key, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
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

export function useDashboardAnalytics(records: DprRecord[]): DashboardAnalytics {
  const productionKpis = useMemo(() => calculateProductionKpis(records), [records]);
  const downtime = useMemo(() => calculateDowntimeAnalysis(records), [records]);
  const quality = useMemo(() => calculateQualityAnalysis(records), [records]);
  const oeeSummary = useMemo(() => calculateOeeSummary(records), [records]);
  const manufacturing = useMemo(() => calculateManufacturingAnalysis(records), [records]);
  const dailySeries = useMemo(() => buildDailySeries(records), [records]);
  const downtimeDailySeries = useMemo(() => buildDowntimeDailySeries(records), [records]);
  const byLine = useMemo(() => buildGroupStats(records, (row) => row.lineName), [records]);
  const byShift = useMemo(() => buildGroupStats(records, (row) => row.shift), [records]);
  const byStage = useMemo(() => buildGroupStats(records, (row) => row.rawStage), [records]);
  const byMaterial = useMemo(() => buildGroupStats(records, (row) => row.material), [records]);
  const byWorkCenter = useMemo(() => buildGroupStats(records, (row) => row.workCenter), [records]);
  const downtimeByWorkCenter = useMemo(() => buildDowntimePoints(records, (row) => row.workCenter), [records]);
    const downtimeByStage = useMemo(() => buildDowntimePoints(records, (row) => row.rawStage), [records]);
  const downtimeByLine = useMemo(() => buildDowntimePoints(records, (row) => row.lineName), [records]);
  const downtimeByShift = useMemo(() => buildDowntimePoints(records, (row) => row.shift), [records]);
  const lossByWorkCenter = useMemo(() => buildProductionLossPoints(records, (row) => row.workCenter), [records]);
  const lossByStage = useMemo(() => buildProductionLossPoints(records, (row) => row.rawStage), [records]);
  const lossByLine = useMemo(() => buildProductionLossPoints(records, (row) => row.lineName), [records]);
  const lossByShift = useMemo(() => buildProductionLossPoints(records, (row) => row.shift), [records]);
  const lossByMachine = useMemo(() => buildProductionLossPoints(records, (row) => row.machineName || row.machineNo), [records]);
  const lossByMaterial = useMemo(() => buildProductionLossPoints(records, (row) => row.material), [records]);
  const lossDailySeries = useMemo(() => buildLossDailySeries(records), [records]);
  const totalProductionLoss = useMemo(
    () =>
      records.reduce(
        (sum, row) => (typeof row.productionLoss === "number" && Number.isFinite(row.productionLoss) ? sum + row.productionLoss : sum),
        0
      ),
    [records]
  );

  const dateRange = useMemo(() => {
    let start = "";
    let end = "";
    for (const row of records) {
      if (!row.date) continue;
      if (!start || row.date < start) start = row.date;
      if (!end || row.date > end) end = row.date;
    }
    return { start, end };
  }, [records]);

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
    }),
    [productionKpis, downtime, quality, oeeSummary, manufacturing, dailySeries, downtimeDailySeries, byLine, byShift, byStage, byMaterial, byWorkCenter, downtimeByWorkCenter, downtimeByStage, downtimeByLine, downtimeByShift, lossByWorkCenter, lossByStage, lossByLine, lossByShift, lossByMachine, lossByMaterial, lossDailySeries, totalProductionLoss, records, dateRange]
  );
}
