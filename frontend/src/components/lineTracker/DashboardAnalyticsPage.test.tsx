import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CapacityDashboardView,
  DashboardAnalyticsPage,
  ProductionDashboardView,
  SummaryDashboardView,
  type DashboardLoadState,
} from "./DashboardAnalyticsPage";
import type {
  CapacityDashboardResponse,
  DashboardSummaryResponse,
  ProductionDashboardResponse,
} from "../../services/lineTrackerWorksheetsApi";

vi.mock("echarts-for-react", async () => {
  const React = await import("react");
  return {
    default: ({ option }: { option: Record<string, unknown> }) => {
      const series = (option.series ?? []) as Array<{ name?: string; data?: unknown[] }>;
      const xAxis = option.xAxis as { data?: unknown[] } | undefined;
      const description = series
        .map((item) => `${item.name ?? "series"}=${JSON.stringify(item.data ?? [])}`)
        .join("|");
      return React.createElement(
        "div",
        { "data-testid": "echarts" },
        `categories=${JSON.stringify(xAxis?.data ?? [])}|${description}`,
      );
    },
  };
});

const source = {
  worksheet: "Machine Master",
  worksheet_id: 1022871279,
  fetched_at: "2026-10-18T05:00:00Z",
  cache_hit: false,
  is_stale: false,
  refresh_error: null,
};

function responseState<T extends ProductionDashboardResponse | CapacityDashboardResponse | DashboardSummaryResponse>(
  data: T | null,
  options: { loading?: boolean; error?: string | null } = {},
): DashboardLoadState<T> {
  return createState<T>(data, options);
}

function createState<T extends ProductionDashboardResponse | CapacityDashboardResponse | DashboardSummaryResponse>(
  data: T | null,
  options: { loading?: boolean; error?: string | null } = {},
): DashboardLoadState<T> {
  return {
    data,
    loading: options.loading ?? false,
    refreshing: false,
    error: options.error ?? null,
    load: async () => undefined,
    loadWith: async () => undefined,
  };
}

function render(element: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(element);
}

const productionData: ProductionDashboardResponse = {
  source: "google-sheets",
  spreadsheet_id: "test-spreadsheet",
  fetched_at: "2026-10-18T05:00:00Z",
  cache_hit: false,
  is_stale: false,
  refresh_error: null,
  sources: {},
  worksheet: {
    key: "production-dashboard",
    name: "Production Dashboard",
    group: "Dashboards",
    layout: "grid",
    header_row: 7,
    worksheet_id: 1905823832,
    grid_row_count: 10,
    grid_column_count: 6,
  },
  validation_warnings: [],
  date_from: "2026-10-17",
  date_to: "2026-10-18",
  source_window_days: 2,
  latest_log_date: "2026-10-18",
  stage_filter: null,
  machine_filter: null,
  filter_options: { stages: ["Forming"], machines: ["Press 1"] },
  records: [
    {
      date: "2026-10-17",
      output_nos: 120,
      output_known_count: 1,
      output_missing_count: 0,
      target_nos: 150,
      target_known_count: 1,
      target_missing_count: 0,
      downtime_hours: 0.5,
      downtime_known_count: 1,
      downtime_missing_count: 0,
      fill_fraction: 0.8,
      source_record_count: 1,
    },
    {
      date: "2026-10-18",
      output_nos: null,
      output_known_count: 0,
      output_missing_count: 1,
      target_nos: 140,
      target_known_count: 1,
      target_missing_count: 0,
      downtime_hours: null,
      downtime_known_count: 0,
      downtime_missing_count: 1,
      fill_fraction: null,
      source_record_count: 1,
    },
  ],
  missing_dates: [],
  summary: {
    source_record_count: 2,
    output_nos: { total: 120, known_count: 1, missing_count: 1 },
    target_nos: { total: 290, known_count: 2, missing_count: 0 },
    downtime_hours: { total: 0.5, known_count: 1, missing_count: 1 },
    average_daily_fill_fraction: 0.8,
    days_with_fill: 1,
  },
  reconciliation: {
    source_daily_values_checked: 0,
    mismatch_count: 0,
    source_summary_values_checked: 0,
    source_summary_mismatch_count: 0,
  },
  data_quality: { mirror_rows_excluded: 0, invalid_dates: 0 },
};

const capacityData: CapacityDashboardResponse = {
  source: "google-sheets",
  spreadsheet_id: "test-spreadsheet",
  fetched_at: "2026-10-18T05:00:00Z",
  cache_hit: false,
  is_stale: false,
  refresh_error: null,
  sources: {},
  worksheet: {
    key: "dashboard",
    name: "Dashboard",
    group: "Dashboards",
    layout: "grid",
    header_row: 5,
    worksheet_id: 1047718776,
    grid_row_count: 14,
    grid_column_count: 4,
  },
  validation_warnings: [],
  records: [
    {
      source_row: 6,
      work_center: "Forming",
      machine_count: 3,
      rated_machine_count: 2,
      effective_rated_ct_sec: 12,
      source_machine_count: 2,
      source_effective_rated_ct_sec: 12,
      is_bottleneck: true,
    },
    {
      source_row: 7,
      work_center: "Inspection",
      machine_count: 1,
      rated_machine_count: 0,
      effective_rated_ct_sec: null,
      source_machine_count: null,
      source_effective_rated_ct_sec: null,
      is_bottleneck: false,
    },
  ],
  summary: {
    registered_machines: 4,
    active_rated_machines: 2,
    machines_excluded_from_active_rated_capacity: 2,
    theoretical_bottleneck_ct_sec: 12,
    theoretical_output_pcs_per_hour: 300,
    theoretical_output_pcs_per_12_hour_shift: 3600,
  },
  actual_performance: {},
  reconciliation: { source_values_checked: 0, mismatch_count: 0 },
  actual_performance_reconciliation: { source_values_checked: 0, mismatch_count: 0 },
  data_quality: {
    capacity_formula_source_range: "Machine Master rows 2–28",
    active_rated_machine_range_count: 2,
    master_machine_count: 4,
  },
};

function periodRow(
  period: string,
  actual: number | null,
  target: number | null,
): DashboardSummaryResponse["months"][number] {
  const actualKnown = actual === null ? 0 : 1;
  const targetKnown = target === null ? 0 : 1;
  return {
    period,
    downtime_hours: null,
    downtime_known_count: 0,
    downtime_missing_count: 1,
    breakdown_hours: null,
    breakdown_known_count: 0,
    target_nos: target,
    target_known_count: targetKnown,
    target_missing_count: 1 - targetKnown,
    actual_nos: actual,
    actual_known_count: actualKnown,
    actual_missing_count: 1 - actualKnown,
    fill_fraction: null,
    approx_availability_fraction: null,
    source_record_count: 1,
  };
}

const summaryData: DashboardSummaryResponse = {
  source: "google-sheets",
  spreadsheet_id: "test-spreadsheet",
  fetched_at: "2026-10-18T05:00:00Z",
  cache_hit: false,
  is_stale: false,
  refresh_error: null,
  sources: {},
  worksheet: {
    key: "summary",
    name: "Summary",
    group: "Dashboards",
    layout: "grid",
    header_row: 5,
    worksheet_id: 311599185,
    grid_row_count: 20,
    grid_column_count: 7,
  },
  validation_warnings: [],
  date_from: "2025-01-01",
  date_to: "2025-02-28",
  months: [periodRow("2025-01", 1100, 1300), periodRow("2025-02", null, 1250)],
  years: [periodRow("2025", 1100, 2550)],
  entry_availability_by_work_center: {},
  missing_months: [],
  reconciliation: {
    monthly: { values_checked: 0, mismatch_count: 0 },
    yearly: { values_checked: 0, mismatch_count: 0 },
  },
  data_quality: {
    mirror_rows_excluded: 0,
    invalid_dates: 0,
    november_2024_source_records: 0,
    historical_record_count: 2,
    date_range: { from: "2025-01-01", to: "2025-02-28" },
    formula_zero_missing_downtime_periods: ["2024-12", "2025-08"],
  },
};

describe("Phase 6 dashboard visualizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders capacity charts from rated-machine counts and effective rated CT", () => {
    const html = render(createElement(CapacityDashboardView, {
      state: responseState(capacityData),
    }));

    expect(html).toContain("Rated-machine coverage by work center");
    expect(html).toContain("Active rated machines=[0,2]");
    expect(html).toContain("Effective rated CT (sec)=[12]");
    expect(html).toContain("Inspection");
    expect(html).toContain("omitted from the cycle-time chart, not plotted as zero");
    expect(html).toContain("not an output rate or actual production measure");
    expect(html).toContain("A comparable per-work-center output-rate chart is therefore not shown.");
  });

  it("shows explicit empty capacity-chart states when there are no work centers", () => {
    const emptyCapacity: CapacityDashboardResponse = {
      ...capacityData,
      records: [],
    };
    const html = render(createElement(CapacityDashboardView, {
      state: responseState(emptyCapacity),
    }));

    expect(html).toContain("No valid rated-machine counts are available.");
    expect(html).toContain("No work centers have a valid effective rated cycle time.");
    expect(html).not.toContain("data-testid=\"echarts\"");
  });

  it("excludes invalid non-positive cycle times instead of plotting them", () => {
    const invalidCycleTimes: CapacityDashboardResponse = {
      ...capacityData,
      records: capacityData.records.map((row) => ({
        ...row,
        effective_rated_ct_sec: -1,
      })),
    };
    const html = render(createElement(CapacityDashboardView, {
      state: responseState(invalidCycleTimes),
    }));

    expect(html).toContain("No work centers have a valid effective rated cycle time.");
    expect(html).toContain("Forming, Inspection");
    expect(html).not.toContain("Effective rated CT (sec)=");
  });

  it("renders Summary actual-versus-target NOS while preserving missing values as chart gaps", () => {
    const html = render(createElement(SummaryDashboardView, {
      state: responseState(summaryData),
    }));

    expect(html).toContain("Monthly actual production vs target");
    expect(html).toContain("Actual NOS=[1100,null]");
    expect(html).toContain("Target NOS=[1300,1250]");
    expect(html).toContain("Source values are reported in NOS");
    expect(html).toContain("2024-12, 2025-08");
    expect(html).toContain("Approx. Availability are shown as unavailable");
    expect(html).toContain("Downtime (hrs)");
    expect(html).toContain("Breakdown (hrs)");
  });

  it("keeps the Summary production chart visible with null target gaps", () => {
    const unavailableSummary: DashboardSummaryResponse = {
      ...summaryData,
      months: [periodRow("2025-01", 1100, null)],
    };
    const html = render(createElement(SummaryDashboardView, {
      state: responseState(unavailableSummary),
    }));

    expect(html).toContain("Monthly actual production vs target");
    expect(html).toContain("Actual NOS=");
    expect(html).toContain("Monthly downtime trend");
  });

  it("uses Production API dates and output/target fields and leaves missing values as gaps", () => {
    const html = render(createElement(ProductionDashboardView, {
      state: responseState(productionData),
    }));

    expect(html).toContain("Daily output vs target");
    expect(html).toContain("Output NOS=[120,null]");
    expect(html).toContain("Target NOS=[150,140]");
    expect(html).toContain('categories=[&quot;2026-10-17&quot;,&quot;2026-10-18&quot;]');
    expect(html).toContain("2026-10-17");
    expect(html).toContain("2026-10-18");
    expect(html).toContain("Missing targets or durations remain missing");
  });

  it("shows loading, API error, and stale-source states without hiding source warnings", () => {
    const loadingHtml = render(createElement(ProductionDashboardView, {
      state: responseState<ProductionDashboardResponse>(null, { loading: true }),
    }));
    expect(loadingHtml).toContain("Loading Production Dashboard");

    const staleData: ProductionDashboardResponse = {
      ...productionData,
      is_stale: true,
      refresh_error: "Source refresh failed",
      sources: {
        downtime_log: {
          ...source,
          worksheet: "Downtime Log",
          worksheet_id: 499436166,
          is_stale: true,
          refresh_error: "Source refresh failed",
        },
      },
    };
    const staleErrorHtml = render(createElement(ProductionDashboardView, {
      state: responseState(staleData, { error: "API request failed" }),
    }));
    expect(staleErrorHtml).toContain("Source refresh failed; the displayed values may be stale.");
    expect(staleErrorHtml).toContain("Source refresh failed");
    expect(staleErrorHtml).toContain("API request failed");
    expect(staleErrorHtml).toContain("Daily output vs target");
  });

  it("shows an explicit empty production state and does not render an empty chart", () => {
    const emptyProduction: ProductionDashboardResponse = {
      ...productionData,
      records: [],
    };
    const html = render(createElement(ProductionDashboardView, {
      state: responseState(emptyProduction),
    }));

    expect(html).toContain("No records match these filters.");
    expect(html).not.toContain("data-testid=\"echarts\"");
  });

  it("dispatches all three Phase 6 dashboard keys to their dedicated page views", () => {
    const productionHtml = render(createElement(DashboardAnalyticsPage, {
      pageKey: "production-dashboard",
    }));
    const capacityHtml = render(createElement(DashboardAnalyticsPage, {
      pageKey: "dashboard",
    }));
    const summaryHtml = render(createElement(DashboardAnalyticsPage, {
      pageKey: "summary",
    }));

    expect(productionHtml).toContain("Loading Production Dashboard");
    expect(capacityHtml).toContain("Loading Dashboard");
    expect(summaryHtml).toContain("Loading Summary");
  });
});
