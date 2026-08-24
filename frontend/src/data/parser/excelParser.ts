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
];

export async function parseDprWorkbookFile(file: File): Promise<ParsedDprWorkbook> {
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
  const dprSheet = workbook.Sheets["DPR_OEE"];
  if (!dprSheet) {
    throw new Error("DPR_OEE sheet not found in workbook.");
  }

  const dashboardSheetRows = workbook.Sheets["Dashboard"]
    ? XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Dashboard"], { header: 1, raw: true, defval: "" })
    : [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(dprSheet, { header: 1, raw: true, defval: "" });

  return buildParsedResult({
    fileName: file.name,
    fileSize: file.size,
    sourceType,
    sheetName: "DPR_OEE",
    rows,
    dashboardSheetRows,
  });
}

function buildParsedResult(args: {
  fileName: string;
  fileSize: number;
  sourceType: "excel" | "csv";
  sheetName: string;
  rows: unknown[][];
  dashboardSheetRows: unknown[][];
}): ParsedDprWorkbook {
  const { fileName, fileSize, sourceType, sheetName, rows, dashboardSheetRows } = args;

  const headerRowIndex = detectHeaderRowIndex(rows);
  if (headerRowIndex === -1) {
    throw new Error("Date column could not be detected. Header row detection failed.");
  }

  const headerRow = rows[headerRowIndex] ?? [];
  const subHeaderRow = rows[headerRowIndex + 1] ?? [];
  const hasSubHeader = detectSubHeader(subHeaderRow);
  const dataStartIndex = headerRowIndex + (hasSubHeader ? 2 : 1);
  const headers = buildHeaders(headerRow, hasSubHeader ? subHeaderRow : []);
  const mappedRows = rows.slice(dataStartIndex).map((row) => mapRow(headers, row));

  const validRows = mappedRows.filter((row) => {
    const date = String(row["Date"] ?? "").trim();
    const machine = String(row["Machine Name"] ?? row["Machine No."] ?? "").trim();
    const production = row["Actual Production Qty."];
    const hasProduction = production !== undefined && production !== null && String(production).trim() !== "";
    return date !== "" || machine !== "" || hasProduction;
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
  };
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

  return winnerScore >= 4 ? winner : -1;
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
