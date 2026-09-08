/**
 * DowntimeSlide Component
 * Downtime analytics slide for the carousel.
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

export function DowntimeSlide({ analytics }: Props) {
  const { downtime, downtimeDailySeries } = analytics;

  const topReasons = downtime.byReason.slice(0, 8);

  const paretoOption = {
    grid: { left: 80, right: 30, top: 20, bottom: 60 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: topReasons.map((r) => (r.key.length > 20 ? `${r.key.slice(0, 18)}...` : r.key)),
      axisLabel: { fontSize: 9, rotate: 30 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: [
      {
        type: "bar",
        data: topReasons.map((r) => r.minutes),
        itemStyle: { color: "#dc2626" },
      },
    ],
  };

  const trendOption = {
    grid: { left: 70, right: 20, top: 20, bottom: 40 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: downtimeDailySeries.map((d) => d.date.slice(5)),
      axisLabel: { fontSize: 9 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 9 } },
    series: [
      {
        name: "Downtime (min)",
        type: "bar",
        data: downtimeDailySeries.map((d) => Math.round(d.minutes)),
        itemStyle: { color: "#f97316" },
      },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Total Downtime"
          value={`${formatNumber(downtime.totalDowntimeMinutes)} min`}
          target="Planned + Unplanned"
        />
        <KpiCard
          label="Top Downtime Cause"
          value={downtime.byReason[0]?.key.slice(0, 18) || "N/A"}
          target={downtime.byReason[0] ? `${formatNumber(downtime.byReason[0].minutes)} min` : ""}
        />
        <KpiCard
          label="Lines with Downtime"
          value={String(analytics.downtimeByLine.length)}
          target="Of lines in selection"
        />
        <KpiCard
          label="Shifts with Downtime"
          value={String(analytics.downtimeByShift.length)}
          target="Of shifts in selection"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {downtimeDailySeries.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Downtime Trend (Daily)</div>
            <ReactECharts option={trendOption} style={{ height: "230px" }} notMerge />
          </div>
        )}

        {topReasons.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Top Downtime Causes (Pareto)</div>
            <ReactECharts option={paretoOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
      </div>
    </div>
  );
}
