/**
 * PerformanceSlide Component — SLIDE 5: LINE & SHIFT
 * Line and shift performance: production and downtime per dimension.
 * Stage/Material analysis lives on its own slide to keep this one viewport-sized.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";

interface Props {
  analytics: DashboardAnalytics;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value) || isNaN(value)) return "N/A";
  return `${value.toFixed(1)}%`;
}

/** Dual-axis chart: production units (left) + downtime minutes (right) per group. */
function buildProductionDowntimeOption(
  stats: DashboardAnalytics["byLine"],
  downtimePoints: DashboardAnalytics["downtimeByLine"],
  labelTruncate: number
) {
  const downtimeMap = new Map(downtimePoints.map((d) => [d.key, d.minutes]));
  const groups = stats.slice(0, 8);
  return {
    grid: { left: 60, right: 60, top: 30, bottom: 40 },
    tooltip: { trigger: "axis" },
    legend: { data: ["Production", "Downtime (min)"], top: 0, textStyle: { fontSize: 10 } },
    xAxis: {
      type: "category",
      data: groups.map((g) => (g.key.length > labelTruncate ? `${g.key.slice(0, labelTruncate - 2)}…` : g.key)),
      axisLabel: { fontSize: 9 },
    },
    yAxis: [
      { type: "value", name: "Units", axisLabel: { fontSize: 9 }, nameTextStyle: { fontSize: 9 } },
      { type: "value", name: "min", axisLabel: { fontSize: 9 }, nameTextStyle: { fontSize: 9 }, splitLine: { show: false } },
    ],
    series: [
      {
        name: "Production",
        type: "bar",
        data: groups.map((g) => Math.round(g.production)),
        itemStyle: { color: "#4f46e5" },
      },
      {
        name: "Downtime (min)",
        type: "line",
        yAxisIndex: 1,
        data: groups.map((g) => Math.round(downtimeMap.get(g.key) ?? 0)),
        itemStyle: { color: "#ef4444" },
        smooth: true,
      },
    ],
  };
}

export function PerformanceSlide({ analytics }: Props) {
  const { byLine, byShift, downtimeByLine, downtimeByShift } = analytics;

  const sortedLines = [...byLine].sort((a, b) => (b.achievement ?? -1) - (a.achievement ?? -1));
  const sortedShifts = [...byShift].sort((a, b) => (b.achievement ?? -1) - (a.achievement ?? -1));

  const lineOption = buildProductionDowntimeOption(byLine, downtimeByLine, 12);
  const shiftOption = buildProductionDowntimeOption(byShift, downtimeByShift, 12);

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Best Line (achievement)"
          value={sortedLines[0]?.key.slice(0, 14) || "N/A"}
          target={sortedLines[0]?.achievement != null ? formatPercent(sortedLines[0].achievement) : "Achievement N/A"}
        />
        <KpiCard
          label="Lowest Line (achievement)"
          value={sortedLines[sortedLines.length - 1]?.key.slice(0, 14) || "N/A"}
          target={
            sortedLines[sortedLines.length - 1]?.achievement != null
              ? formatPercent(sortedLines[sortedLines.length - 1].achievement)
              : "Achievement N/A"
          }
        />
        <KpiCard
          label="Shift Leader"
          value={sortedShifts[0]?.key.slice(0, 14) || "N/A"}
          target={sortedShifts[0]?.achievement != null ? formatPercent(sortedShifts[0].achievement) : "Achievement N/A"}
        />
        <KpiCard
          label="Lines / Shifts Active"
          value={`${byLine.length} / ${byShift.length}`}
          target="With recorded data"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {byLine.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Line Performance — Production vs Downtime</div>
            <ReactECharts option={lineOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
        {byShift.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Shift Performance — Production vs Downtime</div>
            <ReactECharts option={shiftOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
      </div>
    </div>
  );
}

