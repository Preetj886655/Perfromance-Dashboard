import type { DprRecord } from "../normalization/normalizeDprData";

export type ProductionKpis = {
  totalProduction: number;
  totalTargetProduction: number;
  productionAchievementPercent: number | null;
  totalRejection: number;
  rejectionRatePercent: number | null;
  totalDowntimeMinutes: number;
  goodQuantity: number;
  machineUtilizationPercent: number | null;
};

export function calculateProductionKpis(records: DprRecord[]): ProductionKpis {
  const totalProduction = sum(records, (row) => row.actualProductionQty);

  // Deterministic target aggregation:
  // target/hr multiplied by production hours from each row (falls back to available time in hours).
  const totalTargetProduction = records.reduce((sumValue, row) => {
    if (!isFiniteNumber(row.targetQtyPerHour)) return sumValue;
    const hourFactor = isFiniteNumber(row.productionHour)
      ? row.productionHour
      : isFiniteNumber(row.availableTimeMinutes)
        ? row.availableTimeMinutes / 60
        : 1;
    return sumValue + row.targetQtyPerHour * hourFactor;
  }, 0);

  const totalRejection = sum(records, (row) => row.totalRejectionQty);
  const plannedDown = sum(records, (row) => row.plannedDownTimeMinutes);
  const unplannedDown = sum(records, (row) => row.totalIdleTimeMinutes);
  const totalDowntimeMinutes = plannedDown + unplannedDown;

  const goodQuantity = Math.max(0, totalProduction - totalRejection);

  const productionAchievementPercent =
    totalTargetProduction > 0 ? (totalProduction / totalTargetProduction) * 100 : null;

  const rejectionRatePercent = totalProduction > 0 ? (totalRejection / totalProduction) * 100 : null;

  const machineUtilizationRatio = average(records, (row) => row.machineUtilizationRatio);

  return {
    totalProduction,
    totalTargetProduction,
    productionAchievementPercent,
    totalRejection,
    rejectionRatePercent,
    totalDowntimeMinutes,
    goodQuantity,
    machineUtilizationPercent: machineUtilizationRatio === null ? null : machineUtilizationRatio * 100,
  };
}

function sum(records: DprRecord[], selector: (row: DprRecord) => number | undefined): number {
  return records.reduce((sumValue, row) => {
    const value = selector(row);
    return isFiniteNumber(value) ? sumValue + value : sumValue;
  }, 0);
}

function average(records: DprRecord[], selector: (row: DprRecord) => number | undefined): number | null {
  let total = 0;
  let count = 0;

  records.forEach((row) => {
    const value = selector(row);
    if (isFiniteNumber(value)) {
      total += value;
      count += 1;
    }
  });

  return count > 0 ? total / count : null;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
