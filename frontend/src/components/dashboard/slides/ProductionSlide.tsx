/**
 * ProductionSlide Component
 * Production analytics slide for the carousel.
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

function formatPercent(value: number): string {
  if (!isFinite(value) || isNaN(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

export function ProductionSlide({ analytics }: Props) {
  const { productionKpis, totalProductionLoss, dailySeries } = analytics;
  const achievement = productionKpis.productionAchievementPercent;

  const targetVsActualOption = {
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
    tooltip: { trigger: "axis" },
    legend: { data: ["Target", "Actual"], top: 0 },
    xAxis: {
      type: "category",
      data: dailySeries.map((d) => d.date.slice(5)),
      axisLabel: { fontSize: 10 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: [
      {
        name: "Target",
        type: "line",
        data: dailySeries.map((d) => d.target),
        itemStyle: { color: "#f59e0b" },
        smooth: true,
      },
      {
        name: "Actual",
        type: "bar",
        data: dailySeries.map((d) => d.actual),
        itemStyle: { color: "#4f46e5" },
      },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Production Target"
          value={formatNumber(productionKpis.totalTargetProduction)}
          target="Units planned (target/hr × hours)"
        />
        <KpiCard
          label="Actual Production"
          value={formatNumber(productionKpis.totalProduction)}
          target="Units produced"
        />
        <KpiCard
          label="Production Achievement"
          value={achievement !== null ? formatPercent(achievement) : "N/A"}
          target="Target 100%"
          variance={
            achievement === null
              ? undefined
              : achievement >= 100
                ? "▲ On target"
                : `▼ ${(100 - achievement).toFixed(1)}% below`
          }
          status={
            achievement === null
              ? undefined
              : achievement >= 90
                ? "Good"
                : achievement >= 70
                  ? "Warning"
                  : "Critical"
          }
        />
        <KpiCard
          label="Production Loss"
          value={formatNumber(totalProductionLoss)}
          target="Units lost (Prod Loss NOS)"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {dailySeries.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Production Trend (Daily)</div>
            <ReactECharts
              option={{
                ...targetVsActualOption,
                legend: { data: ["Actual"], top: 0 },
                series: [targetVsActualOption.series[1]],
              }}
              style={{ height: "230px" }}
              notMerge
            />
          </div>
        )}
        {dailySeries.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Target vs Actual Production</div>
            <ReactECharts option={targetVsActualOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
      </div>
    </div>
  );
}
