import { describe, expect, it } from "vitest";

import { buildRawMaterialDistributionOption } from "./RmHeatPlanAnalyticsPage";
import { buildManpowerComparisonOption } from "./ShiftManpowerAnalyticsPage";
import { buildHeatYieldOption, buildStageSummaryOption } from "./RawMaterialAnalyticsCharts";
import { buildMonthlyPlanOption, buildOrderBookOption } from "./OrderAnalyticsCharts";
import {
  buildBreakdownSeverityOption,
  buildDowntimeParetoOption,
  buildOeeBreakdownOption,
  buildReliabilityComparisonOption,
} from "./ReliabilityAnalyticsCharts";
import { buildQualityByWorkCenterOption } from "./QualityAnalyticsCharts";

describe("worksheet analytics chart options", () => {
  it("preserves missing raw-material values as chart gaps", () => {
    const option = buildRawMaterialDistributionOption([
      { name: "Customer A", rm_qty_mt: 12.5 },
      { name: "Customer B", rm_qty_mt: null },
    ]);

    expect(option.yAxis.data).toEqual(["Customer B", "Customer A"]);
    expect(option.series[0].data).toEqual([null, 12.5]);
    expect(option.xAxis.name).toBe("MT");
  });

  it("builds planned-versus-observed manpower series without zero-filling", () => {
    const option = buildManpowerComparisonOption([
      { name: "Machine 1", avg_planned: 3, avg_actual: 2 },
      { name: null, avg_planned: null, avg_actual: 1 },
    ]);

    expect(option.yAxis.data).toEqual(["Unnamed", "Machine 1"]);
    expect(option.series[0].data).toEqual([null, 3]);
    expect(option.series[1].data).toEqual([1, 2]);
    expect(option.xAxis.name).toBe("Headcount / shift");
  });

  it("builds order-book and monthly plan series with missing cells preserved", () => {
    const orderBook = buildOrderBookOption([
      { customer: "A", po_qty: 10, fy25_26_carryover: null, balance: 4, source_row_count: 1 },
    ]);
    const monthly = buildMonthlyPlanOption([
      { month: "Apr-26", production: 10, dispatch: null },
      { month: "Feb-27", production: null, dispatch: 5 },
    ]);

    expect(orderBook.series[1].data).toEqual([null]);
    expect(monthly.xAxis.data).toEqual(["Apr-26", "Feb-27"]);
    expect(monthly.series[1].data).toEqual([null, 5]);
  });

  it("preserves source gaps in stage and heat-yield visualizations", () => {
    const stages = buildStageSummaryOption([
      { group: "Bhushan", metrics: { plan_cut_bar_nos: 10, actual_forming_rej: null }, yield_vs_plan_fraction: null, source_row_count: 2 },
    ]);
    const yieldOption = buildHeatYieldOption([
      { heat_no: "H1", lot_no: "L1", yield_vs_plan_fraction: null },
      { heat_no: "H2", lot_no: "L2", yield_vs_plan_fraction: 0.8 },
    ]);

    expect(stages.series[0].data).toEqual([10]);
    expect(stages.series[6].data).toEqual([null]);
    expect(yieldOption.series[0].data).toEqual([null, 80]);
  });

  it("maps dedicated reliability tables without filling missing cells", () => {
    const records = [
      { row_number: 6, values: ["Breakdown", "10", "2", "50"] },
      { row_number: 25, values: ["Blank", "#N/A", "", "#N/A"] },
      { row_number: 30, values: ["Machine A", "4", "2", "2"] },
      { row_number: 49, values: ["Machine B", "#REF!", "1", ""] },
    ];
    const pareto = buildDowntimeParetoOption(records);
    const severity = buildBreakdownSeverityOption(records);
    const reliability = buildReliabilityComparisonOption(records, 30, 49, "MTTR", "Occurrences");

    expect(pareto.series[0].data[0]).toBe(10);
    expect(severity.series[0].data[1]).toBe(null);
    expect(reliability.series[0].data[1]).toBe(null);
  });

  it("maps OEE component percentages from the dedicated live table", () => {
    const option = buildOeeBreakdownOption([
      { row_number: 6, values: ["Packing", 90, 80, 95, 68] },
      { row_number: 14, values: ["MPI", "#N/A", 75, 92, "#REF!"] },
    ]);

    expect(option.series[0].data).toEqual([90, null]);
    expect(option.series[3].data).toEqual([68, null]);
  });

  it("maps dated-entry rejection fields and leaves blank template metrics empty", () => {
    const option = buildQualityByWorkCenterOption([
      {
        work_center: "Forming",
        op10_rejects_forming: { known_total: 4, known_value_count: 1, missing_value_count: 0 },
        op20_rejects_forming: { known_total: 0, known_value_count: 0, missing_value_count: 1 },
        op30_rejects_forming: { known_total: 2, known_value_count: 1, missing_value_count: 0 },
        rejects_other_ops: { known_total: 1, known_value_count: 1, missing_value_count: 0 },
        total_rejects: { known_total: 7, known_value_count: 1, missing_value_count: 0 },
        quality_fraction: { known_total: 0.9, known_value_count: 1, missing_value_count: 0 },
        source_row_count: 2,
      },
    ]);

    expect(option.series[0].data).toEqual([4]);
    expect(option.series[1].data).toEqual([null]);
    expect(option.series[3].data).toEqual([1]);
  });
});
