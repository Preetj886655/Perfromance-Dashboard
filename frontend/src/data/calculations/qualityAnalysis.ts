import type { DprRecord } from "../normalization/normalizeDprData";

export type QualityPoint = {
  key: string;
  value: number;
};

export type QualityAnalysis = {
  totalRejection: number;
  rejectionRatePercent: number | null;
  rejectionPpmAverage: number | null;
  byMachine: QualityPoint[];
  byPart: QualityPoint[];
  byShift: QualityPoint[];
  byReason: QualityPoint[];
};

export function calculateQualityAnalysis(records: DprRecord[]): QualityAnalysis {
  const totalProduction = records.reduce((sumValue, row) => sumValue + (row.actualProductionQty ?? 0), 0);
  const totalRejection = records.reduce((sumValue, row) => sumValue + (row.totalRejectionQty ?? 0), 0);

  return {
    totalRejection,
    rejectionRatePercent: totalProduction > 0 ? (totalRejection / totalProduction) * 100 : null,
    rejectionPpmAverage: average(records.map((row) => row.rejectionPpm)),
    byMachine: aggregate(records, (row) => row.machineName || row.machineNo || "Unknown", (row) => row.totalRejectionQty ?? 0),
    byPart: aggregate(records, (row) => row.partName || row.partNo || "Unknown", (row) => row.totalRejectionQty ?? 0),
    byShift: aggregate(records, (row) => row.shift || "Unknown", (row) => row.totalRejectionQty ?? 0),
    byReason: aggregate(records, (row) => row.rejectionReason || "Unspecified", (row) => row.totalRejectionQty ?? 0),
  };
}

function aggregate(
  records: DprRecord[],
  keySelector: (row: DprRecord) => string,
  valueSelector: (row: DprRecord) => number
): QualityPoint[] {
  const bucket = new Map<string, number>();
  records.forEach((row) => {
    const key = keySelector(row);
    const current = bucket.get(key) ?? 0;
    const value = valueSelector(row);
    if (Number.isFinite(value) && value > 0) {
      bucket.set(key, current + value);
    }
  });

  return [...bucket.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

function average(values: Array<number | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sumValue, value) => sumValue + value, 0) / valid.length;
}
