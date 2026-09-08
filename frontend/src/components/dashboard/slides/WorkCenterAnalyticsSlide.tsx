/**
 * WorkCenterAnalyticsSlide — SLIDE 11: WORK CENTER ANALYTICS
 *
 * Production, downtime, and production loss by business Work Center
 * (Stock, Bar Cropping, Deburring, MPI, Autocopy, IBH, Forging, etc.).
 * Enhanced from WorkCenterSlide with production loss view.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS, abbreviateNumber, truncateLabel, xAxisCategoryStyle, yAxisStyle, gridStyle } from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
}

export function WorkCenterAnalyticsSlide({ analytics }: Props) {
  const { byWorkCenter, downtimeByWorkCenter, lossByWorkCenter, downtime } = analytics;

  const topWcDown = downtimeByWorkCenter.slice(0, 8);
  const topWcLoss = lossByWorkCenter.slice(0, 8);
  const topWcProd = byWorkCenter.slice(0, 8);

  const topWorkCenter = downtimeByWorkCenter[0];
  const topLossWc = lossByWorkCenter[0];

  const productionOption = {
    grid: gridStyle({ left: 90, bottom: 40 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => abbreviateNumber(v) },
    xAxis: { ...xAxisCategoryStyle, data: topWcProd.map((w) => truncateLabel(w.key, 15)) },
    yAxis: yAxisStyle,
    series: [
      { name: "Production", type: "bar" as const, data: topWcProd.map((w) => Math.round(w.production)), itemStyle: { color: CHART_COLORS.good } },
    ],
  };

  const downtimeOption = {
    grid: gridStyle({ left: 90, bottom: 40 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${Math.round(v)} min` },
    xAxis: { ...xAxisCategoryStyle, data: topWcDown.map((w) => truncateLabel(w.key, 15)) },
    yAxis: yAxisStyle,
    series: [
      { name: "Downtime (min)", type: "bar" as const, data: topWcDown.map((w) => Math.round(w.minutes)), itemStyle: { color: CHART_COLORS.workcenter } },
    ],
  };

  const lossOption = {
    grid: gridStyle({ left: 90, bottom: 40 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => abbreviateNumber(v) },
    xAxis: { ...xAxisCategoryStyle, data: topWcLoss.map((w) => truncateLabel(w.key, 15)) },
    yAxis: yAxisStyle,
    series: [
      { name: "Prod Loss (NOS)", type: "bar" as const, data: topWcLoss.map((w) => Math.round(w.minutes)), itemStyle: { color: CHART_COLORS.loss } },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Top Work Center (Downtime)"
          value={topWorkCenter ? truncateLabel(topWorkCenter.key, 14) : "N/A"}
          target={topWorkCenter ? `${abbreviateNumber(topWorkCenter.minutes)} min` : ""}
          status="Critical"
        />
        <KpiCard
          label="Top Work Center (Loss)"
          value={topLossWc ? truncateLabel(topLossWc.key, 14) : "N/A"}
          target={topLossWc ? `${abbreviateNumber(topLossWc.minutes)} NOS` : ""}
          status="Warning"
        />
        <KpiCard
          label="Work Centers"
          value={String(byWorkCenter.length)}
          target="Mapped business units"
        />
        <KpiCard
          label="Machines (raw)"
          value={String(downtime.byMachine.length)}
          target="Unique machines"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {topWcProd.length > 0 && (
          <ChartCard title="Production by Work Center" eyebrow="Output">
            <ReactECharts option={productionOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {topWcDown.length > 0 && (
          <ChartCard title="Downtime by Work Center" eyebrow="Idle time">
            <ReactECharts option={downtimeOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
      </div>

      {topWcLoss.length > 0 && (
        <ChartCard title="Production Loss by Work Center" eyebrow="Loss concentration">
          <ReactECharts option={lossOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
        </ChartCard>
      )}
    </div>
  );
}
