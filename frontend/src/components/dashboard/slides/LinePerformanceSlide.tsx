/**
 * LinePerformanceSlide — SLIDE 7: LINE PERFORMANCE
 *
 * Compares ERC Line, SKL Line, BFS Line, and Injection Moulding on:
 * Production, Target, Achievement %, Downtime, Production Loss, Rejection,
 * Rejection Rate %, and Machine Utilization.
 *
 * Surfaces best / worst / highest-downtime line with zero-data safeguards
 * and interactive drill-down into Work Centers.
 */

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import type { LinePerformance } from "../../../data/calculations/hierarchyEngine";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import {
  CHART_COLORS,
  truncateLabel,
  xAxisCategoryStyle,
  axisLabelStyle,
  gridStyle,
  tooltipStyle,
  yAxisStyle,
  formatCompactQuantity,
  formatExactQuantity,
} from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
  onSelectLine?: (line: string) => void;
  selectedLine?: string;
}

const EMPTY_LINES: LinePerformance[] = [];

export function LinePerformanceSlide({ analytics, onSelectLine, selectedLine }: Props) {
  const lines = analytics.hierarchyAnalysis?.lines ?? EMPTY_LINES;
  const hasData = analytics.totalRecords > 0;

  // Active lines with records
  const activeLines = useMemo(() => lines.filter((l) => l.recordCount > 0), [lines]);

  const sortedByAchievement = useMemo(
    () => [...activeLines].filter((l) => l.achievement !== null).sort((a, b) => (b.achievement ?? -1) - (a.achievement ?? -1)),
    [activeLines]
  );

  const sortedByDowntime = useMemo(
    () => [...activeLines].sort((a, b) => b.downtimeMinutes - a.downtimeMinutes),
    [activeLines]
  );

  const bestLine = sortedByAchievement[0];
  const worstLine = sortedByAchievement.length > 1 ? sortedByAchievement[sortedByAchievement.length - 1] : null;
  const topDowntimeLine = sortedByDowntime[0];

  const productionOption = useMemo(() => {
    // Show active lines, or all standard business lines if empty
    const displayLines = activeLines.length > 0 ? activeLines : lines;
    return {
      grid: gridStyle({ left: 75, bottom: 40 }),
      tooltip: {
        trigger: "axis",
        ...tooltipStyle,
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const title = `<div style="font-weight: 700; margin-bottom: 4px; color: #172033;">${params[0].axisValueLabel || params[0].name}</div>`;
          const items = params
            .map((p: any) => {
              const val = Number(p.value);
              const isMin = p.seriesName.includes("min");
              const unit = isMin ? "min" : "NOS";
              return `<div style="display:flex; justify-content:space-between; gap:12px; font-size:12px; margin-top:2px;">
                <span>${p.marker} ${p.seriesName}:</span>
                <strong>${formatCompactQuantity(val)} ${unit} <span style="font-size:10px; color:#64748B;">(${formatExactQuantity(val)} ${unit})</span></strong>
              </div>`;
            })
            .join("");
          return `<div>${title}${items}</div>`;
        },
      },
      legend: {
        data: ["Production", "Target", "Downtime (min)", "Prod Loss (NOS)"],
        top: 0,
        textStyle: { fontSize: 11, color: CHART_COLORS.text, fontFamily: "'Inter', sans-serif" },
      },
      xAxis: {
        ...xAxisCategoryStyle,
        data: displayLines.map((g) => truncateLabel(g.lineKey, 14)),
      },
      yAxis: [
        {
          type: "value" as const,
          name: "Units",
          axisLabel: axisLabelStyle,
          nameTextStyle: { fontSize: 9, color: CHART_COLORS.text },
          splitLine: { lineStyle: { color: CHART_COLORS.gridLine, type: "dashed" } },
        },
        {
          type: "value" as const,
          name: "min / NOS",
          axisLabel: axisLabelStyle,
          nameTextStyle: { fontSize: 9, color: CHART_COLORS.text },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Production",
          type: "bar" as const,
          data: displayLines.map((g) => Math.round(g.production)),
          itemStyle: { color: CHART_COLORS.prod, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: "Target",
          type: "bar" as const,
          data: displayLines.map((g) => Math.round(g.target)),
          itemStyle: { color: "#64748B", borderRadius: [3, 3, 0, 0] },
        },
        {
          name: "Downtime (min)",
          type: "line" as const,
          yAxisIndex: 1,
          data: displayLines.map((g) => Math.round(g.downtimeMinutes)),
          itemStyle: { color: CHART_COLORS.downtime },
          lineStyle: { color: CHART_COLORS.downtime, width: 2 },
          smooth: true,
        },
        {
          name: "Prod Loss (NOS)",
          type: "bar" as const,
          yAxisIndex: 1,
          data: displayLines.map((g) => Math.round(g.productionLoss)),
          itemStyle: { color: CHART_COLORS.loss, borderRadius: [3, 3, 0, 0] },
        },
      ],
    };
  }, [activeLines, lines]);

  const achievementOption = useMemo(() => {
    const displayLines = sortedByAchievement.length > 0 ? sortedByAchievement : lines;
    return {
      grid: gridStyle({ left: 75, bottom: 40 }),
      tooltip: {
        trigger: "axis",
        ...tooltipStyle,
        valueFormatter: (v: number) => (v > 0 ? `${v.toFixed(1)}%` : "N/A"),
      },
      xAxis: {
        ...xAxisCategoryStyle,
        data: displayLines.map((g) => truncateLabel(g.lineKey, 14)),
      },
      yAxis: {
        ...yAxisStyle,
        axisLabel: { ...axisLabelStyle, formatter: (val: number) => `${val}%` },
      },
      series: [
        {
          name: "Achievement",
          type: "bar" as const,
          data: displayLines.map((g) => (g.achievement ?? 0)),
          itemStyle: {
            color: (params: { value: number }) =>
              params.value >= 85 ? CHART_COLORS.good : params.value >= 60 ? CHART_COLORS.loss : CHART_COLORS.downtime,
            borderRadius: [3, 3, 0, 0],
          },
        },
      ],
    };
  }, [sortedByAchievement, lines]);

  if (!hasData) {
    return (
      <div className="period-comparison-empty">
        <span className="period-comparison-empty__icon">ℹ</span>
        <div>
          <h4>No data available</h4>
          <p>No records found matching the active filter criteria for line comparison.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Best Performing Line"
          value={bestLine ? truncateLabel(bestLine.lineKey, 14) : "N/A"}
          exactValue={bestLine ? `${formatCompactQuantity(bestLine.production)} NOS (${formatExactQuantity(bestLine.production)} NOS)` : undefined}
          target={bestLine?.achievement != null ? `${bestLine.achievement.toFixed(1)}% achievement` : "No target recorded"}
          status={bestLine ? "Good" : "Warning"}
        />
        <KpiCard
          label="Lowest Attainment Line"
          value={worstLine ? truncateLabel(worstLine.lineKey, 14) : "N/A"}
          exactValue={worstLine ? `${formatCompactQuantity(worstLine.production)} NOS (${formatExactQuantity(worstLine.production)} NOS)` : undefined}
          target={worstLine?.achievement != null ? `${worstLine.achievement.toFixed(1)}% achievement` : "No target recorded"}
          status={worstLine ? "Critical" : "Good"}
        />
        <KpiCard
          label="Highest Downtime Line"
          value={topDowntimeLine ? truncateLabel(topDowntimeLine.lineKey, 14) : "N/A"}
          exactValue={topDowntimeLine ? `${formatCompactQuantity(topDowntimeLine.downtimeMinutes)} min` : undefined}
          target={topDowntimeLine ? `${formatExactQuantity(topDowntimeLine.downtimeMinutes)} min (${topDowntimeLine.downtimeContributionPercent.toFixed(1)}% plant DT)` : ""}
          status="Warning"
        />
        <KpiCard
          label="Lines Active"
          value={`${activeLines.length} / ${lines.length}`}
          target="Supported business lines"
        />
      </KpiGrid>

      {selectedLine && selectedLine !== "All Lines" && (
        <div className="hierarchy-drill-banner">
          <span>Active Line Drill: <strong>{selectedLine}</strong></span>
          {onSelectLine && (
            <button type="button" onClick={() => onSelectLine("All Lines")}>
              Reset to All Lines
            </button>
          )}
        </div>
      )}

      <div className="carousel-chart-row">
        <ChartCard title="Line Comparison — Output, Targets & Losses" eyebrow="Hierarchy Level 1">
          <ReactECharts
            option={productionOption}
            style={{ height: 230 }}
            notMerge
            opts={{ renderer: "canvas" }}
            onEvents={
              onSelectLine
                ? {
                    click: (params: { name?: string }) => {
                      if (params.name) {
                        const matched = lines.find((l) => l.lineKey.includes(params.name!) || params.name!.includes(l.lineKey));
                        if (matched) onSelectLine(matched.lineKey);
                      }
                    },
                  }
                : undefined
            }
          />
        </ChartCard>

        <ChartCard title="Target Achievement % by Line" eyebrow="Attainment Efficiency">
          <ReactECharts
            option={achievementOption}
            style={{ height: 230 }}
            notMerge
            opts={{ renderer: "canvas" }}
            onEvents={
              onSelectLine
                ? {
                    click: (params: { name?: string }) => {
                      if (params.name) {
                        const matched = lines.find((l) => l.lineKey.includes(params.name!) || params.name!.includes(l.lineKey));
                        if (matched) onSelectLine(matched.lineKey);
                      }
                    },
                  }
                : undefined
            }
          />
        </ChartCard>
      </div>

      {/* Detailed Line Performance Matrix */}
      <div className="hud-card hud-card--compact" style={{ marginTop: "1rem" }}>
        <div className="hud-card__header">
          <span className="hud-card__eyebrow">Enterprise Telemetry</span>
          <h4 className="hud-card__title">Manufacturing Line Portfolio Matrix</h4>
        </div>
        <div className="hud-card__content" style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", fontSize: "0.8125rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Line</th>
                <th style={{ textAlign: "right" }}>Production</th>
                <th style={{ textAlign: "right" }}>Target</th>
                <th style={{ textAlign: "right" }}>Ach %</th>
                <th style={{ textAlign: "right" }}>Downtime</th>
                <th style={{ textAlign: "right" }}>DT Share</th>
                <th style={{ textAlign: "right" }}>Loss (NOS)</th>
                <th style={{ textAlign: "right" }}>Rejection</th>
                <th style={{ textAlign: "right" }}>Rej Rate</th>
                <th style={{ textAlign: "right" }}>Util %</th>
                <th style={{ textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l: LinePerformance) => (
                <tr
                  key={l.lineKey}
                  style={{
                    opacity: l.recordCount === 0 ? 0.5 : 1,
                    background: selectedLine === l.lineKey ? "rgba(34, 211, 238, 0.08)" : undefined,
                  }}
                >
                  <td style={{ fontWeight: 600, color: "#FFFFFF" }}>{l.lineKey}</td>
                  <td style={{ textAlign: "right" }} title={`Production: ${formatExactQuantity(l.production)} NOS`}>
                    <div>{formatCompactQuantity(l.production)}</div>
                    <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>{formatExactQuantity(l.production)}</div>
                  </td>
                  <td style={{ textAlign: "right" }} title={`Target: ${formatExactQuantity(l.target)} NOS`}>
                    {l.target > 0 ? (
                      <>
                        <div>{formatCompactQuantity(l.target)}</div>
                        <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>{formatExactQuantity(l.target)}</div>
                      </>
                    ) : "-"}
                  </td>
                  <td style={{ textAlign: "right", color: l.achievement && l.achievement >= 85 ? "#22C55E" : l.achievement ? "#F59E0B" : "inherit" }}>
                    {l.achievement !== null ? `${l.achievement.toFixed(1)}%` : "N/A"}
                  </td>
                  <td style={{ textAlign: "right" }} title={`Downtime: ${formatExactQuantity(l.downtimeMinutes)} min`}>
                    <div>{formatCompactQuantity(l.downtimeMinutes)} min</div>
                    <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>{formatExactQuantity(l.downtimeMinutes)} min</div>
                  </td>
                  <td style={{ textAlign: "right", color: l.downtimeContributionPercent > 50 ? "#EF4444" : "inherit" }}>
                    {l.downtimeContributionPercent.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: "right" }} title={`Loss: ${formatExactQuantity(l.productionLoss)} NOS`}>
                    <div>{formatCompactQuantity(l.productionLoss)}</div>
                    <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>{formatExactQuantity(l.productionLoss)}</div>
                  </td>
                  <td style={{ textAlign: "right" }} title={`Rejection: ${formatExactQuantity(l.rejection)} pcs`}>
                    <div>{formatCompactQuantity(l.rejection)}</div>
                    <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>{formatExactQuantity(l.rejection)}</div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {l.rejectionRate !== null ? `${l.rejectionRate.toFixed(2)}%` : "N/A"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {l.utilizationPercent !== null ? `${l.utilizationPercent.toFixed(1)}%` : "N/A"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {l.recordCount > 0 && onSelectLine ? (
                      <button
                        type="button"
                        className="btn btn--xs btn--ghost"
                        onClick={() => onSelectLine(l.lineKey)}
                        style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                      >
                        Drill Work Centers →
                      </button>
                    ) : (
                      <span style={{ color: "#64748B", fontSize: "0.75rem" }}>No Data</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
