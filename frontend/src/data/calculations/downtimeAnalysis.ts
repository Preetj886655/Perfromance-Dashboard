import type { DprRecord } from "../normalization/normalizeDprData";

export type DowntimePoint = {
  key: string;
  minutes: number;
};

export type DowntimeAnalysis = {
  totalDowntimeMinutes: number;
  byMachine: DowntimePoint[];
  byShift: DowntimePoint[];
  byReason: DowntimePoint[];
};

export function calculateDowntimeAnalysis(records: DprRecord[]): DowntimeAnalysis {
  const byMachine = aggregate(records, (row) => row.machineName || row.machineNo || "Unknown", (row) => totalRowDowntime(row));
  const byShift = aggregate(records, (row) => row.shift || "Unknown", (row) => totalRowDowntime(row));
  const byReason = aggregate(
    records,
    (row) => row.idleReason || "Unspecified",
    (row) => row.totalIdleTimeMinutes ?? 0
  );

  return {
    totalDowntimeMinutes: byMachine.reduce((sumValue, entry) => sumValue + entry.minutes, 0),
    byMachine,
    byShift,
    byReason,
  };
}

function aggregate(
  records: DprRecord[],
  keySelector: (row: DprRecord) => string,
  valueSelector: (row: DprRecord) => number
): DowntimePoint[] {
  const bucket = new Map<string, number>();
  records.forEach((row) => {
    const key = keySelector(row);
    const current = bucket.get(key) ?? 0;
    const increment = valueSelector(row);
    if (Number.isFinite(increment) && increment > 0) {
      bucket.set(key, current + increment);
    }
  });

  return [...bucket.entries()]
    .map(([key, minutes]) => ({ key, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

function totalRowDowntime(row: DprRecord): number {
  const planned = Number.isFinite(row.plannedDownTimeMinutes) ? row.plannedDownTimeMinutes ?? 0 : 0;
  const unplanned = Number.isFinite(row.totalIdleTimeMinutes) ? row.totalIdleTimeMinutes ?? 0 : 0;
  return planned + unplanned;
}
