/**
 * LinePerformanceSlide — SLIDE 7: LINE PERFORMANCE
 *
 * Compare ERC, SKL, BFS, Injection Moulding lines on production output
 * and downtime. Immediately surfaces best / worst / highest-downtime line.
 */

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS, abbreviateNumber, truncateLabel, xAxisCategoryStyle, axisLabelStyle, gridStyle } from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
}

export function LinePerformanceSlide({ analytics }: Props) {
  const { byLine, downtimeByLine, lossByLine } = analytics;

  const sortedByAchievement = useMemo(
    () => [...byLine].filter((l) => l.achievement !== null).sort((a, b) => (b.achievement ?? -1) - (a.achievement ?? -1)),
    [byLine],
  );
    const sortedByDowntime = useMemo(
    () => [...downtimeByLine].sort((a, b) => b.minutes - a.minutes),
    [downtimeByLine],
  );

  const bestLine = sortedByAchievement[0];
  const worstLine = sortedByAchievement[sortedByAchievement.length - 1];
  const topDowntimeLine = sortedByDowntime[0];

  const productionOption = {
    grid: gridStyle({ left: 70, bottom: 40 }),
    tooltip: { trigger: "axis" },
    legend: { data: ["Production", "Downtime (min)", "Prod Loss (NOS)"], top: 0, textStyle: { fontSize: 10 } },
    xAxis: { ...xAxisCategoryStyle, data: byLine.slice(0, 8).map((g) => truncateLabel(g.key, 12)) },
    yAxis: [{ type: "value" as const, name: "Units", axisLabel: axisLabelStyle, nameTextStyle: { fontSize: 9 } }, { type: "value" as const, name: "min", axisLabel: axisLabelStyle, nameTextStyle: { fontSize: 9 }, splitLine: { show: false } }],
    series: [
      { name: "Production", type: "bar" as const, data: byLine.slice(0, 8).map((g) => Math.round(g.production)), itemStyle: { color: CHART_COLORS.prod } },
      { name: "Downtime (min)", type: "line" as const, yAxisIndex: 1, data: byLine.slice(0, 8).map((g) => {
        const dt = downtimeByLine.find((d) => d.key === g.key);
        return dt ? Math.round(dt.minutes) : 0;
      }), itemStyle: { color: CHART_COLORS.downtime }, smooth: true },
      { name: "Prod Loss (NOS)", type: "bar" as const, yAxisIndex: 1, data: byLine.slice(0, 8).map((g) => {
        const ls = lossByLine.find((l) => l.key === g.key);
        return ls ? Math.round(ls.minutes) : 0;
      }), itemStyle: { color: CHART_COLORS.loss } },
    ],
  };

  const achievementOption = {
    grid: gridStyle({ left: 70, bottom: 40 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${Math.round(v)}%` },
    xAxis: { ...xAxisCategoryStyle, data: sortedByAchievement.slice(0, 8).map((g) => truncateLabel(g.key, 12)) },
    yAxis: { ...({ type: "value" as const, axisLabel: axisLabelStyle, splitLine: { lineStyle: { color: "rgba(31,36,48,0.06)" } } }) },
    series: [
      {
        name: "Achievement",
        type: "bar" as const,
        data: sortedByAchievement.slice(0, 8).map((g) => (g.achievement ?? 0)),
        itemStyle: {
          color: (params: { value: number }) => (params.value >= 90 ? CHART_COLORS.good : params.value >= 70 ? CHART_COLORS.loss : CHART_COLORS.downtime),
        },
      },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Best Line"
          value={bestLine ? truncateLabel(bestLine.key, 14) : "N/A"}
          target={bestLine?.achievement != null ? `${bestLine.achievement.toFixed(1)}% achievement` : ""}
          status="Good"
        />
        <KpiCard
          label="Lowest Line"
          value={worstLine ? truncateLabel(worstLine.key, 14) : "N/A"}
          target={worstLine?.achievement != null ? `${worstLine.achievement.toFixed(1)}% achievement` : ""}
          status="Critical"
        />
        <KpiCard
          label="Highest Downtime Line"
          value={topDowntimeLine ? truncateLabel(topDowntimeLine.key, 14) : "N/A"}
          target={topDowntimeLine ? `${abbreviateNumber(topDowntimeLine.minutes)} min` : ""}
          status="Warning"
        />
        <KpiCard
          label="Lines Active"
          value={String(byLine.length)}
          target="With production data"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {byLine.length > 0 && (
          <ChartCard title="Line Performance — Production, Downtime & Loss" eyebrow="Comparison">
            <ReactECharts option={productionOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {sortedByAchievement.length > 0 && (
          <ChartCard title="Achievement by Line" eyebrow="Attainment">
            <ReactECharts option={achievementOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
      </div>
    </div>
  );
}
