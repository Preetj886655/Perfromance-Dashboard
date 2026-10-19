import type { ShiftEntriesAnalyticsResponse } from "../../services/lineTrackerWorksheetsApi";

type QualityRow = NonNullable<ShiftEntriesAnalyticsResponse["quality_summary_by_work_center"]>[number];

export function buildQualityByWorkCenterOption(rows: QualityRow[]) {
  const measure = (row: QualityRow, key: keyof QualityRow) => {
    const value = row[key];
    return typeof value === "object" && value !== null && "known_total" in value
      ? value.known_value_count > 0 ? value.known_total : null
      : null;
  };
  return {
    tooltip: { trigger: "axis" },
    legend: { data: ["OP10", "OP20", "OP30", "Other Ops"] },
    grid: { left: 130, right: 28, top: 44, bottom: 56 },
    xAxis: { type: "category", data: rows.map((row) => row.work_center), axisLabel: { rotate: 25 } },
    yAxis: { type: "value", name: "Rejects (source count)" },
    series: [
      { name: "OP10", type: "bar", data: rows.map((row) => measure(row, "op10_rejects_forming")) },
      { name: "OP20", type: "bar", data: rows.map((row) => measure(row, "op20_rejects_forming")) },
      { name: "OP30", type: "bar", data: rows.map((row) => measure(row, "op30_rejects_forming")) },
      { name: "Other Ops", type: "bar", data: rows.map((row) => measure(row, "rejects_other_ops")) },
    ],
  };
}
