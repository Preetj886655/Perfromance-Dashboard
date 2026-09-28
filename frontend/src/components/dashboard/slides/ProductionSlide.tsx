/**
 * ProductionSlide Component
 * Production analytics slide for the carousel.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import {
  CHART_COLORS,
  tooltipStyle,
  axisLabelStyle,
  yAxisStyle,
  xAxisCategoryStyle,
  gridStyle,
  formatCompactQuantity,
  formatExactQuantity,
  formatPercentage,
} from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
  onNavigateSlide?: (slideId: string) => void;
}

function formatPercent(value: number): string {
  return formatPercentage(value, 2);
}

export function ProductionSlide({ analytics, onNavigateSlide }: Props) {
  const { productionKpis, totalProductionLoss, granularTrendSeries, periodWindow, periodComparison } = analytics;
  const achievement = productionKpis.productionAchievementPercent;
  const hasPrev = periodComparison?.hasPreviousData;
  const comp = periodComparison;

  const granularity = periodWindow?.trendGranularity ?? "monthly";
  const granularityLabel =
    granularity === "weekly"
      ? "Weekly"
      : granularity === "monthly"
        ? "Monthly"
        : granularity === "quarterly"
          ? "Quarterly"
          : granularity === "yearly"
            ? "Yearly"
            : "Daily";

  const trendData = granularTrendSeries.length > 0 ? granularTrendSeries : [];

  const productionTrendOption = {
    grid: gridStyle({ left: 65, right: 20, top: 35, bottom: 40 }),
    tooltip: {
      trigger: "axis",
      ...tooltipStyle,
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const title = `<div style="font-weight: 700; margin-bottom: 6px; color: #172033; font-size: 13px;">${params[0].axisValueLabel || params[0].name}</div>`;
        const items = params
          .map((p: any) => {
            const num = typeof p.value === "number" ? p.value : Number(p.value || 0);
            const compactVal = formatCompactQuantity(num);
            const exactVal = formatExactQuantity(num);
            const marker = p.marker || "";
            return `<div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 3px; font-size: 12px;">
              <span style="display: flex; align-items: center; gap: 4px; color: #475569;">${marker} ${p.seriesName}</span>
              <span style="text-align: right;">
                <strong style="color: #172033; font-variant-numeric: tabular-nums;">${compactVal} Units</strong>
                <span style="font-size: 11px; color: #64748B; margin-left: 6px;">(${exactVal})</span>
              </span>
            </div>`;
          })
          .join("");
        return `<div style="padding: 2px;">${title}${items}</div>`;
      },
    },
    legend: { data: ["Actual"], top: 0, textStyle: { color: CHART_COLORS.text, fontFamily: "'Inter', sans-serif" } },
    xAxis: {
      ...xAxisCategoryStyle,
      data: trendData.map((d) => d.label),
      axisLabel: axisLabelStyle,
    },
    yAxis: {
      ...yAxisStyle,
      axisLabel: {
        ...axisLabelStyle,
        formatter: (val: number) => formatCompactQuantity(val),
      },
    },
    series: [
      {
        name: "Actual",
        type: "bar",
        data: trendData.map((d) => d.production),
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#22D3EE" },
              { offset: 1, color: "rgba(34, 211, 238, 0.3)" },
            ],
          },
          borderRadius: [3, 3, 0, 0],
        },
      },
    ],
  };

  const targetVsActualOption = {
    grid: gridStyle({ left: 65, right: 48, top: 35, bottom: 40 }),
    tooltip: {
      trigger: "axis",
      ...tooltipStyle,
      axisPointer: {
        type: "shadow",
        shadowStyle: { color: "rgba(148, 163, 184, 0.12)" },
      },
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const idx = params[0].dataIndex;
        const d = trendData[idx];
        if (!d) return "";

        const target = d.target || 0;
        const actual = d.production || 0;
        const gap = Math.max(target - actual, 0);
        const ach = target > 0 ? (actual / target) * 100 : 0;

        return `
          <div style="font-family: Inter, sans-serif; min-width: 200px; padding: 4px 2px;">
            <div style="font-weight: 700; color: #0F172A; font-size: 13px; margin-bottom: 6px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px;">
              ${d.label}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 12px;">
              <span style="display: flex; align-items: center; gap: 6px; color: #64748B;">
                <span style="width: 10px; height: 10px; background-color: #A3A3A3; border-radius: 2px; display: inline-block;"></span>
                Target:
              </span>
              <span style="font-weight: 600; color: #1E293B;">
                ${formatCompactQuantity(target)} <span style="font-size: 11px; color: #64748B; font-weight: normal;">(${formatExactQuantity(target)} NOS)</span>
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 12px;">
              <span style="display: flex; align-items: center; gap: 6px; color: #64748B;">
                <span style="width: 10px; height: 10px; background-color: #EF4444; border-radius: 2px; display: inline-block;"></span>
                Actual:
              </span>
              <span style="font-weight: 600; color: #DC2626;">
                ${formatCompactQuantity(actual)} <span style="font-size: 11px; color: #64748B; font-weight: normal;">(${formatExactQuantity(actual)} NOS)</span>
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #E2E8F0; font-size: 12px;">
              <span style="display: flex; align-items: center; gap: 6px; color: #2563EB; font-weight: 600;">
                <span style="width: 10px; height: 3px; background-color: #2563EB; display: inline-block;"></span>
                Achievement %:
              </span>
              <span style="font-weight: 700; color: #2563EB; font-size: 13px;">
                ${ach.toFixed(1)}%
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 3px; font-size: 11px; color: #64748B;">
              <span>Gap:</span>
              <span style="font-weight: 600; color: #475569;">${formatExactQuantity(gap)} NOS</span>
            </div>
          </div>
        `;
      },
    },
    legend: {
      data: ["Target", "Actual", "Achievement %"],
      top: 0,
      textStyle: { color: "#475569", fontFamily: "'Inter', sans-serif", fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
    },
    xAxis: {
      ...xAxisCategoryStyle,
      data: trendData.map((d) => d.label),
      axisLabel: {
        ...axisLabelStyle,
        color: "#475569",
        rotate: trendData.length > 8 ? 32 : 0,
      },
    },
    yAxis: [
      {
        ...yAxisStyle,
        type: "value",
        name: "NOS",
        nameTextStyle: { color: "#64748B", fontSize: 10 },
        axisLabel: {
          ...axisLabelStyle,
          formatter: (val: number) => formatCompactQuantity(val),
        },
        splitLine: { show: true, lineStyle: { color: "#F1F5F9", type: "solid" } },
      },
      {
        ...yAxisStyle,
        type: "value",
        name: "%",
        nameTextStyle: { color: "#64748B", fontSize: 10 },
        min: 0,
        axisLabel: {
          ...axisLabelStyle,
          formatter: "{value}%",
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Target",
        type: "bar",
        yAxisIndex: 0,
        data: trendData.map((d) => d.target),
        barMaxWidth: 26,
        itemStyle: { color: "#A3A3A3", borderRadius: [3, 3, 0, 0] },
        barGap: "15%",
      },
      {
        name: "Actual",
        type: "bar",
        yAxisIndex: 0,
        data: trendData.map((d) => d.production),
        barMaxWidth: 26,
        itemStyle: {
          color: "#EF4444",
          borderRadius: [3, 3, 0, 0],
        },
      },
      {
        name: "Achievement %",
        type: "line",
        yAxisIndex: 1,
        data: trendData.map((d) => (d.target > 0 ? Number(((d.production / d.target) * 100).toFixed(1)) : 0)),
        lineStyle: { width: 2, color: "#2563EB" },
        itemStyle: { color: "#2563EB", borderColor: "#FFFFFF", borderWidth: 1.5 },
        symbol: "circle",
        symbolSize: trendData.length > 20 ? 4 : 6,
        z: 10,
      },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Production Target"
          value={formatCompactQuantity(productionKpis.totalTargetProduction)}
          exactValue={formatExactQuantity(productionKpis.totalTargetProduction)}
          target="Units (NOS)"
          variance={hasPrev ? `${comp.target.formattedDelta} vs prior` : undefined}
          varianceType={hasPrev ? comp.target.varianceStatus : undefined}
        />
        <KpiCard
          label="Actual Production"
          value={formatCompactQuantity(productionKpis.totalProduction)}
          exactValue={formatExactQuantity(productionKpis.totalProduction)}
          target="Units (NOS)"
          variance={hasPrev ? `${comp.production.formattedDelta} vs prior` : undefined}
          varianceType={hasPrev ? comp.production.varianceStatus : undefined}
        />
        <KpiCard
          label="Production Achievement"
          value={achievement !== null ? formatPercent(achievement) : "N/A"}
          exactValue={`${formatExactQuantity(productionKpis.totalProduction)} / ${formatExactQuantity(productionKpis.totalTargetProduction)} NOS`}
          target="Target 100%"
          variance={
            hasPrev
              ? `${comp.achievement.formattedDelta} vs prior`
              : achievement === null
              ? undefined
              : achievement >= 100
                ? "▲ On target"
                : `▼ ${(100 - achievement).toFixed(1)}% below`
          }
          varianceType={hasPrev ? comp.achievement.varianceStatus : undefined}
          status={
            achievement === null
              ? undefined
              : achievement >= 90
                ? "Good"
                : achievement >= 70
                  ? "Warning"
                  : "Critical"
          }
          onClick={onNavigateSlide ? () => onNavigateSlide("target-gap") : undefined}
        />
        <KpiCard
          label="Production Loss"
          value={`${formatCompactQuantity(totalProductionLoss)} NOS`}
          exactValue={`${formatExactQuantity(totalProductionLoss)} NOS`}
          target="Units lost (Prod Loss NOS)"
          variance={hasPrev ? `${comp.productionLoss.formattedDelta} vs prior` : undefined}
          varianceType={hasPrev ? comp.productionLoss.varianceStatus : undefined}
        />
      </KpiGrid>

      {onNavigateSlide && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.875rem" }}>
          <button
            type="button"
            className="btn btn--small btn--outline"
            style={{
              fontSize: "12px",
              padding: "5px 12px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              borderColor: "#2563EB",
              color: "#2563EB",
              fontWeight: 600,
              borderRadius: "6px",
              cursor: "pointer",
            }}
            onClick={() => onNavigateSlide("target-gap")}
            title="Open Target / Achievement / Gap Analysis"
          >
            <span>🎯 Detailed Target / Achievement / Gap Analysis →</span>
          </button>
        </div>
      )}

      <div className="carousel-chart-row">
        {trendData.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Production Trend ({granularityLabel})</div>
            <ReactECharts
              option={productionTrendOption}
              style={{ height: "300px" }}
              notMerge
            />
          </div>
        )}
        {trendData.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Target vs Actual ({granularityLabel})</div>
            <ReactECharts option={targetVsActualOption} style={{ height: "300px" }} notMerge />
          </div>
        )}
      </div>
    </div>
  );
}
