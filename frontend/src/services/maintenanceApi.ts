import { apiGet } from "../api/client";
import type {
  MaintenanceApiResponse,
  MaintenanceConnectionStatus,
} from "../data/maintenance/types";

export async function fetchMaintenanceStatus(
  spreadsheetId?: string,
  worksheet?: string,
): Promise<MaintenanceConnectionStatus> {
  return apiGet<MaintenanceConnectionStatus>("/api/maintenance/status", {
    spreadsheet_id: spreadsheetId,
    worksheet,
  });
}

export async function fetchMaintenanceDataset(
  spreadsheetId?: string,
  worksheet?: string,
  refresh?: boolean,
): Promise<MaintenanceApiResponse> {
  return apiGet<MaintenanceApiResponse>("/api/maintenance/data", {
    spreadsheet_id: spreadsheetId,
    worksheet,
    refresh: refresh ? "true" : undefined,
  });
}

