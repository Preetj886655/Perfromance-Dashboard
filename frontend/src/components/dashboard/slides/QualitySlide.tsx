/**
 * QualitySlide Component
 * Quality analytics slide for the carousel.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import {
  tooltipStyle,
  axisLabelStyle,
  yAxisStyle,
  xAxisCategoryStyle,
  gridStyle,
  truncateLabel,
  formatCompactQuantity,
  formatExactQuantity,
  formatPercentage,
} from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
}

function formatPercent(value: number): string {
  return formatPercentage(value, 2);
}

export function QualitySlide({ analytics }: Props) {
  const { quality, oeeSummary } = analytics;
  const rejectionRate = quality.rejectionRatePercent;
  const qualityPercent = oeeSummary.qualityPercent;

  const topRejectionParts = quality.byPart.slice(0, 6);

  const rejectionOption = {
    grid: gridStyle({ left: 65, right: 20, top: 25, bottom: 40 }),
    tooltip: {
      trigger: "axis",
      ...tooltipStyle,
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0];
        const val = Number(p.value);
        return `<div style="font-weight: 600;">${p.axisValueLabel || p.name}</div><div>Rejections: <strong>${formatCompactQuantity(val)}</strong> <span style="font-size: 11px; color: #64748B;">(${formatExactQuantity(val)} pcs)</span></div>`;
      },
    },
    xAxis: {
      ...xAxisCategoryStyle,
      data: topRejectionParts.map((p) => truncateLabel(p.key, 12)),
      axisLabel: axisLabelStyle,
    },
    yAxis: yAxisStyle,
    series: [
      {
        name: "Rejections",
        type: "bar",
        data: topRejectionParts.map((p) => p.value),
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#F59E0B" },
              { offset: 1, color: "rgba(245, 158, 11, 0.3)" },
            ],
          },
          borderRadius: [3, 3, 0, 0],
        },
      },
    ],
  };

  const topRejectionReasons = quality.byReason.slice(0, 6);

  const reasonOption = {
    grid: gridStyle({ left: 65, right: 20, top: 25, bottom: 60 }),
    tooltip: {
      trigger: "axis",
      ...tooltipStyle,
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0];
        const val = Number(p.value);
        return `<div style="font-weight: 600;">${p.axisValueLabel || p.name}</div><div>Rejections: <strong>${formatCompactQuantity(val)}</strong> <span style="font-size: 11px; color: #64748B;">(${formatExactQuantity(val)} pcs)</span></div>`;
      },
    },
    xAxis: {
      ...xAxisCategoryStyle,
      data: topRejectionReasons.map((r) => truncateLabel(r.key, 14)),
      axisLabel: { ...axisLabelStyle, rotate: 24 },
    },
    yAxis: yAxisStyle,
    series: [
      {
        name: "Rejections",
        type: "bar",
        data: topRejectionReasons.map((r) => r.value),
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#EF4444" },
              { offset: 1, color: "rgba(239, 68, 68, 0.3)" },
            ],
          },
          borderRadius: [3, 3, 0, 0],
        },
      },
    ],
  };

  const comp = analytics.periodComparison;
  const hasPrev = comp?.hasPreviousData;

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Rejection Rate"
          value={rejectionRate !== null ? formatPercent(rejectionRate) : "N/A"}
          target="Target 1.5%"
          variance={hasPrev ? `${comp.rejectionRate.formattedDelta} vs prior` : undefined}
          varianceType={hasPrev ? comp.rejectionRate.varianceStatus : undefined}
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
          value={formatCompactQuantity(quality.totalRejection)}
          exactValue={formatExactQuantity(quality.totalRejection)}
          target="Pieces rejected"
          variance={hasPrev ? `${comp.rejection.formattedDelta} vs prior` : undefined}
          varianceType={hasPrev ? comp.rejection.varianceStatus : undefined}
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
