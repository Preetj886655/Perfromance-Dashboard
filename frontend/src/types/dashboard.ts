/** Types matching backend `app.api.schemas.dashboard` (OeeSnapshotResponse / Breakdown / List). */

export type ScopeType = "plant" | "line" | "machine";
export type PeriodType = "day" | "week" | "month";

export type OeeSnapshot = {
  id: string;
  scope_type: ScopeType | string;
  scope_id: string;
  period_type: PeriodType | string;
  period_start: string;
  sum_run_time_min: number;
  sum_available_time_min: number;
  sum_produced_qty: number;
  sum_good_qty: number;
  sum_rejection_qty: number;
  sum_run_based_capacity: number;
  availability: number;
  performance: number;
  /** Always null at snapshot grain from API — never coerce to 0. */
  machine_utilisation: number | null;
  quality: number;
  oee: number;
  aggregation_rule_version: number;
  computed_at: string;
};

export type OeeBreakdown = {
  scope_type: ScopeType | string;
  scope_id: string;
  period_type: PeriodType | string;
  period_start: string;
  availability: number;
  performance: number;
  machine_utilisation: number | null;
  quality: number;
  oee: number;
  sum_run_time_min: number;
  sum_available_time_min: number;
  sum_produced_qty: number;
  sum_good_qty: number;
  sum_rejection_qty: number;
  sum_run_based_capacity: number;
  aggregation_rule_version: number;
  computed_at: string;
};

export type OeeSnapshotList = {
  items: OeeSnapshot[];
  count: number;
};

export type DashboardFilters = {
  scope_type: ScopeType;
  scope_id: string;
  period_type: PeriodType;
  period_start: string;
};

export type ApiError = {
  status: number;
  message: string;
};