/**
 * ProductionLossSlide — SLIDE 3: PRODUCTION LOSS
 *
 * Where production is being lost (Prod Loss NOS) — trend + top drivers.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import {
  CHART_COLORS,
  tooltipStyle,
  abbreviateNumber,
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

export function ProductionLossSlide({ analytics }: Props) {
  const { totalProductionLoss, lossDailySeries, lossByWorkCenter, productionKpis } = analytics;

  const lossTrendOption = {
    grid: gridStyle({ left: 60, bottom: 40 }),
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0];
        const val = Number(p.value);
        return `<div style="font-weight: 600;">${p.axisValueLabel || p.name}</div><div>Prod Loss: <strong>${formatCompactQuantity(val)} NOS</strong> <span style="font-size: 11px; color: #64748B;">(${formatExactQuantity(val)} NOS)</span></div>`;
      },
    },
    xAxis: { ...xAxisCategoryStyle, data: lossDailySeries.map((d) => d.date) },
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
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0];
        const val = Number(p.value);
        return `<div style="font-weight: 600;">${p.axisValueLabel || p.name}</div><div>Prod Loss: <strong>${formatCompactQuantity(val)} NOS</strong> <span style="font-size: 11px; color: #64748B;">(${formatExactQuantity(val)} NOS)</span></div>`;
      },
    },
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
  const avgDaily = lossDailySeries.length > 0 ? totalProductionLoss / lossDailySeries.length : 0;

  const comp = analytics.periodComparison;
  const hasPrev = comp?.hasPreviousData;

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Total Production Loss"
          value={`${formatCompactQuantity(totalProductionLoss)} NOS`}
          exactValue={`${formatExactQuantity(totalProductionLoss)} NOS`}
          target="Units lost (Prod Loss NOS)"
          variance={hasPrev ? `${comp.productionLoss.formattedDelta} vs prior` : totalProductionLoss > 0 ? "▼ Requires investigation" : "▲ Within tolerance"}
          varianceType={hasPrev ? comp.productionLoss.varianceStatus : undefined}
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
          exactValue={topDriver ? `${formatCompactQuantity(topDriver.minutes)} NOS` : undefined}
          target={topDriver ? `${formatExactQuantity(topDriver.minutes)} NOS` : ""}
          status="Critical"
        />
        <KpiCard
          label="Avg Daily Loss"
          value={`${formatCompactQuantity(avgDaily)} NOS`}
          exactValue={`${formatExactQuantity(avgDaily)} NOS`}
          target="Per production day"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {lossDailySeries.length > 0 && (
          <ChartCard title={`Production Loss Trend (${analytics.periodWindow?.trendGranularity ? analytics.periodWindow.trendGranularity.charAt(0).toUpperCase() + analytics.periodWindow.trendGranularity.slice(1) : "Monthly"})`} eyebrow="Output loss">
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
