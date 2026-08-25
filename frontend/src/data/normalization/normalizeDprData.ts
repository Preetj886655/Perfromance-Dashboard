export type DprRawRow = Record<string, unknown>;

export type DprRecord = {
  index: number;
  serialNo?: number;
  date?: string;
  productionHour?: number;
  shift?: string;
  lineName?: string;
  machineName?: string;
  materialName?: string;
  machineNo?: string;
  startTime?: string;
  stopTime?: string;
  shiftTimeMinutes?: number;
  shiftIncharge?: string;
  operatorName?: string;
  partName?: string;
  partNo?: string;
  cavity?: number;
  cycleTimeSec?: number;
  targetQtyPerHour?: number;
  targetProduction?: number;
  actualProductionQty?: number;
  productionLoss?: number;
  plannedDownTimeMinutes?: number;
  availableTimeMinutes?: number;
  idleReason?: string;
  idleReasonBreakup: Array<{ reason: string; minutes: number }>;
  totalIdleTimeMinutes?: number;
  totalRunTimeMinutes?: number;
  availabilityRatio?: number;
  actualQtyPerHour?: number;
  performanceRatio?: number;
  machineUtilizationRatio?: number;
  rejectionReason?: string;
  rejectionReasonBreakup: Array<{ reason: string; qty: number }>;
  totalRejectionQty?: number;
  rejectionPpm?: number;
  qualityRatio?: number;
  sourceOeeRatio?: number;
  remarks?: string;
  customColumns: Record<string, unknown>;
  raw: DprRawRow;
};

export type DprValidationIssue = {
  level: "error" | "warning";
  message: string;
};

export function normalizeDprRows(rows: DprRawRow[]): { records: DprRecord[]; warnings: DprValidationIssue[] } {
  const warnings: DprValidationIssue[] = [];
  const records: DprRecord[] = [];

  rows.forEach((row, index) => {
    const mapped = normalizeDprRow(row, index);
    if (mapped) {
      records.push(mapped);
    }
  });

  if (records.length === 0) {
    warnings.push({ level: "warning", message: "No valid DPR records were detected after normalization." });
  }

  return { records, warnings };
}

export function normalizeDprRow(row: DprRawRow, index: number): DprRecord | null {
  const serialNo = toNumber(row["S.No."]);
  const date = toIsoDate(row["Date"]);
  const machineName = toText(row["Machine Name"]);
  const machineNo = toText(row["Machine No."]);
  const actualProductionQty = toNumber(row["Actual Production Qty."]);

  const hasSignal = Boolean(date) || Boolean(machineName) || Boolean(machineNo) || Boolean(row["Line"])
    || isFiniteNumber(actualProductionQty) || isFiniteNumber(toNumber(row["Total Idle Time (Minutes)"]))
    || isFiniteNumber(toNumber(row["Total Rejection (Pcs Qty.)"]));
  if (!hasSignal) {
    return null;
  }

  const idleReasonBreakup = extractIdleBreakupValues(row);
  const rejectionReasonBreakup = extractRejectionBreakupValues(row);

  const idleReasonFromBreakup = pickMaxBreakupReason(idleReasonBreakup, (entry) => entry.minutes);
  const rejectionReasonFromBreakup = pickMaxBreakupReason(rejectionReasonBreakup, (entry) => entry.qty);

  const customColumns: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    if (!KNOWN_HEADERS.has(key)) {
      customColumns[key] = value;
    }
  });

  return {
    index,
    serialNo: serialNo ?? undefined,
    date: date ?? undefined,
    productionHour: toNumber(row["Production Hour"]) ?? undefined,
    shift: toText(row["Shift"]) ?? undefined,
    lineName: toText(row["Line"]) ?? undefined,
    machineName: machineName ?? undefined,
    materialName: toText(row["Material Name"]) ?? undefined,
    machineNo: machineNo ?? undefined,
    startTime: toTimeText(row["Start Time"]),
    stopTime: toTimeText(row["Stop Time"]),
    shiftTimeMinutes: toNumber(row["Shift Time (Minutes)"]) ?? undefined,
    shiftIncharge: toText(row["Shift Incharge"]) ?? undefined,
    operatorName: toText(row["Operator Name"]) ?? undefined,
    partName: toText(row["Part Name"]) ?? toText(row["Part Name "]) ?? undefined,
    partNo: toText(row["Part No."]) ?? undefined,
    cavity: toNumber(row["Cavity"]) ?? undefined,
    cycleTimeSec: toNumber(row["Cycle Time (Sec.)"]) ?? undefined,
    targetQtyPerHour: toNumber(row["Target Qty./Hr. (Pcs.)"]) ?? undefined,
    targetProduction: toNumber(row["Production Target"]) ?? undefined,
    actualProductionQty: actualProductionQty ?? undefined,
    productionLoss: toNumber(row["Production Loss"]) ?? undefined,
    plannedDownTimeMinutes: toNumber(row["Planned Down Time (Tea/Lunch)"]) ?? undefined,
    availableTimeMinutes: toNumber(row["Available Time"]) ?? undefined,
    idleReason: toText(row["Reason of Idle Time (Unplanned BD Time in Minutes)"]) ?? toText(row["Downtime Reason"]) ?? idleReasonFromBreakup ?? undefined,
    idleReasonBreakup,
    totalIdleTimeMinutes: toNumber(row["Total Idle Time (Minutes)"]) ?? undefined,
    totalRunTimeMinutes: toNumber(row["Total Run Time (Minutes)"]) ?? undefined,
    availabilityRatio: toRatio(row["Availability Ratio (A)"]) ?? undefined,
    actualQtyPerHour: toNumber(row["Actual Qty./ Hr."]) ?? undefined,
    performanceRatio: toRatio(row["Operator Efficiency (Performance Ratio) - (P)"]) ?? undefined,
    machineUtilizationRatio: toRatio(row["Machine Efficiency (Machine Utilisation)"]) ?? undefined,
    rejectionReason: toText(row["Reason of  Rejection (Qty. in Pcs.)"]) ?? rejectionReasonFromBreakup ?? undefined,
    rejectionReasonBreakup,
    totalRejectionQty: toNumber(row["Total Rejection (Pcs Qty.)"]) ?? undefined,
    rejectionPpm: toNumber(row["Rejection PPM"]) ?? undefined,
    qualityRatio: toRatio(row["Quantity Ratio (Q)"]) ?? undefined,
    sourceOeeRatio: toRatio(row["OEE (A*P*Q)"]) ?? undefined,
    remarks: toText(row["Any Other Remarks"]) ?? toText(row["Description"]) ?? undefined,
    customColumns,
    raw: row,
  };
}

const KNOWN_HEADERS = new Set([
  "S.No.",
  "Date",
  "Production Hour",
  "Shift",
  "Machine Name",
  "Material Name",
  "Machine No.",
  "Start Time",
  "Stop Time",
  "Shift Time (Minutes)",
  "Shift Incharge",
  "Operator Name",
  "Part Name",
  "Part Name ",
  "Part No.",
  "Cavity",
  "Cycle Time (Sec.)",
  "Target Qty./Hr. (Pcs.)",
  "Actual Production Qty.",
  "Planned Down Time (Tea/Lunch)",
  "Available Time",
  "Reason of Idle Time (Unplanned BD Time in Minutes)",
  "Total Idle Time (Minutes)",
  "Total Run Time (Minutes)",
  "Availability Ratio (A)",
  "Actual Qty./ Hr.",
  "Operator Efficiency (Performance Ratio) - (P)",
  "Machine Efficiency (Machine Utilisation)",
  "Reason of  Rejection (Qty. in Pcs.)",
  "Total Rejection (Pcs Qty.)",
  "Rejection PPM",
  "Quantity Ratio (Q)",
  "OEE (A*P*Q)",
  "Any Other Remarks",
]);

function extractIdleBreakupValues(row: DprRawRow): Array<{ reason: string; minutes: number }> {
  return Object.entries(row)
    .filter(([key]) => key.startsWith("Idle Reason - "))
    .map(([key, rawValue]) => {
      const value = toNumber(rawValue);
      if (!isFiniteNumber(value) || value <= 0) return null;
      return { reason: key.replace("Idle Reason - ", "").trim(), minutes: value };
    })
    .filter((entry): entry is { reason: string; minutes: number } => entry !== null);
}

function extractRejectionBreakupValues(row: DprRawRow): Array<{ reason: string; qty: number }> {
  return Object.entries(row)
    .filter(([key]) => key.startsWith("Rejection Reason - "))
    .map(([key, rawValue]) => {
      const value = toNumber(rawValue);
      if (!isFiniteNumber(value) || value <= 0) return null;
      return { reason: key.replace("Rejection Reason - ", "").trim(), qty: value };
    })
    .filter((entry): entry is { reason: string; qty: number } => entry !== null);
}

function pickMaxBreakupReason<T>(
  values: T[],
  metricSelector: (value: T) => number
): string | null {
  if (!values.length) return null;
  let maxReason: string | null = null;
  let maxValue = -1;
  values.forEach((entry) => {
    const metric = metricSelector(entry);
    if (metric > maxValue) {
      maxValue = metric;
      maxReason = (entry as { reason: string }).reason;
    }
  });
  return maxReason;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value).replace(/,/g, "").replace(/\s+/g, "").replace(/%/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRatio(value: unknown): number | null {
  const parsed = toNumber(value);
  if (!isFiniteNumber(parsed)) return null;
  if (parsed > 1.5) return parsed / 100;
  if (parsed < 0) return null;
  return parsed;
}

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    const converted = excelSerialToDate(value);
    if (converted) return converted;
  }

  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString().slice(0, 10);
}

function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  if (Number.isNaN(dateInfo.getTime())) return null;
  return dateInfo.toISOString().slice(0, 10);
}

function toTimeText(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") {
    const totalMinutes = Math.round(value * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const raw = String(value).trim();
  return raw || undefined;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
