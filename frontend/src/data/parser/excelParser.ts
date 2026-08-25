import * as XLSX from "xlsx";

import {
  normalizeDprRows,
  type DprRawRow,
  type DprRecord,
  type DprValidationIssue,
} from "../normalization/normalizeDprData";

export type WorkbookDashboardReference = {
  records?: number;
  averageOeeRatio?: number;
  averageAvailabilityRatio?: number;
  averagePerformanceRatio?: number;
  totalProduction?: number;
  totalRejection?: number;
};

export type ParsedDprWorkbook = {
  fileName: string;
  fileSize: number;
  sourceType: "excel" | "csv";
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  rowCount: number;
  columnCount: number;
  previewRows: DprRawRow[];
  records: DprRecord[];
  validationIssues: DprValidationIssue[];
  dashboardReference: WorkbookDashboardReference;
  availableFields: string[];
  analysisMode: "oee" | "manufacturing" | "production-downtime" | "production-quality" | "downtime" | "overview";
  dataQuality: {
    missingPercent: number;
    duplicateRows: number;
    sheetNames: string[];
    recommendedSheetName: string;
  };
};

const HEADER_CANDIDATES = [
  "sno",
  "date",
  "productionhour",
  "shift",
  "machinename",
  "machineno",
  "actualproductionqty",
  "oee",
  "line",
  "part",
  "downtime",
  "production",
  "target",
  "rejection",
];

const FIELD_ALIASES: Record<string, string[]> = {
  Date: ["date", "production date", "date of production", "timestamp"],
  Line: ["line", "production line", "line name"],
  Shift: ["shift", "shift name"],
  "Machine Name": ["machine", "machine name", "machine no", "machine number"],
  "Part Name": ["part", "part no", "part number", "product"],
  "Downtime Reason": ["downtime type", "downtime reason", "reason", "breakdown reason"],
  "Total Idle Time (Minutes)": ["downtime", "downtime minutes", "downtime mints", "breakdown minutes"],
  "Actual Production Qty.": ["total production", "total prod nos", "production", "actual production", "actual production qty", "produced qty"],
  "Production Target": ["production target", "prod target nos", "target"],
  "Production Loss": ["production loss", "prod loss nos", "loss qty"],
  "Total Rejection (Pcs Qty.)": ["rejection", "rejected qty", "rejection qty"],
  "Any Other Remarks": ["description", "remarks", "comments"],
  "Availability Ratio (A)": ["availability", "availability ratio", "operating time", "run time"],
  "Operator Efficiency (Performance Ratio) - (P)": ["performance", "performance ratio"],
  "Quantity Ratio (Q)": ["quality", "quality rate", "quality ratio"],
  "OEE (A*P*Q)": ["oee", "oee percentage", "oee %"],
};

const FIELD_LABELS: Record<string, string> = {
  Date: "Date", Line: "Line", Shift: "Shift", "Machine Name": "Machine", "Part Name": "Part",
  "Downtime Reason": "Downtime Reason", "Total Idle Time (Minutes)": "Downtime", "Actual Production Qty.": "Production",
  "Production Target": "Production Target", "Production Loss": "Production Loss", "Total Rejection (Pcs Qty.)": "Rejection",
  "Any Other Remarks": "Description",
  "Availability Ratio (A)": "Availability", "Operator Efficiency (Performance Ratio) - (P)": "Performance",
  "Quantity Ratio (Q)": "Quality", "OEE (A*P*Q)": "OEE",
};

export async function parseDprWorkbookFile(file: File, requestedSheetName?: string): Promise<ParsedDprWorkbook> {
  const extension = file.name.toLowerCase();
  const sourceType = extension.endsWith(".csv") ? "csv" : "excel";

  if (!file.size) {
    throw new Error("Unable to process file. No rows found.");
  }

  if (sourceType === "csv") {
    const text = await file.text();
    const rows = parseCsvToArrays(text);
    return buildParsedResult({
      fileName: file.name,
      fileSize: file.size,
      sourceType,
      sheetName: "CSV",
      rows,
      dashboardSheetRows: [],
    });
  }

  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array", raw: true, cellDates: false });
  const recommendedSheetName = selectAnalysisSheet(workbook);
  const sheetName = requestedSheetName && workbook.Sheets[requestedSheetName]
    ? requestedSheetName
    : recommendedSheetName;
  const dataSheet = workbook.Sheets[sheetName];

  const dashboardSheetRows = workbook.Sheets["Dashboard"]
    ? XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Dashboard"], { header: 1, raw: true, defval: "" })
    : [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(dataSheet, { header: 1, raw: true, defval: "" });

  return buildParsedResult({
    fileName: file.name,
    fileSize: file.size,
    sourceType,
    sheetName,
    rows,
    dashboardSheetRows,
    sheetNames: workbook.SheetNames,
    recommendedSheetName,
  });
}

function buildParsedResult(args: {
  fileName: string;
  fileSize: number;
  sourceType: "excel" | "csv";
  sheetName: string;
  rows: unknown[][];
  dashboardSheetRows: unknown[][];
  sheetNames?: string[];
  recommendedSheetName?: string;
}): ParsedDprWorkbook {
  const { fileName, fileSize, sourceType, sheetName, rows, dashboardSheetRows, sheetNames = [sheetName], recommendedSheetName = sheetName } = args;

  const headerRowIndex = detectHeaderRowIndex(rows);
  if (headerRowIndex === -1) {
    throw new Error("No analyzable manufacturing data was found.");
  }

  const headerRow = rows[headerRowIndex] ?? [];
  const subHeaderRow = rows[headerRowIndex + 1] ?? [];
  const hasSubHeader = detectSubHeader(subHeaderRow);
  const dataStartIndex = headerRowIndex + (hasSubHeader ? 2 : 1);
  const headers = buildHeaders(headerRow, hasSubHeader ? subHeaderRow : []);
  const mappedRows = rows.slice(dataStartIndex).map((row) => normalizeAliases(mapRow(headers, row), headers));

  const validRows = mappedRows.filter((row) => {
    const date = String(row["Date"] ?? "").trim();
    const machine = String(row["Machine Name"] ?? row["Machine No."] ?? "").trim();
    const production = row["Actual Production Qty."];
    const hasProduction = production !== undefined && production !== null && String(production).trim() !== "";
    return date !== "" || machine !== "" || String(row["Line"] ?? "").trim() !== "" || hasProduction
      || row["Total Idle Time (Minutes)"] !== undefined || row["Total Rejection (Pcs Qty.)"] !== undefined;
  });

  const { records, warnings } = normalizeDprRows(validRows);

  const validationIssues: DprValidationIssue[] = [];
  if (validRows.length === 0) {
    validationIssues.push({ level: "error", message: "No rows found." });
  }

  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) {
    validationIssues.push({
      level: "error",
      message: `File contains duplicate column names: ${[...new Set(duplicateHeaders)].join(", ")}`,
    });
  }

  validationIssues.push(...warnings);

  const detectedKeys = Object.keys(FIELD_ALIASES).filter((key) =>
    validRows.some((candidate) => candidate[key] !== undefined && String(candidate[key]).trim() !== "")
  );
  const availableFields = detectedKeys.map((key) => FIELD_LABELS[key]);
  const hasOee = ["Availability Ratio (A)", "Operator Efficiency (Performance Ratio) - (P)", "Quantity Ratio (Q)"].every(
    (key) => validRows.some((row) => row[key] !== undefined && String(row[key]).trim() !== "")
  );
  const hasProduction = detectedKeys.includes("Actual Production Qty.");
  const hasDowntime = detectedKeys.includes("Total Idle Time (Minutes)");
  const hasQuality = detectedKeys.includes("Total Rejection (Pcs Qty.)");
  const analysisMode = hasOee ? "oee" : hasProduction && hasDowntime && hasQuality ? "manufacturing" : hasProduction && hasDowntime ? "production-downtime" : hasProduction && hasQuality ? "production-quality" : hasDowntime ? "downtime" : "overview";
  const cellCount = Math.max(1, validRows.length * Math.max(1, headers.length));
  const missingCells = validRows.reduce((total, row) => total + headers.filter((header) => row[header] === undefined || String(row[header]).trim() === "").length, 0);
  const duplicateRows = validRows.length - new Set(validRows.map((row) => JSON.stringify(row))).size;

  return {
    fileName,
    fileSize,
    sourceType,
    sheetName,
    headerRowIndex,
    headers,
    rowCount: records.length,
    columnCount: headers.length,
    previewRows: validRows.slice(0, 8),
    records,
    validationIssues,
    dashboardReference: parseDashboardReference(dashboardSheetRows),
    availableFields,
    analysisMode,
    dataQuality: { missingPercent: (missingCells / cellCount) * 100, duplicateRows, sheetNames, recommendedSheetName },
  };
}

function selectAnalysisSheet(workbook: XLSX.WorkBook): string {
  const candidates = workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: true, defval: "" });
    const headerRow = rows.slice(0, 40).find((row) => row.some((cell) => normalizeCell(cell) === "date" || normalizeCell(cell).includes("production") || normalizeCell(cell).includes("downtime"))) ?? [];
    const recognized = headerRow.filter((cell) => Object.values(FIELD_ALIASES).some((aliases) => aliases.some((alias) => normalizeCell(cell) === normalizeCell(alias)))).length;
    const populatedRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== "")).length;
    const score = recognized * 1000 + Math.min(populatedRows, 10000);
    return { name, score };
  }).sort((a, b) => b.score - a.score);
  const selected = candidates[0];
  if (!selected || selected.score === 0) throw new Error("No analyzable manufacturing data was found.");
  return selected.name;
}

function normalizeAliases(row: DprRawRow, headers: string[]): DprRawRow {
  const normalizedHeaders = headers.map(normalizeCell);
  Object.entries(FIELD_ALIASES).forEach(([canonical, aliases]) => {
    const aliasIndex = normalizedHeaders.findIndex((header) => aliases.some((alias) => normalizeCell(alias) === header));
    if (aliasIndex >= 0 && row[headers[aliasIndex]] !== undefined) row[canonical] = row[headers[aliasIndex]];
  });
  return row;
}

function detectHeaderRowIndex(rows: unknown[][]): number {
  let winner = -1;
  let winnerScore = -1;

  rows.slice(0, 40).forEach((row, index) => {
    const normalizedRow = (row ?? []).map((cell) => normalizeCell(cell));
    const score = HEADER_CANDIDATES.reduce(
      (sum, candidate) => (normalizedRow.some((value) => value.includes(candidate)) ? sum + 1 : sum),
      0
    );

    if (score > winnerScore) {
      winnerScore = score;
      winner = index;
    }
  });

  return winnerScore >= 1 ? winner : -1;
}

function detectSubHeader(row: unknown[]): boolean {
  if (!row || row.length === 0) return false;
  const textValues = row.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (textValues.length < 2) return false;
  return textValues.some((value) => /manpower|shortage|rejection|process|operator|mould|power|qc/i.test(value));
}

function buildHeaders(headerRow: unknown[], subHeaderRow: unknown[]): string[] {
  const headers: string[] = [];
  for (let index = 0; index < Math.max(headerRow.length, subHeaderRow.length); index += 1) {
    const primary = String(headerRow[index] ?? "").trim();
    const secondary = String(subHeaderRow[index] ?? "").trim();

    if (primary) {
      headers.push(primary);
      continue;
    }

    if (secondary) {
      const prefixed = index <= 31 ? `Idle Reason - ${secondary}` : `Rejection Reason - ${secondary}`;
      headers.push(prefixed);
      continue;
    }

    headers.push(`Column ${index + 1}`);
  }
  return headers;
}

function mapRow(headers: string[], row: unknown[]): DprRawRow {
  const mapped: DprRawRow = {};
  headers.forEach((header, index) => {
    mapped[header] = row[index];
  });
  return mapped;
}

function parseDashboardReference(rows: unknown[][]): WorkbookDashboardReference {
  if (!rows.length) return {};

  const reference: WorkbookDashboardReference = {};
  rows.slice(0, 16).forEach((row) => {
    row.forEach((cell, index) => {
      const label = String(cell ?? "").trim().toLowerCase();
      if (label === "records") reference.records = toNumber(row[index + 1]);
      if (label === "average oee") reference.averageOeeRatio = toRatio(row[index + 1]);
      if (label === "avg availability") reference.averageAvailabilityRatio = toRatio(row[index + 1]);
      if (label === "avg performance") reference.averagePerformanceRatio = toRatio(row[index + 1]);
      if (label === "total production") reference.totalProduction = toNumber(row[index + 1]);
      if (label === "total rejection") reference.totalRejection = toNumber(row[index + 1]);
    });
  });

  return reference;
}

function parseCsvToArrays(text: string): unknown[][] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  return lines.map((line) => line.split(",").map((value) => value.trim()));
}

function normalizeCell(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toRatio(value: unknown): number | undefined {
  const parsed = toNumber(value);
  if (parsed === undefined) return undefined;
  if (parsed > 1.5) return parsed / 100;
  return parsed;
}
