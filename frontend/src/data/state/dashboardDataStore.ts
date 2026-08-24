import type { DprRecord } from "../normalization/normalizeDprData";
import type { WorkbookDashboardReference } from "../parser/excelParser";

export type DashboardDatasetState = {
  fileName: string;
  sheetName: string;
  uploadedAt: string;
  recordCount: number;
  records: DprRecord[];
  dashboardReference?: WorkbookDashboardReference;
};

const STORAGE_KEY = "patil.dashboard.dataset";

export function loadDashboardDataset(): DashboardDatasetState | null {
  if (typeof window === "undefined") return null;
  const serialized = window.localStorage.getItem(STORAGE_KEY);
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as DashboardDatasetState;
    if (!parsed || !Array.isArray(parsed.records)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDashboardDataset(payload: DashboardDatasetState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearDashboardDataset(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
