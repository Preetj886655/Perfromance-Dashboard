/**
 * ExecutiveOverviewSlide Component
 *
 * High-level KPI cards and summary charts for the carousel.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";

interface Props {
  analytics: DashboardAnalytics;
}

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatPercent(value: number): string {
  if (!isFinite(value) || isNaN(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

export function ExecutiveOverviewSlide({ analytics }: Props) {
  const { productionKpis, oeeSummary, quality, downtime, dailySeries, totalProductionLoss } = analytics;

  const achievement = productionKpis.productionAchievementPercent;
  const rejectionRate = quality.rejectionRatePercent;
  // OEE is shown ONLY when the live source provides valid inputs (A × P × Q).
  const oee = oeeSummary.oeePercent;
  const hasOee = oee !== null && isFinite(oee) && oee > 0;

  // Production trend chart option
  const trendOption = {
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
    tooltip: { trigger: "axis" },
    legend: { data: ["Actual", "Target"], top: 0 },
    xAxis: {
      type: "category",
      data: dailySeries.map((d) => d.date.slice(5)),
      axisLabel: { fontSize: 10 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: [
      {
        name: "Actual",
        type: "bar",
        data: dailySeries.map((d) => d.actual),
        itemStyle: { color: "#4f46e5" },
      },
      {
        name: "Target",
        type: "line",
        data: dailySeries.map((d) => d.target),
        itemStyle: { color: "#f59e0b" },
        smooth: true,
      },
    ],
  };

  const paretoOption = {
    grid: { left: 70, right: 20, top: 20, bottom: 55 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: downtime.byReason.slice(0, 7).map((r) => (r.key.length > 14 ? `${r.key.slice(0, 12)}…` : r.key)),
      axisLabel: { fontSize: 9, rotate: 24 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 9 } },
    series: [
      {
        name: "Downtime (min)",
        type: "bar",
        data: downtime.byReason.slice(0, 7).map((r) => Math.round(r.minutes)),
        itemStyle: { color: "#dc2626" },
      },
    ],
  };

  const materialOption = {
    tooltip: { trigger: "item" },
    legend: { orient: "vertical", right: 0, top: "middle", textStyle: { fontSize: 10 } },
    series: [
      {
        type: "pie",
        radius: ["45%", "70%"],
        center: ["38%", "50%"],
        itemStyle: { borderRadius: 4, borderColor: "#fff", borderWidth: 2 },
        label: { show: false },
        data: analytics.byMaterial.slice(0, 6).map((m, i) => ({
          name: m.key,
          value: Math.round(m.production),
          itemStyle: { color: ["#4f46e5", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"][i % 6] },
        })),
      },
    ],
  };

  const summaryItems = [
    { label: "Lines", value: String(analytics.byLine.length), hint: analytics.byLine.slice(0, 4).map((l) => l.key).join(", ") || "—" },
    { label: "Shifts", value: String(analytics.byShift.length), hint: analytics.byShift.map((s) => s.key).join(", ") || "—" },
    { label: "Work Centers", value: String(analytics.byWorkCenter.length), hint: "Business work centers with data" },
    { label: "Machines", value: String(downtime.byMachine.length), hint: "Raw machines in selection" },
    { label: "Date Range", value: `${analytics.dateRange.start || "—"} → ${analytics.dateRange.end || "—"}`, hint: "From live filtered data" },
  ];

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Production Achievement"
          value={achievement !== null ? formatPercent(achievement) : "N/A"}
          target="Target 100%"
          variance={
            achievement === null
              ? undefined
              : achievement >= 100
                ? "▲ On target"
                : `▼ ${(100 - achievement).toFixed(1)}% below`
          }
          status={
            achievement === null
              ? undefined
              : achievement >= 90
                ? "Good"
                : achievement >= 70
                  ? "Warning"
                  : "Critical"
          }
        />
        <KpiCard
          label="Actual Production"
          value={formatNumber(productionKpis.totalProduction)}
          target="Units produced"
        />
        <KpiCard
          label="Production Target"
          value={formatNumber(productionKpis.totalTargetProduction)}
          target="Units planned"
        />
        <KpiCard
          label="Production Loss"
          value={formatNumber(totalProductionLoss)}
          target="Units lost (Prod Loss NOS)"
        />
        <KpiCard
          label="Downtime"
          value={`${formatNumber(downtime.totalDowntimeMinutes)} min`}
          target="Planned + Unplanned"
        />
        <KpiCard
          label="Rejection"
          value={formatNumber(quality.totalRejection)}
          target={rejectionRate !== null ? `${formatPercent(rejectionRate)} rate` : "Rate unavailable"}
        />
        <KpiCard
          label="Quality"
          value={oeeSummary.qualityPercent !== null ? formatPercent(oeeSummary.qualityPercent) : "N/A"}
          target={oeeSummary.qualityPercent !== null ? "Target 98.5%" : "No valid quality inputs"}
        />
        <KpiCard
          label="OEE"
          value={hasOee ? formatPercent(oee) : "Not Available"}
          target={hasOee ? "Target 75%" : "Cannot be calculated from current source data"}
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {dailySeries.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Production Trend (Daily)</div>
            <ReactECharts option={trendOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
        {downtime.byReason.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Top Downtime Causes</div>
            <ReactECharts option={paretoOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
        {analytics.byMaterial.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Production by Material</div>
            <ReactECharts option={materialOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
      </div>

      <div className="carousel-summary-strip">
        {summaryItems.map((item) => (
          <div key={item.label} className="carousel-summary-item">
            <div className="carousel-summary-item__label">{item.label}</div>
            <div className="carousel-summary-item__value">{item.value}</div>
            <div className="carousel-summary-item__hint">{item.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
