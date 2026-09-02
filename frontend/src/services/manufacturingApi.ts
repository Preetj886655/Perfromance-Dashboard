import { apiGet } from "../api/client";
import { normalizeDprRows, type DprRecord } from "../data/normalization/normalizeDprData";

export type ManufacturingConnectionStatus = {
  source: "google-sheets";
  connectionStatus: "connected" | "offline";
  status: "connected" | "offline";
  spreadsheetId: string;
  worksheet: string;
  recordCount: number;
  lastSuccessfulSync: string | null;
  lastUpdated: string | null;
  error: string | null;
  data: Record<string, unknown>[];
};

export type ManufacturingApiResponse = ManufacturingConnectionStatus & {
  columnMismatches?: string[];
};

const FIELD_ALIASES: Record<string, string> = {
  slno: "S.No.",
  serialno: "S.No.",
  date: "Date",
  line: "Line",
  shift: "Shift",
  part: "Part Name",
  stage: "Stage",
  machine: "Machine Name",
  machinename: "Machine Name",
  machineno: "Machine Name",
  downtimetype: "Downtime Reason",
  downtimereason: "Downtime Reason",
  downtimemints: "Total Idle Time (Minutes)",
  downtimeminutes: "Total Idle Time (Minutes)",
  downtime: "Total Idle Time (Minutes)",
  prodlossnos: "Production Loss",
  productionloss: "Production Loss",
  prodloss: "Production Loss",
  productiontarget: "Production Target",
  target: "Production Target",
  production: "Actual Production Qty.",
  totalproduction: "Actual Production Qty.",
  actualproductionqty: "Actual Production Qty.",
  producedqty: "Actual Production Qty.",
  rejection: "Total Rejection (Pcs Qty.)",
  rejectedqty: "Total Rejection (Pcs Qty.)",
  description: "Any Other Remarks",
  quality: "Quantity Ratio (Q)",
  availability: "Availability Ratio (A)",
  performance: "Operator Efficiency (Performance Ratio) - (P)",
  oee: "OEE (A*P*Q)",
  goodquantity: "Good Qty",
};

function normalizeSheetKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^the/, "");
}

function mapGoogleSheetRow(row: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(row)) {
    const normalizedKey = normalizeSheetKey(rawKey);
    const canonicalHeader = FIELD_ALIASES[normalizedKey] ?? rawKey;
    mapped[canonicalHeader] = rawValue;
  }
  return mapped;
}

export async function fetchManufacturingStatus(
  spreadsheetId?: string,
  worksheet?: string,
): Promise<ManufacturingConnectionStatus> {
  return apiGet<ManufacturingConnectionStatus>("/api/manufacturing/status", {
    spreadsheet_id: spreadsheetId,
    worksheet,
  });
}

export async function fetchManufacturingDataset(
  spreadsheetId?: string,
  worksheet?: string,
): Promise<ManufacturingApiResponse> {
  return apiGet<ManufacturingApiResponse>("/api/manufacturing/data", {
    spreadsheet_id: spreadsheetId,
    worksheet,
  });
}

export function normalizeGoogleSheetRecords(rows: Record<string, unknown>[]): DprRecord[] {
  const mappedRows = rows.map((row) => mapGoogleSheetRow(row));
  const { records } = normalizeDprRows(mappedRows);
  return records;
}
