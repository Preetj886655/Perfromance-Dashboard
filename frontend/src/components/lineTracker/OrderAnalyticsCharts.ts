import type {
  MonthlyPlanSummaryRow,
  OrderBookSummaryRow,
} from "../../services/lineTrackerWorksheetsApi";

export function buildOrderBookOption(rows: OrderBookSummaryRow[]) {
  const labels = rows.map((row) => row.customer).reverse();
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { data: ["PO Qty", "FY25-26 Carryover", "Balance"] },
    grid: { left: 150, right: 28, top: 36, bottom: 24 },
    xAxis: { type: "value", name: "NOS" },
    yAxis: { type: "category", data: labels },
    series: [
      { name: "PO Qty", type: "bar", data: rows.map((row) => row.po_qty).reverse() },
      { name: "FY25-26 Carryover", type: "bar", data: rows.map((row) => row.fy25_26_carryover).reverse() },
      { name: "Balance", type: "bar", data: rows.map((row) => row.balance).reverse() },
    ],
  };
}

export function buildMonthlyPlanOption(rows: MonthlyPlanSummaryRow[]) {
  return {
    tooltip: { trigger: "axis" },
    legend: { data: ["Production Plan", "Dispatch Plan"] },
    grid: { left: 70, right: 28, top: 36, bottom: 56 },
    xAxis: { type: "category", data: rows.map((row) => row.month), axisLabel: { rotate: 30 } },
    yAxis: { type: "value", name: "NOS" },
    series: [
      { name: "Production Plan", type: "bar", data: rows.map((row) => row.production) },
      { name: "Dispatch Plan", type: "bar", data: rows.map((row) => row.dispatch) },
    ],
  };
}
