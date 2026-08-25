import type { DprRecord } from "../normalization/normalizeDprData";

export type AnalysisPoint = { key: string; value: number };
export type ManufacturingAnalysis = {
  daily: Array<{ key: string; production: number; target: number; downtime: number; rejection: number }>;
  productionByMachine: AnalysisPoint[];
  productionByLine: AnalysisPoint[];
  productionByShift: AnalysisPoint[];
  downtimeByLine: AnalysisPoint[];
  rejectionByMachine: AnalysisPoint[];
  averageDowntime: number | null;
  downtimeEvents: number;
  productionTrend: "increasing" | "decreasing" | "stable" | "fluctuating";
  insights: string[];
};

export function calculateManufacturingAnalysis(records: DprRecord[]): ManufacturingAnalysis {
  const dailyMap = new Map<string, { production: number; target: number; downtime: number; rejection: number }>();
  const aggregate = (selector: (row: DprRecord) => string | undefined, value: (row: DprRecord) => number | undefined) => {
    const buckets = new Map<string, number>();
    records.forEach((row) => {
      const key = selector(row);
      const amount = value(row);
      if (!key || !Number.isFinite(amount) || (amount ?? 0) <= 0) return;
      buckets.set(key, (buckets.get(key) ?? 0) + (amount ?? 0));
    });
    return [...buckets.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
  };

  records.forEach((row) => {
    if (!row.date) return;
    const current = dailyMap.get(row.date) ?? { production: 0, target: 0, downtime: 0, rejection: 0 };
    current.production += row.actualProductionQty ?? 0;
    current.target += row.targetProduction ?? 0;
    current.downtime += row.totalIdleTimeMinutes ?? 0;
    current.rejection += row.totalRejectionQty ?? 0;
    dailyMap.set(row.date, current);
  });

  const daily = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => ({ key, ...values }));
  const downtimeValues = records.map((row) => row.totalIdleTimeMinutes).filter((value): value is number => Number.isFinite(value));
  const productionByMachine = aggregate((row) => row.machineName || row.machineNo, (row) => row.actualProductionQty);
  const productionByLine = aggregate((row) => row.lineName, (row) => row.actualProductionQty);
  const productionByShift = aggregate((row) => row.shift, (row) => row.actualProductionQty);
  const downtimeByLine = aggregate((row) => row.lineName, (row) => row.totalIdleTimeMinutes);
  const rejectionByMachine = aggregate((row) => row.machineName || row.machineNo, (row) => row.totalRejectionQty);
  const insights = buildInsights(daily, records, downtimeByLine, productionByShift);

  return {
    daily,
    productionByMachine,
    productionByLine,
    productionByShift,
    downtimeByLine,
    rejectionByMachine,
    averageDowntime: downtimeValues.length ? downtimeValues.reduce((sum, value) => sum + value, 0) / downtimeValues.length : null,
    downtimeEvents: downtimeValues.filter((value) => value > 0).length,
    productionTrend: trend(daily.map((item) => item.production)),
    insights,
  };
}

function buildInsights(
  daily: ManufacturingAnalysis["daily"],
  records: DprRecord[],
  downtimeByLine: AnalysisPoint[],
  productionByShift: AnalysisPoint[]
): string[] {
  const insights: string[] = [];
  const totalDowntime = records.reduce((sum, row) => sum + (row.totalIdleTimeMinutes ?? 0), 0);
  const topReason = aggregateReasons(records);
  if (topReason && totalDowntime > 0) insights.push(`${topReason.key} accounts for ${((topReason.value / totalDowntime) * 100).toFixed(1)}% of recorded downtime.`);
  if (downtimeByLine[0] && totalDowntime > 0) insights.push(`${downtimeByLine[0].key} is associated with ${((downtimeByLine[0].value / totalDowntime) * 100).toFixed(1)}% of line-level downtime.`);
  if (productionByShift[0]) insights.push(`${productionByShift[0].key} has the highest recorded production among shifts.`);
  if (daily.length > 1) insights.push(`Production shows a ${trend(daily.map((item) => item.production))} trend across the available dates.`);
  return insights.length ? insights : ["Insufficient data to determine a manufacturing performance pattern."];
}

function aggregateReasons(records: DprRecord[]): AnalysisPoint | null {
  const buckets = new Map<string, number>();
  records.forEach((row) => {
    if (!row.idleReason || !row.totalIdleTimeMinutes) return;
    buckets.set(row.idleReason, (buckets.get(row.idleReason) ?? 0) + row.totalIdleTimeMinutes);
  });
  const top = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? { key: top[0], value: top[1] } : null;
}

function trend(values: number[]): ManufacturingAnalysis["productionTrend"] {
  if (values.length < 2) return "stable";
  const midpoint = Math.floor(values.length / 2);
  const first = average(values.slice(0, midpoint));
  const second = average(values.slice(midpoint));
  if (!first || !second) return "stable";
  const change = ((second - first) / first) * 100;
  if (Math.abs(change) < 5) return "stable";
  if (values.some((value, index) => index > 0 && Math.sign(value - values[index - 1]) !== Math.sign(second - first))) return "fluctuating";
  return change > 0 ? "increasing" : "decreasing";
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
