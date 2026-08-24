import type { DprRecord } from "../normalization/normalizeDprData";

export type OeeValidationWarning = {
  rowIndex: number;
  sourceOeePercent: number;
  calculatedOeePercent: number;
  diffPercent: number;
};

export type OeeSummary = {
  availabilityPercent: number | null;
  performancePercent: number | null;
  qualityPercent: number | null;
  oeePercent: number | null;
  warnings: OeeValidationWarning[];
};

export type OeeGroupResult = {
  key: string;
  totalProduction: number;
  totalTarget: number;
  totalRejection: number;
  totalDowntimeMinutes: number;
  availabilityPercent: number | null;
  performancePercent: number | null;
  qualityPercent: number | null;
  oeePercent: number | null;
};

export function calculateOeeSummary(records: DprRecord[]): OeeSummary {
  const rows = records.map(deriveRowFactors);
  const valid = rows.filter((row) => row.calculatedOeeRatio !== null);

  const availabilityRatio = average(valid.map((row) => row.availabilityRatio));
  const performanceRatio = average(valid.map((row) => row.performanceRatio));
  const qualityRatio = average(valid.map((row) => row.qualityRatio));
  const calculatedOeeRatio = average(valid.map((row) => row.calculatedOeeRatio));

  const warnings: OeeValidationWarning[] = [];
  valid.forEach((row) => {
    if (row.sourceOeeRatio === null || row.calculatedOeeRatio === null) return;
    const diff = Math.abs(row.sourceOeeRatio - row.calculatedOeeRatio) * 100;
    if (diff > 2) {
      warnings.push({
        rowIndex: row.index + 1,
        sourceOeePercent: row.sourceOeeRatio * 100,
        calculatedOeePercent: row.calculatedOeeRatio * 100,
        diffPercent: diff,
      });
    }
  });

  return {
    availabilityPercent: toPercent(availabilityRatio),
    performancePercent: toPercent(performanceRatio),
    qualityPercent: toPercent(qualityRatio),
    oeePercent: toPercent(calculatedOeeRatio),
    warnings,
  };
}

export function calculateMachineOee(records: DprRecord[]): OeeGroupResult[] {
  return groupByKey(records, (row) => row.machineName || row.machineNo || "Unknown Machine");
}

export function calculateShiftOee(records: DprRecord[]): OeeGroupResult[] {
  return groupByKey(records, (row) => row.shift || "Unknown Shift");
}

function groupByKey(records: DprRecord[], keySelector: (row: DprRecord) => string): OeeGroupResult[] {
  const grouped = new Map<string, DprRecord[]>();
  records.forEach((row) => {
    const key = keySelector(row);
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  });

  return [...grouped.entries()]
    .map(([key, rows]) => {
      const weighted = weightedByProduction(rows);
      const totalProduction = sum(rows.map((row) => row.actualProductionQty));
      const totalTarget = rows.reduce((sumValue, row) => {
        if (!isFiniteNumber(row.targetQtyPerHour)) return sumValue;
        const hourFactor = isFiniteNumber(row.productionHour)
          ? row.productionHour
          : isFiniteNumber(row.availableTimeMinutes)
            ? row.availableTimeMinutes / 60
            : 1;
        return sumValue + row.targetQtyPerHour * hourFactor;
      }, 0);
      const totalRejection = sum(rows.map((row) => row.totalRejectionQty));
      const totalDowntimeMinutes = sum(rows.map((row) => row.totalIdleTimeMinutes)) + sum(rows.map((row) => row.plannedDownTimeMinutes));

      return {
        key,
        totalProduction,
        totalTarget,
        totalRejection,
        totalDowntimeMinutes,
        availabilityPercent: toPercent(weighted.availabilityRatio),
        performancePercent: toPercent(weighted.performanceRatio),
        qualityPercent: toPercent(weighted.qualityRatio),
        oeePercent: toPercent(weighted.oeeRatio),
      };
    })
    .sort((a, b) => b.totalProduction - a.totalProduction);
}

function deriveRowFactors(row: DprRecord) {
  const availabilityRatio =
    safeRatio(row.availableTimeMinutes, row.shiftTimeMinutes) ??
    row.availabilityRatio ??
    safeRatio(row.totalRunTimeMinutes, (row.totalRunTimeMinutes ?? 0) + (row.totalIdleTimeMinutes ?? 0));

  const performanceRatio =
    row.performanceRatio ??
    safeRatio(row.actualQtyPerHour, row.targetQtyPerHour);

  const qualityRatio =
    row.qualityRatio ??
    safeRatio(
      isFiniteNumber(row.actualProductionQty) && isFiniteNumber(row.totalRejectionQty)
        ? row.actualProductionQty - row.totalRejectionQty
        : undefined,
      row.actualProductionQty
    );

  const calculatedOeeRatio =
    availabilityRatio !== null && performanceRatio !== null && qualityRatio !== null
      ? availabilityRatio * performanceRatio * qualityRatio
      : null;

  return {
    index: row.index,
    availabilityRatio,
    performanceRatio,
    qualityRatio,
    sourceOeeRatio: row.sourceOeeRatio ?? null,
    calculatedOeeRatio,
    weight: isFiniteNumber(row.actualProductionQty) ? row.actualProductionQty : 0,
  };
}

function weightedByProduction(rows: DprRecord[]) {
  const factors = rows.map(deriveRowFactors);
  const totalWeight = factors.reduce((sumValue, row) => sumValue + row.weight, 0);

  const weightedAverage = (values: Array<number | null>) => {
    if (totalWeight <= 0) {
      return average(values);
    }

    let weightedSum = 0;
    let usedWeight = 0;
    values.forEach((value, index) => {
      const weight = factors[index]?.weight ?? 0;
      if (value === null || weight <= 0) return;
      weightedSum += value * weight;
      usedWeight += weight;
    });

    return usedWeight > 0 ? weightedSum / usedWeight : average(values);
  };

  return {
    availabilityRatio: weightedAverage(factors.map((row) => row.availabilityRatio)),
    performanceRatio: weightedAverage(factors.map((row) => row.performanceRatio)),
    qualityRatio: weightedAverage(factors.map((row) => row.qualityRatio)),
    // Machine-level and shift-level OEE use weighted average row OEE by production quantity.
    oeeRatio: weightedAverage(factors.map((row) => row.calculatedOeeRatio)),
  };
}

function safeRatio(numerator: number | undefined, denominator: number | undefined): number | null {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}

function sum(values: Array<number | undefined>): number {
  return values.reduce<number>((sumValue, current) => (isFiniteNumber(current) ? sumValue + current : sumValue), 0);
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sumValue, current) => sumValue + current, 0) / valid.length;
}

function toPercent(value: number | null): number | null {
  if (value === null) return null;
  return value * 100;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
