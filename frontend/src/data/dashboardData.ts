export type ManufacturingRecord = {
  [key: string]: unknown;
  date?: string;
  line?: string;
  shift?: string;
  part?: string;
  stage?: string;
  machine?: string;
  downtimeType?: string;
  downtimeMinutes?: number;
  productionLoss?: number;
  productionTarget?: number;
  totalProduction?: number;
  rejection?: number;
  description?: string;
  month?: string;
  weekNo?: number;
  heatNo?: string;
  department?: string;
  customer?: string;
  product?: string;
  quality?: number;
  goodQuantity?: number;
};

export type ColumnDetectionResult = {
  uploadedColumn: string;
  systemField: string;
  confidence: number;
  action: "Correct" | "Manual" | "Skip";
};

export type ValidationIssue = {
  level: "error" | "warning";
  message: string;
};

export type ParsedFileResult = {
  sourceType: "csv" | "excel";
  fileName: string;
  rows: Record<string, unknown>[];
  headers: string[];
  fileSize: number;
  totalRows: number;
  totalColumns: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  mappedColumns: ColumnDetectionResult[];
  normalized: ManufacturingRecord[];
};

export type DashboardMetricResult = {
  recordCount: number;
  productionAchievement: number;
  totalProduction: number;
  productionTarget: number;
  rejectionRate: number;
  totalDowntime: number;
  goodQuantity: number;
  machineCount: number;
  lineCount: number;
  departmentCount: number;
  dateRange: { start: string; end: string };
  missingFields: string[];
};

export type DataSourceSummary = {
  rowCount: number;
  machineCount: number;
  lineCount: number;
  departmentCount: number;
  dateRange: { start: string; end: string };
};

const normalizeKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^(the|a|an)/, "");

const aliasMap: Record<string, string> = {
  date: "date",
  productiondate: "date",
  production: "totalProduction",
  totalproduction: "totalProduction",
  totalprodnos: "totalProduction",
  producedqty: "totalProduction",
  actualproduction: "totalProduction",
  prodqty: "totalProduction",
  product: "product",
  part: "part",
  line: "line",
  department: "department",
  shift: "shift",
  machine: "machine",
  machinecode: "machine",
  downtime: "downtimeMinutes",
  downtimeminutes: "downtimeMinutes",
  downtimemins: "downtimeMinutes",
  downtimeinminutes: "downtimeMinutes",
  downtimetype: "downtimeType",
  productiontarget: "productionTarget",
  prodtargetnos: "productionTarget",
  target: "productionTarget",
  rejection: "rejection",
  rejectqty: "rejection",
  reject: "rejection",
  loss: "productionLoss",
  productionloss: "productionLoss",
  totalloss: "productionLoss",
  quantitygood: "goodQuantity",
  goodquantity: "goodQuantity",
  goodqty: "goodQuantity",
  month: "month",
  weekno: "weekNo",
  heatno: "heatNo",
  heat: "heatNo",
  customer: "customer",
  description: "description",
  stage: "stage",
};

export function normalizeManufacturingRows(rows: Record<string, unknown>[]): ManufacturingRecord[] {
  return rows.map((row) => {
    const normalized: ManufacturingRecord = {};

    for (const [key, value] of Object.entries(row)) {
      const canonicalKey = aliasMap[normalizeKey(key)] ?? normalizeKey(key);
      const cleaned = value === null || value === undefined ? undefined : value;

      if (canonicalKey === "date") {
        normalized.date = toIsoDateString(cleaned);
      } else if (canonicalKey === "line") {
        normalized.line = String(cleaned ?? "").trim();
      } else if (canonicalKey === "shift") {
        normalized.shift = String(cleaned ?? "").trim();
      } else if (canonicalKey === "part") {
        normalized.part = String(cleaned ?? "").trim();
      } else if (canonicalKey === "stage") {
        normalized.stage = String(cleaned ?? "").trim();
      } else if (canonicalKey === "machine") {
        normalized.machine = String(cleaned ?? "").trim();
      } else if (canonicalKey === "downtimeType") {
        normalized.downtimeType = String(cleaned ?? "").trim();
      } else if (canonicalKey === "downtimeMinutes") {
        normalized.downtimeMinutes = parseNumericValue(cleaned);
      } else if (canonicalKey === "productionLoss") {
        normalized.productionLoss = parseNumericValue(cleaned);
      } else if (canonicalKey === "productionTarget") {
        normalized.productionTarget = parseNumericValue(cleaned);
      } else if (canonicalKey === "totalProduction") {
        normalized.totalProduction = parseNumericValue(cleaned);
      } else if (canonicalKey === "rejection") {
        normalized.rejection = parseNumericValue(cleaned);
      } else if (canonicalKey === "description") {
        normalized.description = String(cleaned ?? "").trim();
      } else if (canonicalKey === "month") {
        normalized.month = String(cleaned ?? "").trim();
      } else if (canonicalKey === "weekNo") {
        normalized.weekNo = parseNumericValue(cleaned);
      } else if (canonicalKey === "heatNo") {
        normalized.heatNo = String(cleaned ?? "").trim();
      } else if (canonicalKey === "department") {
        normalized.department = String(cleaned ?? "").trim();
      } else if (canonicalKey === "product") {
        normalized.product = String(cleaned ?? "").trim();
      } else if (canonicalKey === "customer") {
        normalized.customer = String(cleaned ?? "").trim();
      } else if (canonicalKey === "goodQuantity") {
        normalized.goodQuantity = parseNumericValue(cleaned);
      } else if (canonicalKey === "quality") {
        normalized.quality = parseNumericValue(cleaned);
      }

      if (!normalized[canonicalKey as keyof ManufacturingRecord]) {
        normalized[canonicalKey] = cleaned as unknown;
      }
    }

    return normalized;
  });
}

export function detectColumnMapping(headers: string[]): ColumnDetectionResult[] {
  const unique = [...new Set(headers.map((header) => header.trim()).filter(Boolean))];
  return unique.map((header) => {
    const normalized = normalizeKey(header);
    const mappedField = Object.keys(aliasMap).includes(normalized)
      ? aliasMap[normalized]
      : "custom";

    return {
      uploadedColumn: header,
      systemField: mappedField === "custom" ? "Custom Field" : mappedField,
      confidence: mappedField === "custom" ? 45 : 93,
      action: mappedField === "custom" ? "Manual" : "Correct",
    };
  });
}

export function detectDataSourceSummary(rows: ManufacturingRecord[]): DataSourceSummary {
  const validRows = rows.filter((row) => typeof row.date === "string" || row.date !== undefined);
  const dates = validRows
    .map((row) => row.date)
    .filter((date): date is string => Boolean(date))
    .sort();

  const uniqueMachines = new Set(
    rows
      .map((row) => row.machine)
      .filter((machine): machine is string => Boolean(machine && String(machine).trim() !== ""))
      .map((machine) => String(machine).trim())
  );

  const uniqueLines = new Set(
    rows
      .map((row) => row.line)
      .filter((line): line is string => Boolean(line && String(line).trim() !== ""))
      .map((line) => String(line).trim())
  );

  const uniqueDepartments = new Set(
    rows
      .map((row) => row.department)
      .filter((department): department is string => Boolean(department && String(department).trim() !== ""))
      .map((department) => String(department).trim())
  );

  return {
    rowCount: rows.length,
    machineCount: uniqueMachines.size,
    lineCount: uniqueLines.size,
    departmentCount: uniqueDepartments.size,
    dateRange: {
      start: dates[0] ?? "N/A",
      end: dates[dates.length - 1] ?? "N/A",
    },
  };
}

export function calculateDashboardMetrics(rows: ManufacturingRecord[]): DashboardMetricResult {
  const validRows = rows.filter((row) => row && typeof row === "object");
  const productionTarget = validRows.reduce((sum, row) => sum + (typeof row.productionTarget === "number" ? row.productionTarget : 0), 0);
  const totalProduction = validRows.reduce((sum, row) => sum + (typeof row.totalProduction === "number" ? row.totalProduction : 0), 0);
  const totalDowntime = validRows.reduce((sum, row) => sum + (typeof row.downtimeMinutes === "number" ? row.downtimeMinutes : 0), 0);
  const rejectionTotal = validRows.reduce((sum, row) => sum + (typeof row.rejection === "number" ? row.rejection : 0), 0);
  const goodQuantity = validRows.reduce((sum, row) => sum + (typeof row.goodQuantity === "number" ? row.goodQuantity : (typeof row.totalProduction === "number" && typeof row.rejection === "number" ? Math.max(row.totalProduction - row.rejection, 0) : 0)), 0);

  const productionAchievement = productionTarget > 0 ? (totalProduction / productionTarget) * 100 : 0;
  const rejectionRate = totalProduction > 0 ? (rejectionTotal / totalProduction) * 100 : 0;
  const dateList = validRows
    .map((row) => row.date)
    .filter((date): date is string => Boolean(date))
    .sort();

  const missingFields: string[] = [];
  if (productionTarget <= 0) missingFields.push("Production Target");
  if (totalProduction <= 0) missingFields.push("Total Production");
  if (rejectionTotal <= 0 && validRows.some((row) => typeof row.rejection === "number")) {
    // valid, not missing
  }

  return {
    recordCount: validRows.length,
    productionAchievement: Number(productionAchievement.toFixed(2)),
    totalProduction,
    productionTarget,
    rejectionRate: Number(rejectionRate.toFixed(2)),
    totalDowntime,
    goodQuantity,
    machineCount: new Set(validRows.map((row) => row.machine).filter(Boolean)).size,
    lineCount: new Set(validRows.map((row) => row.line).filter(Boolean)).size,
    departmentCount: new Set(validRows.map((row) => row.department).filter(Boolean)).size,
    dateRange: {
      start: dateList[0] ?? "N/A",
      end: dateList[dateList.length - 1] ?? "N/A",
    },
    missingFields,
  };
}

export function buildPreviewSummary(rows: ManufacturingRecord[], sourceType: "csv" | "excel") {
  const summary = detectDataSourceSummary(rows);
  return {
    sourceType,
    status: rows.length > 0 ? "ready" : "empty",
    rowCount: summary.rowCount,
    machineCount: summary.machineCount,
    lineCount: summary.lineCount,
    dateRange: summary.dateRange,
  };
}

function parseNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,\s%]/g, "").replace(/\((.*)\)/, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toIsoDateString(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return trimmed;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return undefined;
}
