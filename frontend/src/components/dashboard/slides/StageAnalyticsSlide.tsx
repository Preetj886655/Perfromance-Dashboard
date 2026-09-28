/**
 * StageAnalyticsSlide — SLIDE 10: STAGE ANALYTICS
 *
 * Production, target vs actual, downtime, and production loss by process stage
 * (Cut Bar, Turned Bar, Clip, Deburring, MPI, etc.).
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import {
  CHART_COLORS,
  tooltipStyle,
  truncateLabel,
  xAxisCategoryStyle,
  yAxisStyle,
  gridStyle,
  axisLabelStyle,
  formatCompactQuantity,
  formatExactQuantity,
} from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
}

export function StageAnalyticsSlide({ analytics }: Props) {
  const { byStage, downtimeByStage, lossByStage } = analytics;

  const topStages = byStage.slice(0, 8);
  const topDowntimeStages = downtimeByStage.slice(0, 8);
  const topLossStages = lossByStage.slice(0, 8);

  const topStageProd = byStage[0];
  const topStageDown = downtimeByStage[0];
  const totalStageLoss = topLossStages.reduce((s, v) => s + v.minutes, 0);

  const stageOption = {
    grid: gridStyle({ left: 80, bottom: 50 }),
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0];
        const val = typeof p.value === "number" ? p.value : 0;
        return `<strong>${p.name}</strong><br/>Production: <strong>${formatCompactQuantity(val)} NOS</strong> (${formatExactQuantity(val)} NOS)`;
      },
    },
    xAxis: { ...xAxisCategoryStyle, data: topStages.map((s) => truncateLabel(s.key, 12)), axisLabel: { ...axisLabelStyle, rotate: 20 } },
    yAxis: {
      ...yAxisStyle,
      axisLabel: { ...axisLabelStyle, formatter: (v: number) => formatCompactQuantity(v) },
    },
    series: [
      { name: "Production", type: "bar" as const, data: topStages.map((s) => Math.round(s.production)), itemStyle: { color: CHART_COLORS.stage } },
    ],
  };

  const targetVsActualOption = {
    grid: gridStyle({ left: 80, bottom: 50 }),
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        let str = `<strong>${params[0].name}</strong><br/>`;
        params.forEach((p) => {
          const val = typeof p.value === "number" ? p.value : 0;
          str += `${p.marker} ${p.seriesName}: <strong>${formatCompactQuantity(val)}</strong> (${formatExactQuantity(val)} NOS)<br/>`;
        });
        return str;
      },
    },
    legend: { data: ["Target", "Actual"], top: 0, textStyle: { fontSize: 10 } },
    xAxis: { ...xAxisCategoryStyle, data: topStages.map((s) => truncateLabel(s.key, 12)), axisLabel: { ...axisLabelStyle, rotate: 20 } },
    yAxis: {
      ...yAxisStyle,
      axisLabel: { ...axisLabelStyle, formatter: (v: number) => formatCompactQuantity(v) },
    },
    series: [
      { name: "Target", type: "bar" as const, data: topStages.map((s) => Math.round(s.target)), itemStyle: { color: CHART_COLORS.target } },
      { name: "Actual", type: "bar" as const, data: topStages.map((s) => Math.round(s.production)), itemStyle: { color: CHART_COLORS.prod } },
    ],
  };

  const downtimeOption = {
    grid: gridStyle({ left: 80, bottom: 50 }),
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0];
        const val = typeof p.value === "number" ? p.value : 0;
        return `<strong>${p.name}</strong><br/>Downtime: <strong>${formatCompactQuantity(val)} min</strong> (${formatExactQuantity(val)} min)`;
      },
    },
    xAxis: { ...xAxisCategoryStyle, data: topDowntimeStages.map((s) => truncateLabel(s.key, 12)), axisLabel: { ...axisLabelStyle, rotate: 20 } },
    yAxis: {
      ...yAxisStyle,
      axisLabel: { ...axisLabelStyle, formatter: (v: number) => formatCompactQuantity(v) },
    },
    series: [
      { name: "Downtime (min)", type: "bar" as const, data: topDowntimeStages.map((s) => Math.round(s.minutes)), itemStyle: { color: CHART_COLORS.downtime } },
    ],
  };

  const lossOption = {
    grid: gridStyle({ left: 80, bottom: 50 }),
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0];
        const val = typeof p.value === "number" ? p.value : 0;
        return `<strong>${p.name}</strong><br/>Prod Loss: <strong>${formatCompactQuantity(val)} NOS</strong> (${formatExactQuantity(val)} NOS)`;
      },
    },
    xAxis: { ...xAxisCategoryStyle, data: topLossStages.map((s) => truncateLabel(s.key, 12)), axisLabel: { ...axisLabelStyle, rotate: 20 } },
    yAxis: {
      ...yAxisStyle,
      axisLabel: { ...axisLabelStyle, formatter: (v: number) => formatCompactQuantity(v) },
    },
    series: [
      { name: "Prod Loss (NOS)", type: "bar" as const, data: topLossStages.map((s) => Math.round(s.minutes)), itemStyle: { color: CHART_COLORS.loss } },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Top Stage (Production)"
          value={topStageProd ? truncateLabel(topStageProd.key, 14) : "N/A"}
          target={topStageProd ? `${formatCompactQuantity(topStageProd.production)} (${formatExactQuantity(topStageProd.production)} units)` : ""}
          status="Good"
        />
        <KpiCard
          label="Top Stage (Downtime)"
          value={topStageDown ? truncateLabel(topStageDown.key, 14) : "N/A"}
          target={topStageDown ? `${formatCompactQuantity(topStageDown.minutes)} min (${formatExactQuantity(topStageDown.minutes)} min)` : ""}
          status="Critical"
        />
        <KpiCard
          label="Stages Active"
          value={String(byStage.length)}
          target="Distinct process stages"
        />
        <KpiCard
          label="Production Loss"
          value={formatCompactQuantity(totalStageLoss)}
          exactValue={formatExactQuantity(totalStageLoss)}
          unit="NOS"
          target="Across all stages"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {topStages.length > 0 && (
          <ChartCard title="Production by Stage" eyebrow="Output">
            <ReactECharts option={stageOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {topStages.length > 0 && (
          <ChartCard title="Target vs Actual by Stage" eyebrow="Attainment">
            <ReactECharts option={targetVsActualOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
      </div>

      <div className="carousel-chart-row">
        {topDowntimeStages.length > 0 && (
          <ChartCard title="Downtime by Stage" eyebrow="Idle time">
            <ReactECharts option={downtimeOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {topLossStages.length > 0 && (
          <ChartCard title="Production Loss by Stage" eyebrow="Loss">
            <ReactECharts option={lossOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
      </div>
    </div>
  );
}
