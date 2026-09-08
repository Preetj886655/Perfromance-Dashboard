/**
 * DowntimeCommandCenterSlide — SLIDE 4: DOWNTIME COMMAND CENTER
 *
 * Total downtime KPI + trend + top causes (Pareto) + compact ranked list.
 * Enhanced from the original DowntimeSlide with a ranked leaderboard.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS, abbreviateNumber, truncateLabel, xAxisCategoryStyle, yAxisStyle, gridStyle, axisLabelStyle } from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
}

export function DowntimeCommandCenterSlide({ analytics }: Props) {
  const { downtime, downtimeDailySeries } = analytics;

  const topReasons = downtime.byReason.slice(0, 8);

  const paretoOption = {
    grid: gridStyle({ left: 90, bottom: 60 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${Math.round(v)} min` },
    xAxis: { ...xAxisCategoryStyle, data: topReasons.map((r) => truncateLabel(r.key, 18)), axisLabel: { ...axisLabelStyle, rotate: 30 } },
    yAxis: yAxisStyle,
    series: [
      { name: "Downtime (min)", type: "bar" as const, data: topReasons.map((r) => Math.round(r.minutes)), itemStyle: { color: CHART_COLORS.downtime } },
    ],
  };

  const trendOption = {
    grid: gridStyle({ left: 70, bottom: 40 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${Math.round(v)} min` },
    xAxis: { ...xAxisCategoryStyle, data: downtimeDailySeries.map((d) => d.date.slice(5)) },
    yAxis: yAxisStyle,
    series: [
      { name: "Downtime (min)", type: "bar" as const, data: downtimeDailySeries.map((d) => Math.round(d.minutes)), itemStyle: { color: CHART_COLORS.downtimeAlt } },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Total Downtime"
          value={`${abbreviateNumber(downtime.totalDowntimeMinutes)} min`}
          target="Planned + Unplanned"
          status="Warning"
        />
        <KpiCard
          label="Top Downtime Cause"
          value={downtime.byReason[0] ? truncateLabel(downtime.byReason[0].key, 16) : "N/A"}
          target={downtime.byReason[0] ? `${abbreviateNumber(downtime.byReason[0].minutes)} min` : ""}
          status="Critical"
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
          <ChartCard title="Downtime Trend (Daily)" eyebrow="Idle time">
            <ReactECharts option={trendOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {topReasons.length > 0 && (
          <ChartCard title="Top Downtime Causes (Pareto)" eyebrow="Concentration">
            <ReactECharts option={paretoOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
      </div>

      {/* Ranked leaderboard of top 5 downtime causes */}
      {topReasons.length > 0 && (
        <div className="chart-card" style={{ marginTop: "1rem" }}>
          <div className="chart-card__head">
            <h3 className="chart-card__title">Top 5 Downtime Causes</h3>
          </div>
          <div className="chart-card__body" style={{ maxHeight: 160 }}>
            <div className="ranked-list">
              {topReasons.slice(0, 5).map((r, i) => (
                <div key={r.key} className="ranked-list__item">
                  <span className="ranked-list__rank">{i + 1}</span>
                  <span className="ranked-list__label">{r.key}</span>
                  <span className="ranked-list__value">{abbreviateNumber(r.minutes)} min</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
