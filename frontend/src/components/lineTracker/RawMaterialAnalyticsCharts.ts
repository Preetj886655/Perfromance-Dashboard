import type { RawMaterialStageSummary } from "../../services/lineTrackerWorksheetsApi";

export const RAW_MATERIAL_STAGE_FIELDS = [
  ["plan_cut_bar_nos", "Plan: Cut Bar"],
  ["actual_bar_cropper_ok", "Bar Cropper OK"],
  ["actual_endbit_scrap", "Endbit Scrap"],
  ["actual_acm_turning_ok", "ACM/Turning OK"],
  ["actual_acm_turning_rej", "ACM/Turning REJ"],
  ["plan_clip_prod_nos", "Plan: Clip Prod"],
  ["actual_forming_ok", "Forming OK"],
  ["actual_forming_rej", "Forming REJ"],
  ["plan_final_supply_nos", "Plan: Final Supply"],
] as const;

export function buildStageSummaryOption(rows: RawMaterialStageSummary[]) {
  return {
    tooltip: { trigger: "axis" },
    legend: { data: RAW_MATERIAL_STAGE_FIELDS.map(([, label]) => label) },
    grid: { left: 72, right: 28, top: 64, bottom: 56 },
    xAxis: { type: "category", data: rows.map((row) => row.group), axisLabel: { rotate: 25 } },
    yAxis: { type: "value", name: "NOS" },
    series: RAW_MATERIAL_STAGE_FIELDS.map(([field, name]) => ({
      name,
      type: "bar",
      data: rows.map((row) => row.metrics[field] ?? null),
    })),
  };
}

export function buildHeatYieldOption(
  rows: Array<{ heat_no: string | null; lot_no: string | null; yield_vs_plan_fraction: number | null }>,
) {
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 72, right: 28, top: 24, bottom: 72 },
    xAxis: {
      type: "category",
      data: rows.map((row) => `${row.heat_no ?? "Unknown"} / ${row.lot_no ?? "Unknown"}`),
      axisLabel: { rotate: 45 },
    },
    yAxis: { type: "value", name: "Yield vs plan %", axisLabel: { formatter: "{value}%" } },
    series: [{
      name: "Yield vs Plan %",
      type: "line",
      connectNulls: false,
      data: rows.map((row) => row.yield_vs_plan_fraction === null ? null : row.yield_vs_plan_fraction * 100),
    }],
  };
}
