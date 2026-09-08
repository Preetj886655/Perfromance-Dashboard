/**
 * ShiftPerformanceSlide — SLIDE 8: SHIFT PERFORMANCE
 *
 * Day (A) vs Night (B) shift comparison across production, achievement,
 * downtime, and loss. Includes a dynamically calculated narrative insight.
 */

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS, abbreviateNumber, truncateLabel, xAxisCategoryStyle, gridStyle, axisLabelStyle } from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
}

export function ShiftPerformanceSlide({ analytics }: Props) {
  const { byShift, downtimeByShift, lossByShift } = analytics;

  const sortedByProduction = useMemo(
    () => [...byShift].sort((a, b) => b.production - a.production),
    [byShift],
  );

  const leader = sortedByProduction[0];
  const laggard = sortedByProduction[sortedByProduction.length - 1];
  const topDowntimeShift = useMemo(
    () => [...downtimeByShift].sort((a, b) => b.minutes - a.minutes)[0],
    [downtimeByShift],
  );

  // Generate insight dynamically
  let shiftInsight = "";
  if (sortedByProduction.length >= 2) {
    const ratio = sortedByProduction[0].production / (sortedByProduction[1]?.production || 1);
    shiftInsight = `${truncateLabel(sortedByProduction[0].key, 14)} shift produced ${abbreviateNumber(sortedByProduction[0].production)} units (${ratio.toFixed(1)}x vs ${truncateLabel(sortedByProduction[1].key, 14)}).`;
  }

  const comparisonOption = {
    grid: gridStyle({ left: 80, bottom: 50 }),
    tooltip: { trigger: "axis" },
    legend: { data: ["Production", "Prod Loss (NOS)", "Downtime (min)"], top: 0, textStyle: { fontSize: 10 } },
    xAxis: { ...xAxisCategoryStyle, data: byShift.map((s) => truncateLabel(s.key, 14)) },
    yAxis: [{ type: "value" as const, name: "Units / NOS", axisLabel: axisLabelStyle, nameTextStyle: { fontSize: 9 } }, { type: "value" as const, name: "min", axisLabel: axisLabelStyle, nameTextStyle: { fontSize: 9 }, splitLine: { show: false } }],
    series: [
      { name: "Production", type: "bar" as const, data: byShift.map((s) => Math.round(s.production)), itemStyle: { color: CHART_COLORS.prod } },
      { name: "Prod Loss (NOS)", type: "bar" as const, data: byShift.map((s) => {
        const ls = lossByShift.find((l) => l.key === s.key);
        return ls ? Math.round(ls.minutes) : 0;
      }), itemStyle: { color: CHART_COLORS.loss } },
      { name: "Downtime (min)", type: "line" as const, yAxisIndex: 1, data: byShift.map((s) => {
        const dt = downtimeByShift.find((d) => d.key === s.key);
        return dt ? Math.round(dt.minutes) : 0;
      }), itemStyle: { color: CHART_COLORS.downtime }, smooth: true },
    ],
  };

  const achievementOption = {
    grid: gridStyle({ left: 70, bottom: 40 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${Math.round(v)}%` },
    xAxis: { ...xAxisCategoryStyle, data: byShift.map((s) => truncateLabel(s.key, 14)) },
    yAxis: { ...({ type: "value" as const, axisLabel: axisLabelStyle, splitLine: { lineStyle: { color: "rgba(31,36,48,0.06)" } } }) },
    series: [
      {
        name: "Achievement",
        type: "bar" as const,
        data: byShift.map((s) => (s.achievement ?? 0)),
        itemStyle: { color: CHART_COLORS.shift },
      },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Shift Leader"
          value={leader ? truncateLabel(leader.key, 14) : "N/A"}
          target={leader ? `${abbreviateNumber(leader.production)} units` : ""}
          status="Good"
        />
        <KpiCard
          label="Laggard Shift"
          value={laggard ? truncateLabel(laggard.key, 14) : "N/A"}
          target={laggard ? `${abbreviateNumber(laggard.production)} units` : ""}
          status="Warning"
        />
        <KpiCard
          label="Top Downtime Shift"
          value={topDowntimeShift ? truncateLabel(topDowntimeShift.key, 14) : "N/A"}
          target={topDowntimeShift ? `${abbreviateNumber(topDowntimeShift.minutes)} min` : ""}
          status="Critical"
        />
        <KpiCard
          label="Shifts Active"
          value={String(byShift.length)}
          target="Day (A) / Night (B)"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {byShift.length > 0 && (
          <ChartCard title="Shift Comparison — Production / Loss / Downtime" eyebrow="Day vs Night">
            <ReactECharts option={comparisonOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {byShift.length > 0 && (
          <ChartCard title="Achievement by Shift" eyebrow="Attainment">
            <ReactECharts option={achievementOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
      </div>

      {shiftInsight && (
        <div className="insight-card insight-card--info">
          <strong>Shift Insight</strong>
          <span>{shiftInsight}</span>
        </div>
      )}
    </div>
  );
}
