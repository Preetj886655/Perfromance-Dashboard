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

export function saveDashboardDataset(payload: DashboardDatasetState): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // Large imported datasets can exceed the browser storage quota. The
    // dashboard keeps working from in-memory state for the session; the
    // dataset simply will not survive a page reload until re-imported.
    console.warn("Dashboard dataset could not be persisted (storage quota exceeded).");
    return false;
  }
}

export function clearDashboardDataset(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
