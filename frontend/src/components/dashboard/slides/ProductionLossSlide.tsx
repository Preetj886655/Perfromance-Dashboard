/**
 * ProductionLossSlide — SLIDE 3: PRODUCTION LOSS
 *
 * Where production is being lost (Prod Loss NOS) — trend + top drivers.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS, abbreviateNumber, truncateLabel, xAxisCategoryStyle, yAxisStyle, gridStyle, axisLabelStyle } from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
}

export function ProductionLossSlide({ analytics }: Props) {
  const { totalProductionLoss, lossDailySeries, lossByWorkCenter, productionKpis } = analytics;

  const lossTrendOption = {
    grid: gridStyle({ left: 60, bottom: 40 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => abbreviateNumber(v) },
    xAxis: { ...xAxisCategoryStyle, data: lossDailySeries.map((d) => d.date.slice(5)) },
    yAxis: yAxisStyle,
    series: [
      {
        name: "Prod Loss (NOS)",
        type: "bar",
        data: lossDailySeries.map((d) => Math.round(d.loss)),
        itemStyle: { color: CHART_COLORS.loss },
        label: { show: false },
      },
    ],
  };

  const lossByWcOption = {
    grid: gridStyle({ left: 90, bottom: 50 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => abbreviateNumber(v) },
    xAxis: { ...xAxisCategoryStyle, data: lossByWorkCenter.slice(0, 10).map((d) => truncateLabel(d.key, 14)), axisLabel: { ...axisLabelStyle, rotate: 25 } },
    yAxis: yAxisStyle,
    series: [
      {
        name: "Prod Loss (NOS)",
        type: "bar",
        data: lossByWorkCenter.slice(0, 10).map((d) => Math.round(d.minutes)),
        itemStyle: { color: CHART_COLORS.loss },
        label: { show: true, position: "insideEndTop", fontSize: 9, formatter: (p: { value: number }) => abbreviateNumber(p.value) },
      },
    ],
  };

  const lossRate = totalProductionLoss > 0 && productionKpis.totalProduction > 0
    ? (totalProductionLoss / productionKpis.totalProduction) * 100
    : null;

  const topDriver = lossByWorkCenter[0];

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Total Production Loss"
          value={abbreviateNumber(totalProductionLoss)}
          target="Units lost (Prod Loss NOS)"
          variance={totalProductionLoss > 0 ? "▼ Requires investigation" : "▲ Within tolerance"}
          status={totalProductionLoss > 0 ? "Warning" : "Good"}
        />
        <KpiCard
          label="Loss Rate"
          value={lossRate !== null ? `${lossRate.toFixed(1)}%` : "N/A"}
          target="Percentage of target"
          variance={lossRate !== null ? (lossRate > 5 ? "▲ High" : "▼ Acceptable") : undefined}
          status={lossRate !== null ? (lossRate > 5 ? "Warning" : "Good") : undefined}
        />
        <KpiCard
          label="Top Loss Driver"
          value={topDriver ? truncateLabel(topDriver.key, 16) : "N/A"}
          target={topDriver ? `${abbreviateNumber(topDriver.minutes)} NOS` : ""}
          status="Critical"
        />
        <KpiCard
          label="Avg Daily Loss"
          value={abbreviateNumber(lossDailySeries.length > 0 ? totalProductionLoss / lossDailySeries.length : 0)}
          target="Per production day"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {lossDailySeries.length > 0 && (
          <ChartCard title="Production Loss Trend (Daily)" eyebrow="Output loss">
            <ReactECharts option={lossTrendOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {lossByWorkCenter.length > 0 && (
          <ChartCard title="Top Work Centers by Production Loss" eyebrow="Loss concentration">
            <ReactECharts option={lossByWcOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
      </div>
    </div>
  );
}
