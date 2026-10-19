import { apiGet } from "../api/client";

export type LineTrackerWorksheet = {
  key: string;
  name: string;
  group: string;
  layout: "table" | "grid";
  header_row: number | null;
  status: "available" | "missing";
  worksheet_id: number | null;
  grid_row_count: number | null;
  grid_column_count: number | null;
};

export type LineTrackerWorksheetCatalog = {
  source: "google-sheets";
  spreadsheet_id: string;
  fetched_at: string;
  cache_hit: boolean;
  worksheets: LineTrackerWorksheet[];
  unconfigured_worksheets: Array<{ name: string | null; worksheet_id: number | null }>;
};

export type LineTrackerWorksheetRecord = {
  row_number: number;
  values: unknown[];
};

export type LineTrackerWorksheetResponse = {
  source: "google-sheets";
  spreadsheet_id: string;
  worksheet: Omit<LineTrackerWorksheet, "status">;
  headers: string[];
  records: LineTrackerWorksheetRecord[];
  record_count: number;
  filtered_record_count: number;
  page: number;
  page_size: number;
  page_count: number;
  fetched_at: string | null;
  cache_hit: boolean;
  is_stale: boolean;
  refresh_error: string | null;
  validation_warnings: string[];
};

export type PhaseTwoSourceState = {
  source: "google-sheets";
  spreadsheet_id: string;
  fetched_at: string | null;
  cache_hit: boolean;
  is_stale: boolean;
  refresh_error: string | null;
  sources: Record<
    string,
    {
      worksheet: string;
      worksheet_id: number | null;
      fetched_at: string | null;
      cache_hit: boolean;
      is_stale: boolean;
      refresh_error: string | null;
    }
  >;
};

export type MonthlyOrderPlanRow = {
  row_number: number;
  parent_row_number: number | null;
  po_number: string | null;
  parent_po_number: string | null;
  customer: string | null;
  part: string | null;
  po_date: string | null;
  po_quantity: number | null;
  dp_date: string | null;
  fy25_26_carryover: number | null;
  balance: number | null;
  source_type: string;
  month_values: Record<string, number | null>;
  month_total: number | null;
  grand_total: number | null;
  match_method: "exact" | "note_alias" | "unmatched" | "ambiguous";
  order_row_number: number | null;
};

export type ProductionOrderRow = {
  row_number: number;
  order_number: string | null;
  customer: string | null;
  order_date: string | null;
  order_quantity: number | null;
  part: string | null;
  dispatch_date: string | null;
  assigned_rm_heat: string | null;
  subsequent_lot: string | null;
  status: string | null;
  notes: string | null;
  rm_requirement_mt: number | null;
  explicit_real_po_alias: string | null;
  plan_link: {
    match_method: "exact" | "note_alias";
    plans: MonthlyOrderPlanRow[];
  } | null;
  plan_production_total: number | null;
  plan_dispatch_total: number | null;
};

export type PlanOverlapSummary = {
  plan_order_count: number;
  exact_match_count: number;
  note_alias_match_count: number;
  unmatched_count: number;
  ambiguous_count: number;
  unmatched_po_numbers: Array<string | null>;
  ambiguous_po_numbers: Array<string | null>;
};

export type OrderBookSummaryRow = {
  customer: string;
  po_qty: number | null;
  fy25_26_carryover: number | null;
  balance: number | null;
  source_row_count: number;
};

export type MonthlyPlanSummaryRow = {
  month: string;
  production: number | null;
  dispatch: number | null;
};

export type ProductionOrderAnalyticsResponse = PhaseTwoSourceState & {
  worksheet: Omit<LineTrackerWorksheet, "status">;
  requested_worksheet_key: "production-order" | "copy-of-production-order";
  duplicate_comparison: {
    status: "identical_live_values" | "distinct_snapshot";
    cell_values_equal: boolean;
    compared_nonempty_rows: number;
    primary_sheet_id: number | null;
    copy_sheet_id: number | null;
    combined_into_metrics: false;
  };
  summary: {
    order_count: number;
    status_counts: Record<string, number>;
    known_rm_requirement_count: number;
    known_rm_requirement_total_mt: number | null;
  };
  order_book_summary?: OrderBookSummaryRow[];
  monthly_plan_headers?: string[];
  monthly_plan_summary?: MonthlyPlanSummaryRow[];
  plan_overlap: PlanOverlapSummary;
  filter_options: {
    customers: string[];
    parts: string[];
    statuses: string[];
  };

  orders: ProductionOrderRow[];
  record_count: number;
  filtered_record_count: number;
  page: number;
  page_size: number;
  page_count: number;
  validation_warnings: string[];
};

export type MonthlyOrderPlanResponse = PhaseTwoSourceState & {
  worksheet: Omit<LineTrackerWorksheet, "status">;
  source_title: string | null;
  fiscal_period: string | null;
  month_headers: string[];
  normalized_month_headers?: string[];
  raw_month_headers?: string[];
  formula_summary: {
    source_total_order_qty: number | null;
    calculated_production_po_qty: number;
    formula_total_matches: boolean | null;
    warnings: string[];
  };
  plan_overlap: PlanOverlapSummary;
  filter_options: {
    customers: string[];
    parts: string[];
    types: string[];
  };
  plans: MonthlyOrderPlanRow[];
  order_book_summary?: OrderBookSummaryRow[];
  monthly_plan_summary?: MonthlyPlanSummaryRow[];
  record_count: number;
  filtered_record_count: number;
  page: number;
  page_size: number;
  page_count: number;
  validation_warnings: string[];
};

export type RawMaterialRow = {
  source_row: number;
  customer: string | null;
  supplier: string | null;
  heat_no: string | null;
  lot_no: string | null;
  rm_qty_mt: number | null;
  plan_cut_bar_nos: number | null;
  actual_bar_cropper_ok: number | null;
  actual_endbit_scrap: number | null;
  actual_acm_turning_ok: number | null;
  actual_acm_turning_rej: number | null;
  plan_clip_prod_nos: number | null;
  actual_forming_ok: number | null;
  actual_forming_rej: number | null;
  plan_final_supply_nos: number | null;
  yield_vs_plan_fraction: number | null;
  balance_reconciliation: number | null;
  source_batch: string | null;
  reference_status: "exact" | "incomplete_key" | "unmatched" | "ambiguous";
  reference_row_numbers: number[];
  computed_yield_fraction: number | null;
  yield_source_matches_calculation: boolean | null;
  has_actual_values: boolean;
};

export type HeatLotReferenceRow = {
  source_row: number;
  heat_no: string | null;
  lot_no: string | null;
  customer: string | null;
  supplier: string | null;
  rm_qty_mt: number | null;
  source_batch: string | null;
  plan_usage: "exact" | "incomplete_key" | "unmatched" | "ambiguous";
  plan_row_numbers: number[];
};

export type RawMaterialRelationshipSummary = {
  plan_record_count: number;
  reference_master_record_count: number;
  plan_complete_key_count: number;
  reference_complete_key_count: number;
  plan_incomplete_key_count: number;
  reference_incomplete_key_count: number;
  matched_pair_count: number;
  unmatched_plan_key_count: number;
  unmatched_plan_keys: Array<{ heat_no: string; lot_no: string }>;
  reference_only_key_count: number;
  reference_only_keys: Array<{ heat_no: string; lot_no: string }>;
  ambiguous_plan_key_count: number;
  ambiguous_plan_keys: Array<{ heat_no: string; lot_no: string }>;
  duplicate_plan_key_count: number;
  duplicate_reference_key_count: number;
  consistency_difference_count: number;
  consistency_differences: Array<{
    heat_no: string;
    lot_no: string;
    field: string;
    plan_value: string | number;
    reference_value: string | number;
  }>;
  crosswalk_entry_count: number;
  crosswalk_matched_key_count: number;
  crosswalk_unmatched_keys: Array<{ heat_no: string; lot_no: string }>;
  crosswalk_duplicate_keys: Array<{ heat_no: string; lot_no: string }>;
  reference_is_additive_with_plan: false;
};

export type RawMaterialSourceState = PhaseTwoSourceState & {
  worksheet: Omit<LineTrackerWorksheet, "status">;
  source_headers: string[];
  source_records: LineTrackerWorksheetRecord[];
  source_context_rows: LineTrackerWorksheetRecord[];
  source_record_count: number;
  record_count: number;
  filtered_record_count: number;
  page: number;
  page_size: number;
  page_count: number;
  relationship: RawMaterialRelationshipSummary;
  filter_options: {
    customers: string[];
    suppliers: string[];
    source_batches: string[];
  };
  validation_warnings: string[];
};

export type RawMaterialPlanAnalyticsResponse = RawMaterialSourceState & {
  records: RawMaterialRow[];
  metrics: {
    record_count: number;
    has_actual_values_count: number;
    metrics: Record<string, { total: number | null; record_count: number }>;
  };
  source_formula_reconciliation: Record<
    string,
    {
      source_formula_value: number | null;
      recomputed_value: number | null;
      matches: boolean | null;
    }
  >;
  yield_validation: {
    definition: string;
    source_formula_count: number;
    independently_recomputed_count: number;
    mismatch_count: number;
    mismatch_source_rows: number[];
  };
  customer_summary: Array<{
    name: string;
    record_count: number;
    rm_qty_mt: number | null;
    matched_pair_count: number;
  }>;
  supplier_summary: Array<{
    name: string;
    record_count: number;
    rm_qty_mt: number | null;
    matched_pair_count: number;
  }>;
  stage_summary_by_supplier?: RawMaterialStageSummary[];
  stage_summary_by_customer?: RawMaterialStageSummary[];
  heat_yield_series?: Array<{
    source_row: number;
    heat_no: string | null;
    lot_no: string | null;
    yield_vs_plan_fraction: number | null;
    reference_status: RawMaterialRow["reference_status"];
  }>;
};

export type RawMaterialStageSummary = {
  group: string;
  metrics: Record<string, number | null>;
  yield_vs_plan_fraction: number | null;
  source_row_count: number;
};

export type HeatLotReferenceAnalyticsResponse = RawMaterialSourceState & {
  records: HeatLotReferenceRow[];
};

export type MachineAssetSource = {
  worksheet: string;
  worksheet_id: number | null;
  fetched_at: string | null;
  cache_hit: boolean;
  is_stale: boolean;
  refresh_error: string | null;
};

export type MachineAssetBaseResponse = {
  source: "google-sheets";
  spreadsheet_id: string;
  fetched_at: string | null;
  cache_hit: boolean;
  is_stale: boolean;
  refresh_error: string | null;
  sources: Record<string, MachineAssetSource>;
  worksheet: Omit<LineTrackerWorksheet, "status">;
  source_headers: string[];
  source_records: LineTrackerWorksheetRecord[];
  source_context_rows: LineTrackerWorksheetRecord[];
  source_record_count: number;
  records: Array<
    MachineMasterRow | MachineConsumableRow | CapacityChangeRow | PlannedShutdownRow
  >;
  record_count: number;
  filtered_record_count: number;
  page: number;
  page_size: number;
  page_count: number;
  validation_warnings: string[];
};

export type MachineMasterRow = {
  source_row: number;
  work_center: string | null;
  machine: string | null;
  rated_ct_sec: number | null;
  status: string | null;
  notes: string | null;
  commissioning_date: string | null;
  manpower_per_shift: number | null;
  decommissioned_date: string | null;
  output_per_minute: number | null;
  hourly_capacity: number | null;
  shift_capacity: number | null;
  day_capacity: number | null;
  capacity_at_85_percent: number | null;
  source_capacity: Record<string, number | null>;
  capacity_formula_checks: Record<string, boolean | null>;
  capacity_validation: "verified" | "incomplete" | "mismatch";
};

export type MachineConsumableRow = {
  source_row: number;
  work_center: string | null;
  machine: string | null;
  consumable: string | null;
  category: string | null;
  change_frequency: string | null;
  last_changed_date: string | null;
  next_due_date: string | null;
  due_status: "missing" | "invalid" | "past date" | "dated";
  notes: string | null;
  machine_match: "matched" | "ambiguous" | "unmatched";
  machine_status: string | null;
  machine_source_row: number | null;
};

export type CapacityChangeRow = {
  source_row: number;
  date_changed: string | null;
  work_center: string | null;
  machine: string | null;
  old_rated_ct_sec: number | null;
  new_rated_ct_sec: number | null;
  reason_notes: string | null;
  classification: "example" | "confirmed" | "unverified";
  machine_match: "matched" | "ambiguous" | "unmatched";
  machine_source_row: number | null;
  percentage_change: number | null;
  date_valid: boolean;
  cycle_times_comparable: boolean;
};

export type PlannedShutdownRow = {
  source_row: number;
  start_date: string | null;
  end_date: string | null;
  scope: string | null;
  scope_detail: string | null;
  hours_affected_per_day: number | null;
  reason: string | null;
  notes: string | null;
  classification: "example" | "confirmed" | "unverified";
  date_range_valid: boolean;
  scope_valid: boolean;
  hours_valid: boolean;
  duration_days: number | null;
  estimated_hours: number | null;
  overlaps_source_rows: number[];
  linked_machine_keys: Array<{
    work_center: string;
    machine: string;
    source_row: number;
  }>;
  machine_link_status: string;
};

export type MachineMasterAnalyticsResponse = MachineAssetBaseResponse & {
  records: MachineMasterRow[];
  summary: {
    machine_count: number;
    unique_machine_key_count: number;
    duplicate_key_count: number;
    status_counts: Record<string, number>;
    capacity_validation_counts: Record<string, number>;
    formula_assumptions: {
      minutes_per_hour: number;
      hours_per_shift: number;
      shifts_per_day: number;
      rated_day_factor: number;
    };
  };
  filter_options: { work_centers: string[]; statuses: string[] };
};

export type MachineConsumablesAnalyticsResponse = MachineAssetBaseResponse & {
  records: MachineConsumableRow[];
  summary: {
    consumable_record_count: number;
    machine_key_match_count: number;
    missing_last_changed_date_count: number;
    missing_next_due_date_count: number;
    past_date_count: number;
  };
  filter_options: {
    work_centers: string[];
    categories: string[];
    due_statuses: string[];
  };
};

export type CapacityChangeAnalyticsResponse = MachineAssetBaseResponse & {
  records: CapacityChangeRow[];
  summary: { example_count: number; confirmed_count: number; unverified_count: number };
  filter_options: {
    classifications: string[];
    work_centers: string[];
    machines: string[];
  };
};

export type PlannedShutdownAnalyticsResponse = MachineAssetBaseResponse & {
  records: PlannedShutdownRow[];
  summary: {
    example_count: number;
    confirmed_count: number;
    unverified_count: number;
    valid_date_range_count: number;
    overlap_count: number;
    estimated_confirmed_hours: number | null;
  };
  filter_options: { classifications: string[]; scopes: string[] };
};

export type FormulaValidation = "match" | "mismatch" | "unverifiable";

export type ShiftEntryRow = {
  source_row: number;
  date: string | null;
  shift: string | null;
  shift_duration_min: number | null;
  source: string | null;
  work_center: string | null;
  machine: string | null;
  rated_ct_sec: number | null;
  output_qty: number | null;
  downtime_min: number | null;
  rejects_other_ops: number | null;
  actual_ct_sec: number | null;
  efficiency_fraction: number | null;
  status_vs_rated: string | null;
  downtime_category: string | null;
  breakdown_type: string | null;
  downtime_description: string | null;
  planned_shutdown_min: number | null;
  availability_fraction: number | null;
  performance_fraction: number | null;
  quality_fraction: number | null;
  oee_fraction: number | null;
  planned_manpower: number | null;
  actual_manpower: number | null;
  manpower_shortfall: number | null;
  rm_heat_number: string | null;
  bundle_number: string | null;
  lot_number: string | null;
  part: string | null;
  op10_rejects_forming: number | null;
  op20_rejects_forming: number | null;
  op30_rejects_forming: number | null;
  total_rejects: number | null;
  formula_derived_fields: string[];
  machine_match: "matched" | "incomplete_key" | "unmatched" | "ambiguous";
  heat_lot_match: "matched" | "incomplete_key" | "unmatched" | "ambiguous";
  heat_reference_row_numbers: number[];
  missing_fields: string[];
  record_status: "complete" | "incomplete";
  formula_validations: Record<string, FormulaValidation>;
  formula_unverified_fields: string[];
  actual_manpower_observed: boolean;
  is_dated_entry: boolean;
};

export type ShiftEntryMeasure = {
  known_total: number;
  known_value_count: number;
  missing_value_count: number;
};

export type ShiftEntrySummary = {
  entry_count: number;
  dated_entry_count: number;
  incomplete_entry_count: number;
  manpower_observation_count: number;
  output_qty: ShiftEntryMeasure;
  downtime_min: ShiftEntryMeasure;
  total_rejects: ShiftEntryMeasure;
  planned_manpower: ShiftEntryMeasure;
  actual_manpower: ShiftEntryMeasure;
  manpower_shortfall: ShiftEntryMeasure;
  formula_validations: Record<
    string,
    { match_count: number; mismatch_count: number; unverifiable_count: number }
  >;
  unmatched_machine_count: number;
  unmatched_heat_lot_count: number;
  machine_match_counts: Record<string, number>;
  heat_lot_match_counts: Record<string, number>;
};

export type ShiftEntriesAnalyticsResponse = PhaseTwoSourceState & {
  worksheet: Omit<LineTrackerWorksheet, "status">;
  source_headers: string[];
  source_record_count: number;
  formula_coverage: {
    first_source_row: number;
    last_source_row: number;
    formula_row_count: number;
    formula_fields: string[];
  };
  summary: ShiftEntrySummary;
  total_summary: ShiftEntrySummary;
  quality_summary_by_work_center?: Array<{
    work_center: string;
    op10_rejects_forming: ShiftEntryMeasure;
    op20_rejects_forming: ShiftEntryMeasure;
    op30_rejects_forming: ShiftEntryMeasure;
    rejects_other_ops: ShiftEntryMeasure;
    total_rejects: ShiftEntryMeasure;
    quality_fraction: ShiftEntryMeasure;
    source_row_count: number;
  }>;
  record_count: number;
  filtered_record_count: number;
  page: number;
  page_size: number;
  page_count: number;
  records: ShiftEntryRow[];
  filter_options: Record<string, string[]>;
  validation_warnings: string[];
};

export type RecomputedManpower = {
  avg_planned: number | null;
  avg_actual: number | null;
  total_shortfall: number;
  source_shifts_logged: number;
  dated_entry_count: number;
  entry_row_count: number;
  rated_manpower_per_shift: number | null;
  master_match: "matched" | "unmatched" | "ambiguous";
};

export type ManpowerSummaryRow = {
  source_row: number;
  name: string | null;
  rated_manpower_per_shift: number | null;
  avg_planned: number | null;
  avg_actual: number | null;
  total_shortfall: number | null;
  source_shifts_logged: number | null;
  recomputed: RecomputedManpower;
  formula_reconciliation: "matched" | "mismatched" | "unverifiable";
  rated_manpower_reconciliation: "matched" | "mismatched" | "unverifiable" | "not_applicable";
  entry_row_count: number;
  dated_entry_count: number;
  master_match: "matched" | "unmatched" | "ambiguous" | null;
};

export type ManpowerSummaryAnalyticsResponse = PhaseTwoSourceState & {
  worksheet: Omit<LineTrackerWorksheet, "status">;
  level: "machine" | "work-center";
  formula_coverage: {
    entry_source_first_row: number;
    entry_source_last_row: number;
    entry_source_rows: number;
    entry_rows_with_machine: number;
    dated_entry_count: number;
  };
  summary: {
    work_center_count: number;
    machine_count: number;
    work_center_reconciliation: { matched: number; mismatched: number; unverifiable: number };
    machine_reconciliation: { matched: number; mismatched: number; unverifiable: number };
    rated_manpower_mismatch_count: number;
    actual_manpower_observation_count: number;
    entry_count: number;
    dated_entry_count: number;
    undated_entry_count: number;
    source_shift_count_definition: string;
  };
  records: ManpowerSummaryRow[];
  record_count: number;
  filtered_record_count: number;
  page: number;
  page_size: number;
  page_count: number;
  filter_options: { levels: string[]; work_centers: string[]; machines: string[] };
  validation_warnings: string[];
};

export type DashboardKnownTotal = {
  total: number | null;
  known_count: number;
  missing_count: number;
};

export type DashboardDailyRow = {
  date: string;
  output_nos: number | null;
  output_known_count: number;
  output_missing_count: number;
  target_nos: number | null;
  target_known_count: number;
  target_missing_count: number;
  downtime_hours: number | null;
  downtime_known_count: number;
  downtime_missing_count: number;
  fill_fraction: number | null;
  source_record_count: number;
};

export type DashboardPeriodRow = {
  period: string;
  downtime_hours: number | null;
  downtime_known_count: number;
  downtime_missing_count: number;
  breakdown_hours: number | null;
  breakdown_known_count: number;
  target_nos: number | null;
  target_known_count: number;
  target_missing_count: number;
  actual_nos: number | null;
  actual_known_count: number;
  actual_missing_count: number;
  fill_fraction: number | null;
  approx_availability_fraction: number | null;
  source_record_count: number;
};

export type DashboardAnalyticsResponse = {
  source: "google-sheets";
  spreadsheet_id: string;
  fetched_at: string | null;
  cache_hit: boolean;
  is_stale: boolean;
  refresh_error: string | null;
  sources: Record<string, MachineAssetSource>;
  worksheet: Omit<LineTrackerWorksheet, "status">;
  validation_warnings: string[];
};

export type ProductionDashboardResponse = DashboardAnalyticsResponse & {
  date_from: string;
  date_to: string;
  source_window_days: number;
  latest_log_date: string;
  stage_filter: string | null;
  machine_filter: string | null;
  filter_options: { stages: string[]; machines: string[] };
  records: DashboardDailyRow[];
  missing_dates: string[];
  summary: {
    source_record_count: number;
    output_nos: DashboardKnownTotal;
    target_nos: DashboardKnownTotal;
    downtime_hours: DashboardKnownTotal;
    average_daily_fill_fraction: number | null;
    days_with_fill: number;
  };
  reconciliation: {
    source_daily_values_checked: number;
    mismatch_count: number;
    source_summary_values_checked: number;
    source_summary_mismatch_count: number;
  };
  data_quality: { mirror_rows_excluded: number; invalid_dates: number };
};

export type CapacityDashboardRow = {
  source_row: number;
  work_center: string;
  machine_count: number;
  rated_machine_count: number;
  effective_rated_ct_sec: number | null;
  source_machine_count: number | null;
  source_effective_rated_ct_sec: number | null;
  is_bottleneck: boolean;
  avg_actual_ct_sec?: number | null;
  actual_ct_count?: number;
  output_nos?: DashboardKnownTotal;
  total_rejects?: DashboardKnownTotal;
  avg_efficiency_fraction?: number | null;
  efficiency_count?: number;
  avg_availability_fraction?: number | null;
  availability_count?: number;
  entry_count?: number;
};

export type CapacityDashboardResponse = DashboardAnalyticsResponse & {
  records: CapacityDashboardRow[];
  summary: {
    registered_machines: number;
    active_rated_machines: number;
    machines_excluded_from_active_rated_capacity: number;
    theoretical_bottleneck_ct_sec: number | null;
    theoretical_output_pcs_per_hour: number | null;
    theoretical_output_pcs_per_12_hour_shift: number | null;
  };
  actual_performance: Record<string, Omit<CapacityDashboardRow, "source_row" | "work_center" | "machine_count" | "rated_machine_count" | "effective_rated_ct_sec" | "source_machine_count" | "source_effective_rated_ct_sec" | "is_bottleneck">>;
  reconciliation: { source_values_checked: number; mismatch_count: number };
  actual_performance_reconciliation: { source_values_checked: number; mismatch_count: number };
  data_quality: {
    capacity_formula_source_range: string;
    active_rated_machine_range_count: number;
    master_machine_count: number;
  };
};

export type DashboardSummaryResponse = DashboardAnalyticsResponse & {
  date_from: string;
  date_to: string;
  months: DashboardPeriodRow[];
  years: DashboardPeriodRow[];
  entry_availability_by_work_center: Record<
    string,
    { average_fraction: number | null; shift_count: number }
  >;
  missing_months: string[];
  reconciliation: {
    monthly: { values_checked: number; mismatch_count: number };
    yearly: { values_checked: number; mismatch_count: number };
  };
  data_quality: {
    mirror_rows_excluded: number;
    invalid_dates: number;
    november_2024_source_records: number;
    historical_record_count: number;
    date_range: { from: string; to: string };
    formula_zero_missing_downtime_periods: string[];
  };
};

type MachineAssetQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  workCenter?: string;
  status?: string;
  category?: string;
  dueStatus?: string;
  machine?: string;
  classification?: string;
  scope?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  refresh?: boolean;
};

function machineAssetQuery(options: MachineAssetQuery) {
  return {
    page: options.page ?? 1,
    page_size: options.pageSize ?? 20,
    search: options.search,
    work_center: options.workCenter,
    machine_status: options.status,
    category: options.category,
    due_status: options.dueStatus,
    machine: options.machine,
    classification: options.classification,
    scope: options.scope,
    sort_by: options.sortBy ?? "source_row",
    sort_order: options.sortOrder ?? "asc",
    refresh: options.refresh ? "true" : undefined,
  };
}

export function fetchMachineMasterAnalytics(
  options: MachineAssetQuery = {},
): Promise<MachineMasterAnalyticsResponse> {
  return apiGet("/api/v1/line-tracker/assets/machine-master", machineAssetQuery(options));
}

export function fetchMachineConsumablesAnalytics(
  options: MachineAssetQuery = {},
): Promise<MachineConsumablesAnalyticsResponse> {
  return apiGet("/api/v1/line-tracker/assets/machine-consumables", machineAssetQuery(options));
}

export function fetchCapacityChangeAnalytics(
  options: MachineAssetQuery = {},
): Promise<CapacityChangeAnalyticsResponse> {
  return apiGet("/api/v1/line-tracker/assets/capacity-change-log", machineAssetQuery(options));
}

export function fetchPlannedShutdownAnalytics(
  options: MachineAssetQuery = {},
): Promise<PlannedShutdownAnalyticsResponse> {
  return apiGet("/api/v1/line-tracker/assets/planned-shutdowns", machineAssetQuery(options));
}

export function fetchLineTrackerWorksheetCatalog(
  refresh = false,
): Promise<LineTrackerWorksheetCatalog> {
  return apiGet<LineTrackerWorksheetCatalog>("/api/v1/line-tracker/worksheets", {
    refresh: refresh ? "true" : undefined,
  });
}

export function fetchProductionOrderAnalytics(
  worksheetKey: "production-order" | "copy-of-production-order",
  options: {
    page?: number;
    pageSize?: number;
    search?: string;
    customer?: string;
    part?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    refresh?: boolean;
  } = {},
): Promise<ProductionOrderAnalyticsResponse> {
  return apiGet<ProductionOrderAnalyticsResponse>(
    "/api/v1/line-tracker/orders/analytics",
    {
      worksheet_key: worksheetKey,
      page: options.page ?? 1,
      page_size: options.pageSize ?? 20,
      search: options.search,
      customer: options.customer,
      part: options.part,
      order_status: options.status,
      sort_by: options.sortBy ?? "order_number",
      sort_order: options.sortOrder ?? "asc",
      refresh: options.refresh ? "true" : undefined,
    },
  );
}

export function fetchMonthlyOrderPlan(
  options: {
    page?: number;
    pageSize?: number;
    search?: string;
    customer?: string;
    part?: string;
    type?: string;
    month?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    refresh?: boolean;
  } = {},
): Promise<MonthlyOrderPlanResponse> {
  return apiGet<MonthlyOrderPlanResponse>(
    "/api/v1/line-tracker/orders/monthly-plan",
    {
      page: options.page ?? 1,
      page_size: options.pageSize ?? 20,
      search: options.search,
      customer: options.customer,
      part: options.part,
      source_type: options.type,
      month: options.month,
      sort_by: options.sortBy ?? "row_number",
      sort_order: options.sortOrder ?? "asc",
      refresh: options.refresh ? "true" : undefined,
    },
  );
}

type RawMaterialAnalyticsOptions = {
  page?: number;
  pageSize?: number;
  search?: string;
  customer?: string;
  supplier?: string;
  sourceBatch?: string;
  heatNo?: string;
  lotNo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  refresh?: boolean;
};

function rawMaterialQuery(options: RawMaterialAnalyticsOptions) {
  return {
    page: options.page ?? 1,
    page_size: options.pageSize ?? 20,
    search: options.search,
    customer: options.customer,
    supplier: options.supplier,
    source_batch: options.sourceBatch,
    heat_no: options.heatNo,
    lot_no: options.lotNo,
    sort_by: options.sortBy ?? "source_row",
    sort_order: options.sortOrder ?? "asc",
    refresh: options.refresh ? "true" : undefined,
  };
}

export function fetchRawMaterialPlanAnalytics(
  options: RawMaterialAnalyticsOptions = {},
): Promise<RawMaterialPlanAnalyticsResponse> {
  return apiGet<RawMaterialPlanAnalyticsResponse>(
    "/api/v1/line-tracker/raw-material/plan-actual",
    rawMaterialQuery(options),
  );
}

export function fetchHeatLotReferenceAnalytics(
  options: RawMaterialAnalyticsOptions = {},
): Promise<HeatLotReferenceAnalyticsResponse> {
  return apiGet<HeatLotReferenceAnalyticsResponse>(
    "/api/v1/line-tracker/raw-material/heat-lot-reference",
    rawMaterialQuery(options),
  );
}

export function fetchLineTrackerWorksheet(
  worksheetKey: string,
  options: {
    page?: number;
    pageSize?: number;
    search?: string;
    refresh?: boolean;
  } = {},
): Promise<LineTrackerWorksheetResponse> {
  return apiGet<LineTrackerWorksheetResponse>(
    `/api/v1/line-tracker/worksheets/${encodeURIComponent(worksheetKey)}`,
    {
      page: options.page ?? 1,
      page_size: options.pageSize ?? 50,
      search: options.search,
      refresh: options.refresh ? "true" : undefined,
    },
  );
}

export function fetchShiftEntriesAnalytics(
  options: {
    page?: number;
    pageSize?: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
    workCenter?: string;
    machine?: string;
    part?: string;
    source?: string;
    downtimeCategory?: string;
    breakdownType?: string;
    statusVsRated?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    refresh?: boolean;
  } = {},
): Promise<ShiftEntriesAnalyticsResponse> {
  return apiGet<ShiftEntriesAnalyticsResponse>(
    "/api/v1/line-tracker/operations/entries",
    {
      page: options.page ?? 1,
      page_size: options.pageSize ?? 20,
      search: options.search,
      date_from: options.dateFrom,
      date_to: options.dateTo,
      shift: options.shift,
      work_center: options.workCenter,
      machine: options.machine,
      part: options.part,
      source: options.source,
      downtime_category: options.downtimeCategory,
      breakdown_type: options.breakdownType,
      status_vs_rated: options.statusVsRated,
      sort_by: options.sortBy ?? "date",
      sort_order: options.sortOrder ?? "desc",
      refresh: options.refresh ? "true" : undefined,
    },
  );
}

export function fetchManpowerSummaryAnalytics(
  options: {
    level?: "machine" | "work-center";
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    refresh?: boolean;
  } = {},
): Promise<ManpowerSummaryAnalyticsResponse> {
  return apiGet<ManpowerSummaryAnalyticsResponse>(
    "/api/v1/line-tracker/operations/manpower-summary",
    {
      level: options.level ?? "machine",
      page: options.page ?? 1,
      page_size: options.pageSize ?? 20,
      search: options.search,
      sort_by: options.sortBy ?? "name",
      sort_order: options.sortOrder ?? "asc",
      refresh: options.refresh ? "true" : undefined,
    },
  );
}

export function fetchProductionDashboard(
  options: {
    dateFrom?: string;
    dateTo?: string;
    stage?: string;
    machine?: string;
    refresh?: boolean;
  } = {},
): Promise<ProductionDashboardResponse> {
  return apiGet<ProductionDashboardResponse>("/api/v1/line-tracker/dashboards/production", {
    date_from: options.dateFrom,
    date_to: options.dateTo,
    stage: options.stage,
    machine: options.machine,
    refresh: options.refresh ? "true" : undefined,
  });
}

export function fetchCapacityDashboard(
  refresh = false,
): Promise<CapacityDashboardResponse> {
  return apiGet<CapacityDashboardResponse>("/api/v1/line-tracker/dashboards/capacity", {
    refresh: refresh ? "true" : undefined,
  });
}

export function fetchDashboardSummary(
  options: { dateFrom?: string; dateTo?: string; refresh?: boolean } = {},
): Promise<DashboardSummaryResponse> {
  return apiGet<DashboardSummaryResponse>("/api/v1/line-tracker/dashboards/summary", {
    date_from: options.dateFrom,
    date_to: options.dateTo,
    refresh: options.refresh ? "true" : undefined,
  });
}
