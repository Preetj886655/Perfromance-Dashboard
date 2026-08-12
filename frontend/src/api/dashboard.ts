/**
 * Dashboard OEE API client — thin wrappers over existing /api/v1/dashboard/* routes.
 * Presentation layer only; no OEE recalculation.
 */

import { apiGet } from "./client";
import type {
  LineOption,
  MachineOption,
  OeeBreakdown,
  OeeSnapshot,
  OeeSnapshotList,
  OperatorOption,
  PartOption,
  PeriodType,
  PlantOption,
  ScopeType,
  ShiftOption,
} from "../types/dashboard";

const BASE = "/api/v1/dashboard";

export type ScopePeriodQuery = {
  scope_type: ScopeType;
  scope_id: string;
  period_type: PeriodType;
  period_start: string;
  aggregation_rule_version?: number;
};

export function fetchOee(q: ScopePeriodQuery): Promise<OeeSnapshot> {
  return apiGet<OeeSnapshot>(`${BASE}/oee`, {
    scope_type: q.scope_type,
    scope_id: q.scope_id,
    period_type: q.period_type,
    period_start: q.period_start,
    aggregation_rule_version: q.aggregation_rule_version,
  });
}

export function fetchOeeSummary(params: {
  scope_type: ScopeType;
  scope_id: string;
  period_type?: PeriodType;
  aggregation_rule_version?: number;
}): Promise<OeeSnapshot> {
  return apiGet<OeeSnapshot>(`${BASE}/oee/summary`, {
    scope_type: params.scope_type,
    scope_id: params.scope_id,
    period_type: params.period_type,
    aggregation_rule_version: params.aggregation_rule_version,
  });
}

export function fetchOeeTrend(params: {
  scope_type: ScopeType;
  scope_id: string;
  period_type: PeriodType;
  period_start_from: string;
  period_start_to: string;
  aggregation_rule_version?: number;
}): Promise<OeeSnapshotList> {
  return apiGet<OeeSnapshotList>(`${BASE}/oee/trend`, {
    scope_type: params.scope_type,
    scope_id: params.scope_id,
    period_type: params.period_type,
    period_start_from: params.period_start_from,
    period_start_to: params.period_start_to,
    aggregation_rule_version: params.aggregation_rule_version,
  });
}

export function fetchOeeBreakdown(q: ScopePeriodQuery): Promise<OeeBreakdown> {
  return apiGet<OeeBreakdown>(`${BASE}/oee/breakdown`, {
    scope_type: q.scope_type,
    scope_id: q.scope_id,
    period_type: q.period_type,
    period_start: q.period_start,
    aggregation_rule_version: q.aggregation_rule_version,
  });
}

export function fetchOeeMachines(params: {
  plant_id: string;
  period_type: PeriodType;
  period_start: string;
  aggregation_rule_version?: number;
}): Promise<OeeSnapshotList> {
  return apiGet<OeeSnapshotList>(`${BASE}/oee/machines`, {
    plant_id: params.plant_id,
    period_type: params.period_type,
    period_start: params.period_start,
    aggregation_rule_version: params.aggregation_rule_version,
  });
}

export function fetchOeeLines(params: {
  plant_id: string;
  period_type: PeriodType;
  period_start: string;
  aggregation_rule_version?: number;
}): Promise<OeeSnapshotList> {
  return apiGet<OeeSnapshotList>(`${BASE}/oee/lines`, {
    plant_id: params.plant_id,
    period_type: params.period_type,
    period_start: params.period_start,
    aggregation_rule_version: params.aggregation_rule_version,
  });
}

export function fetchOeePlants(params: {
  period_type: PeriodType;
  period_start: string;
  plant_id?: string;
  aggregation_rule_version?: number;
}): Promise<OeeSnapshotList> {
  return apiGet<OeeSnapshotList>(`${BASE}/oee/plants`, {
    period_type: params.period_type,
    period_start: params.period_start,
    plant_id: params.plant_id,
    aggregation_rule_version: params.aggregation_rule_version,
  });
}

export function fetchPlants(): Promise<{ items: PlantOption[]; count: number }> {
  return apiGet<{ items: PlantOption[]; count: number }>("/api/v1/plants");
}

export function fetchLines(params: { plant_id?: string }): Promise<{ items: LineOption[]; count: number }> {
  return apiGet<{ items: LineOption[]; count: number }>("/api/v1/lines", {
    plant_id: params.plant_id,
  });
}

export function fetchMachines(params: { line_id?: string; plant_id?: string }): Promise<{ items: MachineOption[]; count: number }> {
  return apiGet<{ items: MachineOption[]; count: number }>("/api/v1/machines", {
    line_id: params.line_id,
    plant_id: params.plant_id,
  });
}

export function fetchParts(): Promise<{ items: PartOption[]; count: number }> {
  return apiGet<{ items: PartOption[]; count: number }>("/api/v1/parts");
}

export function fetchShifts(): Promise<{ items: ShiftOption[]; count: number }> {
  return apiGet<{ items: ShiftOption[]; count: number }>("/api/v1/shifts");
}

export function fetchOperators(): Promise<{ items: OperatorOption[]; count: number }> {
  return apiGet<{ items: OperatorOption[]; count: number }>("/api/v1/operators");
}
