/**
 * ERC Mk-V Line Tracker API Service.
 *
 * Provides typed REST access to the Line Tracker backend endpoints.
 */

import { buildApiUrl } from "../api/client";
import { readAccessToken } from "../auth/storage";

export interface LineTrackerWarning {
  code: string;
  severity: "warning" | "info" | "error";
  title: string;
  description: string;
  impact: string;
}

export interface LineTrackerSummary {
  source_type: string;
  source_notice: string;
  file_name: string;
  is_live_google_sheets?: boolean;
  last_modified?: string | null;
  google_sheet_id?: string | null;
  coverage_dates: {
    shift_entries: { min: string | null; max: string | null; count: number };
    historical_downtime: { min: string | null; max: string | null; count: number };
  };
  records_summary: {
    shift_entries_accepted: number;
    shift_entries_rejected: number;
    historical_downtime_accepted: number;
    mirrored_downtime_skipped: number;
    machines_count: number;
    work_centers_count: number;
    production_orders_count: number;
    rm_heats_count: number;
    rm_heat_yields_count: number;
  };
  oee_aggregate: {
    sum_planned_operating_time_min: number;
    sum_run_time_min: number;
    sum_downtime_min: number;
    sum_output_qty: number;
    sum_good_qty: number;
    component_weighted_availability: number | null;
    component_weighted_performance: number | null;
    component_weighted_quality: number | null;
    component_weighted_oee: number | null;
  };
  data_quality_warnings: LineTrackerWarning[];
  top_historical_downtime_categories: Array<{
    category: string;
    occurrences: number;
    total_minutes: number;
    total_hours: number;
  }>;
}

export interface LineTrackerShiftEntry {
  row_number: number;
  date: string;
  shift: string;
  shift_duration_min: number;
  work_center: string;
  machine: string;
  rated_ct_sec: number | null;
  output_qty: number;
  downtime_min: number | null;
  planned_shutdown_min: number;
  planned_operating_time_min: number;
  run_time_min: number;
  total_rejects: number;
  good_qty: number;
  actual_ct_sec: number | null;
  efficiency_rate: number | null;
  availability_rate: number | null;
  performance_rate: number | null;
  quality_rate: number | null;
  oee_rate: number | null;
  planned_manpower: number | null;
  actual_manpower: number | null;
  manpower_shortfall: number | null;
  rm_heat_number: string | null;
  bundle_number: string | null;
  lot_number: string | null;
  part: string;
  traceability_status: string;
}

export interface LineTrackerProductionOrder {
  po_date: string | null;
  order_number: string;
  customer: string;
  order_qty: number;
  part: string;
  dp_date: string | null;
  assigned_rm_heat_number: string | null;
  subsequent_lot_number: string | null;
  status: string;
  notes: string | null;
  rm_requirement_mt: number | null;
  traceability_status: string;
}

export interface LineTrackerMachine {
  work_center: string;
  machine: string;
  rated_ct_sec: number | null;
  status: string;
  commissioning_date: string | null;
  decommissioned_date: string | null;
  rated_manpower: number | null;
}

export interface LineTrackerHeatReference {
  heat_number: string;
  lot_number: string | null;
  customer: string | null;
  supplier: string | null;
  rm_qty_mt: number | null;
  source_batch: string | null;
}

export interface LineTrackerPpcOrder extends LineTrackerProductionOrder {
  produced_qty: number;
  outstanding_qty: number;
  completion_pct: number;
  fulfillment_status: string;
  risk_level: "critical" | "warning" | "nominal" | "info";
  risk_reasons: string[];
  production_source: string;
}

export interface LineTrackerPpcSummary {
  total_ordered_qty: number;
  total_produced_or_allocated_qty: number;
  total_outstanding_qty: number;
  overall_fulfillment_pct: number;
  orders_total_count: number;
  at_risk_orders_count: number;
  completed_orders_count: number;
  open_orders_count: number;
  snapshot_notice: string;
}

export interface LineTrackerMonthlyCalendarItem {
  month: string;
  planned_production: number;
  planned_dispatch: number;
  actual_production: number;
  production_gap: number;
  achievement_pct: number | null;
  has_actuals: boolean;
}

export interface LineTrackerOrderMonthlyPlan {
  po_number: string;
  customer: string;
  part: string;
  po_date: string | null;
  po_qty: number;
  dp_date: string | null;
  carryover: number | null;
  balance: number | null;
  production_months: Record<string, number>;
  dispatch_months: Record<string, number>;
  planned_production_total: number;
  planned_dispatch_total: number;
  has_monthly_phasing: boolean;
  is_stale_snapshot: boolean;
}

export interface LineTrackerMonthlyPlanResponse {
  metadata: {
    source_sheet: string;
    snapshot_notice: string;
    is_stale_snapshot: boolean;
  };
  monthly_calendar: LineTrackerMonthlyCalendarItem[];
  order_plans: LineTrackerOrderMonthlyPlan[];
}

export interface LineTrackerTraceabilityFunnel {
  total_billet_mt: number;
  total_bar_cropper_ok_nos: number;
  total_turning_ok_nos: number;
  total_forming_ok_nos: number;
  total_endbit_scrap_nos: number;
  overall_forming_yield_pct: number | null;
}

export interface LineTrackerTraceabilityHeat {
  customer: string | null;
  supplier: string | null;
  heat_number: string;
  lot_number: string | null;
  rm_qty_mt: number | null;
  plan_cut_bar_nos: number | null;
  actual_cut_bar_nos: number | null;
  actual_endbit_scrap_nos: number | null;
  actual_turning_ok_nos: number | null;
  actual_turning_rej_nos: number | null;
  plan_forming_ok_nos: number | null;
  actual_forming_ok_nos: number | null;
  actual_forming_rej_nos: number | null;
  plan_final_supply_nos: number | null;
  yield_vs_plan_pct: number | null;
  source_batch: string | null;
}

export interface LineTrackerTraceabilityAlert {
  heat_number: string;
  lot_number: string | null;
  reason: string;
  status: string;
}

export interface LineTrackerTraceabilityResponse {
  funnel_summary: LineTrackerTraceabilityFunnel;
  verified_heats_count: number;
  heats: LineTrackerTraceabilityHeat[];
  reconciliation_alerts: LineTrackerTraceabilityAlert[];
}

export interface LineTrackerSummary {
  source_type: string;
  source_notice: string;
  file_name: string;
  coverage_dates: {
    shift_entries: { min: string | null; max: string | null; count: number };
    historical_downtime: { min: string | null; max: string | null; count: number };
  };
  records_summary: {
    shift_entries_accepted: number;
    shift_entries_rejected: number;
    historical_downtime_accepted: number;
    mirrored_downtime_skipped: number;
    machines_count: number;
    work_centers_count: number;
    production_orders_count: number;
    rm_heats_count: number;
    rm_heat_yields_count: number;
  };
  oee_aggregate: {
    sum_planned_operating_time_min: number;
    sum_run_time_min: number;
    sum_downtime_min: number;
    sum_output_qty: number;
    sum_good_qty: number;
    component_weighted_availability: number | null;
    component_weighted_performance: number | null;
    component_weighted_quality: number | null;
    component_weighted_oee: number | null;
  };
  ppc_summary?: LineTrackerPpcSummary;
  data_quality_warnings: LineTrackerWarning[];
  top_historical_downtime_categories: Array<{
    category: string;
    occurrences: number;
    total_minutes: number;
    total_hours: number;
  }>;
}

const API_BASE = "/api/v1/line-tracker";

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const token = readAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function apiUrl(path: string): string {
  return buildApiUrl(`${API_BASE}${path}`);
}

export async function fetchLineTrackerSummary(refresh = false): Promise<LineTrackerSummary> {
  const url = `${API_BASE}/summary?refresh=${refresh ? "true" : "false"}`;
  const resp = await fetch(buildApiUrl(url), { headers: authHeaders() });
  if (!resp.ok) {
    throw new Error(`Failed to fetch line tracker summary: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export interface LineTrackerOeeSliceMetrics {
  count: number;
  sum_planned_operating_time_min: number;
  sum_run_time_min: number;
  sum_downtime_min: number;
  sum_output_qty: number;
  sum_good_qty: number;
  sum_reject_qty: number;
  rejection_rate_pct: number;
  sum_standard_time_sec: number;
  sum_speed_loss_min: number;
  speed_loss_hours: number;
  speed_loss_share_pct: number;
  weighted_rated_ct_sec: number | null;
  weighted_actual_ct_sec: number | null;
  cycle_compliance_pct: number | null;
  availability_pct: number | null;
  performance_pct: number | null;
  quality_pct: number | null;
  oee_pct: number | null;
}

export interface LineTrackerWorkCenterOee {
  work_center: string;
  metrics: LineTrackerOeeSliceMetrics;
  distinct_machines: string[];
  distinct_machines_count: number;
  underlying_rows: number[];
}

export interface LineTrackerMachineOee {
  machine: string;
  work_center: string;
  metrics: LineTrackerOeeSliceMetrics;
  rated_ct_sec: number | null;
  actual_ct_sec: number | null;
  speed_loss_status: string;
  underlying_rows: number[];
}

export interface LineTrackerShiftOee {
  shift: string;
  metrics: LineTrackerOeeSliceMetrics;
  underlying_rows: number[];
}

export interface LineTrackerSpeedLossPareto {
  machine: string;
  work_center: string;
  speed_loss_min: number;
  speed_loss_hours: number;
  speed_loss_share_pct: number;
  rated_ct_sec: number | null;
  actual_ct_sec: number | null;
  cycle_compliance_pct: number | null;
}

export interface LineTrackerCycleTimeAnalysis {
  total_operating_minutes: number;
  total_standard_producing_minutes: number;
  total_speed_loss_minutes: number;
  total_speed_loss_hours: number;
  overall_speed_loss_pct_of_runtime: number;
  overall_cycle_compliance_pct: number | null;
  slower_than_rated_count: number;
  nominal_or_faster_count: number;
  key_bottleneck_finding: string;
}

export interface LineTrackerOeeBreakdownResponse {
  filters_applied: {
    work_center: string;
    machine: string;
    shift: string;
    date_from: string | null;
    date_to: string | null;
  };
  overall: LineTrackerOeeSliceMetrics;
  work_centers: LineTrackerWorkCenterOee[];
  machines: LineTrackerMachineOee[];
  shifts: LineTrackerShiftOee[];
  speed_loss_pareto: LineTrackerSpeedLossPareto[];
  cycle_time_analysis: LineTrackerCycleTimeAnalysis;
  unlogged_catalog_machines: Array<{
    machine: string;
    work_center: string;
    rated_ct_sec: number | null;
    status: string;
    entries_logged: number;
    comment: string;
  }>;
  drilldown_records: LineTrackerShiftEntry[];
  formula_documentation: Record<string, string>;
}

export async function fetchLineTrackerEntries(
  paramsOrWorkCenter?: string | {
    workCenter?: string;
    machine?: string;
    shift?: string;
    dateFrom?: string;
    dateTo?: string;
    refresh?: boolean;
  },
  machineArg?: string
): Promise<{
  count: number;
  entries: LineTrackerShiftEntry[];
  oee_aggregate: LineTrackerOeeSliceMetrics;
}> {
  const query = new URLSearchParams();
  if (typeof paramsOrWorkCenter === "string") {
    if (paramsOrWorkCenter && paramsOrWorkCenter !== "All") query.set("work_center", paramsOrWorkCenter);
    if (machineArg && machineArg !== "All") query.set("machine", machineArg);
  } else if (paramsOrWorkCenter) {
    if (paramsOrWorkCenter.workCenter && paramsOrWorkCenter.workCenter !== "All") query.set("work_center", paramsOrWorkCenter.workCenter);
    if (paramsOrWorkCenter.machine && paramsOrWorkCenter.machine !== "All") query.set("machine", paramsOrWorkCenter.machine);
    if (paramsOrWorkCenter.shift && paramsOrWorkCenter.shift !== "All") query.set("shift", paramsOrWorkCenter.shift);
    if (paramsOrWorkCenter.dateFrom) query.set("date_from", paramsOrWorkCenter.dateFrom);
    if (paramsOrWorkCenter.dateTo) query.set("date_to", paramsOrWorkCenter.dateTo);
    if (paramsOrWorkCenter.refresh) query.set("refresh", "true");
  }

  const url = `${API_BASE}/entries${query.toString() ? `?${query.toString()}` : ""}`;
  const resp = await fetch(buildApiUrl(url), { headers: authHeaders() });
  if (!resp.ok) {
    throw new Error(`Failed to fetch line tracker entries: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function fetchLineTrackerOeeBreakdown(params?: {
  workCenter?: string;
  machine?: string;
  shift?: string;
  dateFrom?: string;
  dateTo?: string;
  refresh?: boolean;
  forceRefresh?: boolean;
}): Promise<LineTrackerOeeBreakdownResponse> {
  const query = new URLSearchParams();
  if (params?.workCenter && params.workCenter !== "All") query.set("work_center", params.workCenter);
  if (params?.machine && params.machine !== "All") query.set("machine", params.machine);
  if (params?.shift && params.shift !== "All") query.set("shift", params.shift);
  if (params?.dateFrom) query.set("date_from", params.dateFrom);
  if (params?.dateTo) query.set("date_to", params.dateTo);
  if (params?.refresh || params?.forceRefresh) query.set("refresh", "true");

  const url = `${API_BASE}/oee/breakdown?${query.toString()}`;
  const resp = await fetch(buildApiUrl(url), { headers: authHeaders() });
  if (!resp.ok) {
    throw new Error(`Failed to fetch Line Tracker OEE breakdown: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function fetchLineTrackerOrders(): Promise<{ count: number; orders: LineTrackerProductionOrder[] }> {
  const resp = await fetch(apiUrl("/orders"), { headers: authHeaders() });
  if (!resp.ok) {
    throw new Error(`Failed to fetch production orders: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function fetchLineTrackerPpcOrders(refresh = false): Promise<{
  count: number;
  orders: LineTrackerPpcOrder[];
  summary: LineTrackerPpcSummary;
}> {
  const url = `${API_BASE}/ppc/orders?refresh=${refresh ? "true" : "false"}`;
  const resp = await fetch(buildApiUrl(url), { headers: authHeaders() });
  if (!resp.ok) {
    throw new Error(`Failed to fetch PPC orders: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function fetchLineTrackerMonthlyPlan(refresh = false): Promise<LineTrackerMonthlyPlanResponse> {
  const url = `${API_BASE}/ppc/monthly-plan?refresh=${refresh ? "true" : "false"}`;
  const resp = await fetch(buildApiUrl(url), { headers: authHeaders() });
  if (!resp.ok) {
    throw new Error(`Failed to fetch PPC monthly plan: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function fetchLineTrackerTraceability(refresh = false): Promise<LineTrackerTraceabilityResponse> {
  const url = `${API_BASE}/ppc/traceability?refresh=${refresh ? "true" : "false"}`;
  const resp = await fetch(buildApiUrl(url), { headers: authHeaders() });
  if (!resp.ok) {
    throw new Error(`Failed to fetch PPC traceability: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function fetchLineTrackerMachines(): Promise<{ count: number; machines: LineTrackerMachine[] }> {
  const resp = await fetch(apiUrl("/machines"), { headers: authHeaders() });
  if (!resp.ok) {
    throw new Error(`Failed to fetch machines: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function fetchLineTrackerHeats(): Promise<{ count: number; heats: LineTrackerHeatReference[] }> {
  const resp = await fetch(apiUrl("/heats"), { headers: authHeaders() });
  if (!resp.ok) {
    throw new Error(`Failed to fetch heat reference catalog: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export interface LineTrackerCategoryParetoItem {
  category: string;
  total_minutes: number | null;
  total_hours: number | null;
  event_count: number;
  share_pct: number | null;
  cumulative_share_pct: number | null;
  average_duration_minutes: number | null;
  is_planned: boolean;
}

export interface LineTrackerMachineReliabilityItem {
  machine: string;
  stage: string;
  total_downtime_minutes: number | null;
  total_downtime_hours: number | null;
  event_count: number;
  downtime_share_pct: number | null;
  breakdown_event_count: number;
  breakdown_downtime_hours: number | null;
  breakdown_events_with_valid_duration: number;
  mttr_hours: number | null;
  mtbf_approx_hours: number | null;
  top_category: string;
}

export interface LineTrackerMonthlyTrendItem {
  month: string;
  downtime_hours: number | null;
  event_count: number;
  breakdown_event_count: number;
  breakdown_hours: number | null;
  has_data: boolean;
  has_duration_data?: boolean;
  note?: string;
}

export interface LineTrackerStageBreakdownItem {
  stage: string;
  total_hours: number | null;
  event_count: number;
  share_pct: number | null;
}

export interface LineTrackerShiftBreakdownItem {
  shift: string;
  total_hours: number | null;
  event_count: number;
  share_pct: number | null;
}

export interface LineTrackerHistoricalDowntimeRecord {
  row_number: number;
  date: string | null;
  month_year: string | null;
  shift: string;
  stage: string;
  machine: string;
  category: string;
  downtime_type: string;
  downtime_minutes: number | null;
  description: string | null;
  is_planned: boolean;
}

export interface LineTrackerReliabilitySummary {
  total_records: number;
  records_with_valid_duration?: number;
  records_without_valid_duration?: number;
  total_downtime_minutes: number | null;
  total_downtime_hours: number | null;
  planned_downtime_hours: number | null;
  planned_downtime_pct: number | null;
  unplanned_downtime_hours: number | null;
  unplanned_downtime_pct: number | null;
  breakdown_events_count: number;
  breakdown_events_with_valid_duration?: number;
  breakdown_downtime_hours: number | null;
  overall_mttr_hours: number | null;
  overall_mtbf_approx_hours: number | null;
  coverage_dates: {
    min: string | null;
    max: string | null;
    coverage_days: number;
    period_calendar_hours: number;
  };
  mirrored_rows_excluded: number;
  planned_classification_supported?: boolean;
  duration_metrics_available?: boolean;
}

export interface LineTrackerReliabilityResponse {
  source_type?: string;
  source_notice?: string;
  is_live_google_sheets?: boolean;
  last_modified?: string | null;
  filters_applied: {
    category: string;
    machine: string;
    stage: string;
    shift: string;
    date_from: string | null;
    date_to: string | null;
  };
  summary: LineTrackerReliabilitySummary;
  category_pareto: LineTrackerCategoryParetoItem[];
  machine_ranking: LineTrackerMachineReliabilityItem[];
  recurring_breakdown_insights: {
    frequent_failure_equipment: LineTrackerMachineReliabilityItem[];
    longest_repair_equipment: LineTrackerMachineReliabilityItem[];
  };
  monthly_trends: LineTrackerMonthlyTrendItem[];
  stage_breakdown: LineTrackerStageBreakdownItem[];
  shift_breakdown: LineTrackerShiftBreakdownItem[];
  data_quality_warnings: LineTrackerWarning[];
  drilldown_records_sample: LineTrackerHistoricalDowntimeRecord[];
  formula_documentation: Record<string, string>;
  worksheet?: string | null;
  worksheet_id?: number | null;
  source_headers?: string[] | null;
  used_range?: string | null;
  record_count?: number | null;
}

export interface LineTrackerHistoricalRecordsResponse {
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  records: LineTrackerHistoricalDowntimeRecord[];
}

export async function fetchLineTrackerReliability(params?: {
  category?: string;
  machine?: string;
  stage?: string;
  shift?: string;
  dateFrom?: string;
  dateTo?: string;
  source?: "local_excel" | "google_sheets";
  refresh?: boolean;
}): Promise<LineTrackerReliabilityResponse> {
  const query = new URLSearchParams();
  if (params?.category && params.category !== "All") query.set("category", params.category);
  if (params?.machine && params.machine !== "All") query.set("machine", params.machine);
  if (params?.stage && params.stage !== "All") query.set("stage", params.stage);
  if (params?.shift && params.shift !== "All") query.set("shift", params.shift);
  if (params?.dateFrom) query.set("date_from", params.dateFrom);
  if (params?.dateTo) query.set("date_to", params.dateTo);
  if (params?.source) query.set("source", params.source);
  if (params?.refresh) query.set("refresh", "true");

  const url = `${API_BASE}/reliability/pareto?${query.toString()}`;
  const resp = await fetch(buildApiUrl(url), { headers: authHeaders() });
  if (!resp.ok) {
    throw new Error(`Failed to fetch Line Tracker reliability: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function fetchLineTrackerHistoricalRecords(params?: {
  category?: string;
  machine?: string;
  stage?: string;
  shift?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  source?: "local_excel" | "google_sheets";
  refresh?: boolean;
}): Promise<LineTrackerHistoricalRecordsResponse> {
  const query = new URLSearchParams();
  if (params?.category && params.category !== "All") query.set("category", params.category);
  if (params?.machine && params.machine !== "All") query.set("machine", params.machine);
  if (params?.stage && params.stage !== "All") query.set("stage", params.stage);
  if (params?.shift && params.shift !== "All") query.set("shift", params.shift);
  if (params?.dateFrom) query.set("date_from", params.dateFrom);
  if (params?.dateTo) query.set("date_to", params.dateTo);
  if (params?.search) query.set("search", params.search);
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("page_size", String(params.pageSize));
  if (params?.source) query.set("source", params.source);
  if (params?.refresh) query.set("refresh", "true");

  const url = `${API_BASE}/reliability/records?${query.toString()}`;
  const resp = await fetch(buildApiUrl(url), { headers: authHeaders() });
  if (!resp.ok) {
    throw new Error(`Failed to fetch Line Tracker historical records: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

