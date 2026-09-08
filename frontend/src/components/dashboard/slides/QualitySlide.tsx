/**
 * QualitySlide Component
 * Quality analytics slide for the carousel.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";

interface Props {
  analytics: DashboardAnalytics;
}

function formatPercent(value: number): string {
  if (!isFinite(value) || isNaN(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

export function QualitySlide({ analytics }: Props) {
  const { quality, oeeSummary } = analytics;
  const rejectionRate = quality.rejectionRatePercent;
  const qualityPercent = oeeSummary.qualityPercent;

  const topRejectionParts = quality.byPart.slice(0, 6);

  const rejectionOption = {
    grid: { left: 80, right: 20, top: 20, bottom: 40 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: topRejectionParts.map((p) => p.key.slice(0, 12)),
      axisLabel: { fontSize: 9 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: [
      {
        type: "bar",
        data: topRejectionParts.map((p) => p.value),
        itemStyle: { color: "#f59e0b" },
      },
    ],
  };

  const topRejectionReasons = quality.byReason.slice(0, 6);

  const reasonOption = {
    grid: { left: 80, right: 20, top: 20, bottom: 60 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: topRejectionReasons.map((r) => (r.key.length > 16 ? `${r.key.slice(0, 14)}...` : r.key)),
      axisLabel: { fontSize: 9, rotate: 24 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: [
      {
        type: "bar",
        data: topRejectionReasons.map((r) => r.value),
        itemStyle: { color: "#ef4444" },
      },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Rejection Rate"
          value={rejectionRate !== null ? formatPercent(rejectionRate) : "N/A"}
          target="Target 1.5%"
          status={
            rejectionRate === null
              ? undefined
              : rejectionRate <= 1.5
                ? "Good"
                : rejectionRate <= 3
                  ? "Warning"
                  : "Critical"
          }
        />
        <KpiCard
          label="Total Rejection"
          value={quality.totalRejection.toLocaleString()}
          target="Pieces rejected"
        />
        <KpiCard
          label="Quality (OEE factor)"
          value={qualityPercent !== null ? formatPercent(qualityPercent) : "N/A"}
          target={qualityPercent !== null ? "Target 98.5%" : "No valid quality inputs"}
        />
        <KpiCard
          label="Parts Affected"
          value={String(quality.byPart.length)}
          target="Unique parts with rejection"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {topRejectionParts.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Rejection by Part</div>
            <ReactECharts option={rejectionOption} style={{ height: "230px" }} notMerge />
          </div>
        )}

        {topRejectionReasons.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Rejection by Reason</div>
            <ReactECharts option={reasonOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
      </div>
    </div>
  );
}
