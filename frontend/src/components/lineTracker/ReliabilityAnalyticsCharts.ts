import type { LineTrackerWorksheetRecord } from "../../services/lineTrackerWorksheetsApi";

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function rowsInRange(records: LineTrackerWorksheetRecord[], start: number, end: number) {
  return records.filter((record) => record.row_number >= start && record.row_number <= end);
}

export function buildDowntimeParetoOption(records: LineTrackerWorksheetRecord[]) {
  const rows = rowsInRange(records, 6, 25);
  const labels = rows.map((row) => text(row.values[0]) ?? `Row ${row.row_number}`);
  return {
    tooltip: { trigger: "axis" },
    legend: { data: ["Total hours", "Cumulative %"] },
    grid: { left: 170, right: 70, top: 44, bottom: 88 },
    xAxis: { type: "category", data: labels, axisLabel: { rotate: 45 } },
    yAxis: [
      { type: "value", name: "Hours" },
      { type: "value", name: "%", min: 0, max: 100 },
    ],
    series: [
      { name: "Total hours", type: "bar", data: rows.map((row) => number(row.values[1])) },
      { name: "Cumulative %", type: "line", yAxisIndex: 1, data: rows.map((row) => number(row.values[3])) },
    ],
  };
}

export function buildBreakdownSeverityOption(records: LineTrackerWorksheetRecord[]) {
  const rows = rowsInRange(records, 30, 49);
  return {
    tooltip: { trigger: "axis" },
    legend: { data: ["Total hours", "Average hours / occurrence"] },
    grid: { left: 150, right: 28, top: 44, bottom: 88 },
    xAxis: {
      type: "category",
      data: rows.map((row) => text(row.values[0]) ?? `Row ${row.row_number}`),
      axisLabel: { rotate: 45 },
    },
    yAxis: { type: "value", name: "Hours" },
    series: [
      { name: "Total hours", type: "bar", data: rows.map((row) => number(row.values[1])) },
      { name: "Average hours / occurrence", type: "line", data: rows.map((row) => number(row.values[3])) },
    ],
  };
}

export function buildReliabilityComparisonOption(
  records: LineTrackerWorksheetRecord[],
  start: number,
  end: number,
  firstMetric: string,
  secondMetric: string,
) {
  const rows = rowsInRange(records, start, end);
  return {
    tooltip: { trigger: "axis" },
    legend: { data: [firstMetric, secondMetric] },
    grid: { left: 140, right: 28, top: 44, bottom: 88 },
    xAxis: {
      type: "category",
      data: rows.map((row) => text(row.values[0]) ?? `Row ${row.row_number}`),
      axisLabel: { rotate: 45 },
    },
    yAxis: { type: "value", name: "Hours" },
    series: [
      { name: firstMetric, type: "bar", data: rows.map((row) => number(row.values[1])) },
      { name: secondMetric, type: "bar", data: rows.map((row) => number(row.values[2])) },
    ],
  };
}

export function buildOeeBreakdownOption(records: LineTrackerWorksheetRecord[]) {
  const rows = rowsInRange(records, 6, 14);
  return {
    tooltip: { trigger: "axis", valueFormatter: (value: number | null) => value === null ? "Unavailable" : `${value}%` },
    legend: { data: ["Availability %", "Performance %", "Quality %", "OEE %"] },
    grid: { left: 130, right: 28, top: 44, bottom: 72 },
    xAxis: {
      type: "category",
      data: rows.map((row) => text(row.values[0]) ?? `Row ${row.row_number}`),
      axisLabel: { rotate: 35 },
    },
    yAxis: { type: "value", name: "%", min: 0, max: 100 },
    series: [
      { name: "Availability %", type: "bar", data: rows.map((row) => number(row.values[1])) },
      { name: "Performance %", type: "bar", data: rows.map((row) => number(row.values[2])) },
      { name: "Quality %", type: "bar", data: rows.map((row) => number(row.values[3])) },
      { name: "OEE %", type: "line", data: rows.map((row) => number(row.values[4])) },
    ],
  };
}
