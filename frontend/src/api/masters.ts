/**
 * Master data management API client.
 * Handles CRUD operations for plants, lines, machines, machine types, and machine statuses.
 */

import { apiGet, apiPost, apiUpload } from "./client";

export type PlantOption = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type LineOption = {
  id: string;
  code: string;
  name: string;
  plant_id: string;
};

export type MachineTypeOption = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type MachineStatusOption = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type MachineOption = {
  id: string;
  code: string;
  name: string;
  plant_id: string;
  line_id: string | null;
  status_id: string | null;
  status_code: string | null;
  status_name: string | null;
  status_is_active: boolean | null;
};

const BASE = "/api/v1";

// ============================================================================
// PLANTS
// ============================================================================

export function listPlants(): Promise<{ items: PlantOption[]; count: number }> {
  return apiGet<{ items: PlantOption[]; count: number }>(`${BASE}/plants`);
}

export function createPlant(payload: {
  code: string;
  name: string;
  timezone?: string;
}): Promise<PlantOption> {
  return apiPost<PlantOption>(`${BASE}/plants`, {
    code: payload.code,
    name: payload.name,
    timezone: payload.timezone || "UTC",
  });
}

// ============================================================================
// LINES
// ============================================================================

export function listLines(plantId?: string): Promise<{ items: LineOption[]; count: number }> {
  return apiGet<{ items: LineOption[]; count: number }>(`${BASE}/lines`, {
    plant_id: plantId,
  });
}

export function createLine(payload: {
  plant_id: string;
  code: string;
  name: string;
}): Promise<LineOption> {
  return apiPost<LineOption>(`${BASE}/lines`, {
    plant_id: payload.plant_id,
    code: payload.code,
    name: payload.name,
  });
}

// ============================================================================
// MACHINE TYPES
// ============================================================================

export function listMachineTypes(): Promise<{ items: MachineTypeOption[]; count: number }> {
  return apiGet<{ items: MachineTypeOption[]; count: number }>(`${BASE}/machine-types`);
}

export function createMachineType(payload: {
  code: string;
  name: string;
}): Promise<MachineTypeOption> {
  return apiPost<MachineTypeOption>(`${BASE}/machine-types`, {
    code: payload.code,
    name: payload.name,
  });
}

// ============================================================================
// MACHINE STATUSES
// ============================================================================

export function listMachineStatuses(): Promise<{ items: MachineStatusOption[]; count: number }> {
  return apiGet<{ items: MachineStatusOption[]; count: number }>(`${BASE}/machine-statuses`);
}

export function createMachineStatus(payload: {
  code: string;
  name: string;
}): Promise<MachineStatusOption> {
  return apiPost<MachineStatusOption>(`${BASE}/machine-statuses`, {
    code: payload.code,
    name: payload.name,
  });
}

// ============================================================================
// MACHINES
// ============================================================================

export function listMachines(params: {
  plant_id?: string;
  line_id?: string;
}): Promise<{ items: MachineOption[]; count: number }> {
  return apiGet<{ items: MachineOption[]; count: number }>(`${BASE}/machines`, {
    plant_id: params.plant_id,
    line_id: params.line_id,
  });
}

export function createMachine(payload: {
  plant_id: string;
  line_id?: string | null;
  code: string;
  name: string;
  machine_type_id: string;
  status_id: string;
  ideal_cycle_time_sec?: number | null;
}): Promise<MachineOption> {
  return apiPost<MachineOption>(`${BASE}/machines`, {
    plant_id: payload.plant_id,
    line_id: payload.line_id || null,
    code: payload.code,
    name: payload.name,
    machine_type_id: payload.machine_type_id,
    status_id: payload.status_id,
    ideal_cycle_time_sec: payload.ideal_cycle_time_sec || null,
  });
}

export type DataSourceOption = {
  id: string;
  code: string;
  name: string;
  source_type: string;
  config: Record<string, unknown>;
  freshness_sla_minutes?: number | null;
  is_active: boolean;
};

export function listDataSources(): Promise<{ items: DataSourceOption[]; count: number }> {
  return apiGet<{ items: DataSourceOption[]; count: number }>(`${BASE}/data-sources`);
}

export function createDataSource(payload: {
  code: string;
  name: string;
  source_type: "excel" | "csv" | "form" | "sheets" | "manual" | "api";
  config?: Record<string, unknown>;
  freshness_sla_minutes?: number | null;
  is_active?: boolean;
}): Promise<DataSourceOption> {
  return apiPost<DataSourceOption>(`${BASE}/data-sources`, {
    code: payload.code,
    name: payload.name,
    source_type: payload.source_type,
    config: payload.config ?? {},
    freshness_sla_minutes: payload.freshness_sla_minutes ?? null,
    is_active: payload.is_active ?? true,
  });
}

export type ColumnMappingTemplateOption = {
  id: string;
  name: string;
  source_type: string;
  department_id?: string | null;
  mapping: Record<string, unknown>;
  version: number;
  is_active: boolean;
};

export function listColumnMappingTemplates(): Promise<{ items: ColumnMappingTemplateOption[]; count: number }> {
  return apiGet<{ items: ColumnMappingTemplateOption[]; count: number }>(`${BASE}/column-mapping-templates`);
}

export function createColumnMappingTemplate(payload: {
  name: string;
  source_type: "excel" | "csv" | "form" | "sheets" | "manual" | "api";
  department_id?: string | null;
  mapping: Record<string, unknown>;
  version?: number;
  is_active?: boolean;
}): Promise<ColumnMappingTemplateOption> {
  return apiPost<ColumnMappingTemplateOption>(`${BASE}/column-mapping-templates`, {
    name: payload.name,
    source_type: payload.source_type,
    department_id: payload.department_id ?? null,
    mapping: payload.mapping ?? {},
    version: payload.version ?? 1,
    is_active: payload.is_active ?? true,
  });
}

export type ImportPreview = {
  source_type: string;
  headers: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  preview_limit: number;
};

export function previewImportFile(file: File, sourceType: string): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source_type", sourceType);
  return apiUpload<ImportPreview>(`${BASE}/imports/preview`, formData);
}

export type DprOeeImportResult = {
  import_job_id: string;
  status: string;
  total_rows: number;
  success_count: number;
  error_count: number;
  message: string;
};

/**
 * Commits a DPR_OEE Excel or CSV file to Master Data (POST /imports/dpr-oee
 * or /imports/dpr-oee/csv, chosen by sourceType). Reuses the same commit
 * pipeline as the backend Excel importer — CSV Import Phase 1.
 */
export function commitDprOeeImport(
  file: File,
  plantId: string,
  sourceType: "excel" | "csv",
): Promise<DprOeeImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("plant_id", plantId);
  const path = sourceType === "csv" ? "/imports/dpr-oee/csv" : "/imports/dpr-oee";
  return apiUpload<DprOeeImportResult>(`${BASE}${path}`, formData);
}
