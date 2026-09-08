/**
 * RelationshipSlide — SLIDE 13: DOWNTIME + PRODUCTION LOSS RELATIONSHIP
 *
 * Compares Downtime Minutes vs Production Loss NOS by dimension.
 * These are different measures — never confused.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS, abbreviateNumber, truncateLabel, xAxisCategoryStyle, axisLabelStyle, gridStyle } from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
}

export function RelationshipSlide({ analytics }: Props) {
  const { downtimeByWorkCenter, lossByWorkCenter, downtimeByStage, lossByStage, downtime, totalProductionLoss } = analytics;

  // Merge downtime + loss by work center for comparison
  const wcComparison = downtimeByWorkCenter.map((d) => ({
    key: d.key,
    downtime: d.minutes,
    loss: lossByWorkCenter.find((l) => l.key === d.key)?.minutes ?? 0,
  })).sort((a, b) => (b.downtime + b.loss) - (a.downtime + a.loss)).slice(0, 8);

  const stageComparison = downtimeByStage.map((d) => ({
    key: d.key,
    downtime: d.minutes,
    loss: lossByStage.find((l) => l.key === d.key)?.minutes ?? 0,
  })).sort((a, b) => (b.downtime + b.loss) - (a.downtime + a.loss)).slice(0, 8);

  const wcOption = {
    grid: gridStyle({ left: 90, bottom: 50 }),
    tooltip: { trigger: "axis" },
    legend: { data: ["Downtime (min)", "Prod Loss (NOS)"], top: 0, textStyle: { fontSize: 10 } },
    xAxis: { ...xAxisCategoryStyle, data: wcComparison.map((d) => truncateLabel(d.key, 14)), axisLabel: { ...axisLabelStyle, rotate: 25 } },
    yAxis: [{ type: "value" as const, name: "min", axisLabel: axisLabelStyle, nameTextStyle: { fontSize: 9 } }, { type: "value" as const, name: "NOS", axisLabel: axisLabelStyle, nameTextStyle: { fontSize: 9 }, splitLine: { show: false } }],
    series: [
      { name: "Downtime (min)", type: "bar" as const, data: wcComparison.map((d) => Math.round(d.downtime)), itemStyle: { color: CHART_COLORS.downtime } },
      { name: "Prod Loss (NOS)", type: "bar" as const, yAxisIndex: 1, data: wcComparison.map((d) => Math.round(d.loss)), itemStyle: { color: CHART_COLORS.loss } },
    ],
  };

  const stageOption = {
    grid: gridStyle({ left: 90, bottom: 50 }),
    tooltip: { trigger: "axis" },
    legend: { data: ["Downtime (min)", "Prod Loss (NOS)"], top: 0, textStyle: { fontSize: 10 } },
    xAxis: { ...xAxisCategoryStyle, data: stageComparison.map((d) => truncateLabel(d.key, 12)), axisLabel: { ...axisLabelStyle, rotate: 25 } },
    yAxis: [{ type: "value" as const, name: "min", axisLabel: axisLabelStyle, nameTextStyle: { fontSize: 9 } }, { type: "value" as const, name: "NOS", axisLabel: axisLabelStyle, nameTextStyle: { fontSize: 9 }, splitLine: { show: false } }],
    series: [
      { name: "Downtime (min)", type: "bar" as const, data: stageComparison.map((d) => Math.round(d.downtime)), itemStyle: { color: CHART_COLORS.downtime } },
      { name: "Prod Loss (NOS)", type: "bar" as const, yAxisIndex: 1, data: stageComparison.map((d) => Math.round(d.loss)), itemStyle: { color: CHART_COLORS.loss } },
    ],
  };

  const totalDowntime = downtime.totalDowntimeMinutes;
  const ratio = totalDowntime > 0 ? totalProductionLoss / totalDowntime : null;

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Total Downtime"
          value={`${abbreviateNumber(totalDowntime)} min`}
          target="Planned + Unplanned"
          status="Warning"
        />
        <KpiCard
          label="Total Prod Loss"
          value={abbreviateNumber(totalProductionLoss)}
          target="Units lost (NOS)"
          status="Critical"
        />
        <KpiCard
          label="Loss / Downtime Ratio"
          value={ratio !== null ? `${ratio.toFixed(1)} NOS/min` : "N/A"}
          target="Efficiency of loss"
          status={ratio !== null && ratio > 100 ? "Warning" : "Good"}
        />
        <KpiCard
          label="Dimensions Compared"
          value="Work Center + Stage"
          target="Cross-dimensional view"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {wcComparison.length > 0 && (
          <ChartCard title="Downtime vs Production Loss — Work Center" eyebrow="Comparison">
            <ReactECharts option={wcOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {stageComparison.length > 0 && (
          <ChartCard title="Downtime vs Production Loss — Stage" eyebrow="Comparison">
            <ReactECharts option={stageOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
      </div>
    </div>
  );
}
