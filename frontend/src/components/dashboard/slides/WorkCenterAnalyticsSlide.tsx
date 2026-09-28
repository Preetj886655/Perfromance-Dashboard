/**
 * WorkCenterAnalyticsSlide — SLIDE 11: WORK CENTER ANALYTICS
 *
 * Comprehensive Work Center operational analysis:
 * - Production, Target, Achievement %
 * - Downtime and Downtime Contribution % (parent total share)
 * - Production Loss and Loss Contribution %
 * - Rejection and Rejection Rate %
 * - Sample-size-protected Rankings (Best, Worst, Highest DT, Highest Loss, Highest Rejection)
 * - Zero-data safeguards
 * - Downtime contribution chart, Loss contribution chart, and Trend by Work Center
 * - Interactive drill-down into Machines
 */

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import type { WorkCenterPerformance, WorkCenterTrendPoint } from "../../../data/calculations/hierarchyEngine";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import {
  CHART_COLORS,
  tooltipStyle,
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
  onSelectWorkCenter?: (workCenter: string) => void;
  selectedWorkCenter?: string;
}

const EMPTY_WORK_CENTERS: WorkCenterPerformance[] = [];
const EMPTY_TREND: WorkCenterTrendPoint[] = [];

export function WorkCenterAnalyticsSlide({ analytics, onSelectWorkCenter, selectedWorkCenter }: Props) {
  const workCenters = analytics.hierarchyAnalysis?.workCenters ?? EMPTY_WORK_CENTERS;
  const rankings = analytics.hierarchyAnalysis?.rankings;
  const trendData = analytics.hierarchyAnalysis?.trendByWorkCenter ?? EMPTY_TREND;
  const hasData = analytics.totalRecords > 0 && workCenters.length > 0;

  const activeWorkCenters = useMemo(
    () => workCenters.filter((w) => w.recordCount > 0),
    [workCenters]
  );

  // 1. Downtime Contribution Chart (Donut / Pie)
  const downtimeContribOption = useMemo(() => {
    const data = activeWorkCenters
      .filter((w) => w.downtimeMinutes > 0)
      .map((w) => ({
        name: w.workCenterKey,
        value: Math.round(w.downtimeMinutes),
      }));

    return {
      tooltip: {
        trigger: "item",
        ...tooltipStyle,
        formatter: (params: { name: string; value: number; percent: number }) =>
          `<strong>${params.name}</strong><br/>Downtime: <strong>${formatCompactQuantity(params.value)} min</strong> (${formatExactQuantity(params.value)} min)<br/>Contribution: ${params.percent.toFixed(1)}%`,
      },
      legend: {
        type: "scroll",
        bottom: 0,
        textStyle: { fontSize: 10, color: CHART_COLORS.text, fontFamily: "'Inter', sans-serif" },
      },
      series: [
        {
          name: "Downtime Contribution",
          type: "pie",
          radius: ["42%", "70%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 4,
            borderColor: "#FFFFFF",
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: "{b}: {d}%",
            color: CHART_COLORS.text,
            fontSize: 10,
          },
          data,
        },
      ],
    };
  }, [activeWorkCenters]);

  // 2. Production Loss Contribution Chart (Donut / Pie)
  const lossContribOption = useMemo(() => {
    const data = activeWorkCenters
      .filter((w) => w.productionLoss > 0)
      .map((w) => ({
        name: w.workCenterKey,
        value: Math.round(w.productionLoss),
      }));

    return {
      tooltip: {
        trigger: "item",
        ...tooltipStyle,
        formatter: (params: { name: string; value: number; percent: number }) =>
          `<strong>${params.name}</strong><br/>Loss: <strong>${formatCompactQuantity(params.value)} NOS</strong> (${formatExactQuantity(params.value)} NOS)<br/>Contribution: ${params.percent.toFixed(1)}%`,
      },
      legend: {
        type: "scroll",
        bottom: 0,
        textStyle: { fontSize: 10, color: CHART_COLORS.text, fontFamily: "'Inter', sans-serif" },
      },
      series: [
        {
          name: "Production Loss Contribution",
          type: "pie",
          radius: ["42%", "70%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 4,
            borderColor: "#FFFFFF",
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: "{b}: {d}%",
            color: CHART_COLORS.text,
            fontSize: 10,
          },
          data,
        },
      ],
    };
  }, [activeWorkCenters]);

  // 3. Trend by Work Center (Output over time across top work centers)
  const trendOption = useMemo(() => {
    if (trendData.length === 0) return null;
    const topWcs = activeWorkCenters.slice(0, 5).map((w) => w.workCenterKey);
    const dates = trendData.map((d) => d.date);

    const series = topWcs.map((wc) => ({
      name: wc,
      type: "line" as const,
      smooth: true,
      showSymbol: false,
      data: trendData.map((d) => (typeof d[wc] === "number" ? Math.round(d[wc] as number) : 0)),
    }));

    return {
      grid: gridStyle({ left: 75, right: 30, top: 35, bottom: 40 }),
      tooltip: {
        trigger: "axis",
        ...tooltipStyle,
        formatter: (params: Array<{ marker: string; seriesName: string; value: number }>) => {
          let str = "";
          params.forEach((p) => {
            str += `${p.marker} ${p.seriesName}: <strong>${formatCompactQuantity(p.value)}</strong> <span style="font-size:0.75rem;opacity:0.8">(${formatExactQuantity(p.value)})</span><br/>`;
          });
          return str;
        },
      },
      legend: {
        data: topWcs,
        top: 0,
        textStyle: { fontSize: 10, color: CHART_COLORS.text, fontFamily: "'Inter', sans-serif" },
      },
      xAxis: {
        ...xAxisCategoryStyle,
        data: dates,
        axisLabel: { ...axisLabelStyle, rotate: dates.length > 20 ? 30 : 0 },
      },
      yAxis: {
        ...yAxisStyle,
        axisLabel: { ...axisLabelStyle, formatter: (v: number) => formatCompactQuantity(v) },
      },
      series,
    };
  }, [trendData, activeWorkCenters]);

  if (!hasData) {
    return (
      <div className="period-comparison-empty">
        <span className="period-comparison-empty__icon">ℹ</span>
        <div>
          <h4>No data available</h4>
          <p>No records found matching the active filter criteria for work center analysis.</p>
        </div>
      </div>
    );
  }

  const bestWc = rankings?.bestWorkCenter;
  const worstWc = rankings?.worstWorkCenter;
  const topDtWc = rankings?.highestDowntimeWorkCenter;
  const topLossWc = rankings?.highestLossWorkCenter;

  return (
    <div>
      {/* Sample-Size-Protected Rankings Grid */}
      <KpiGrid>
        <KpiCard
          label="Best Work Center"
          value={bestWc ? truncateLabel(bestWc.workCenterKey, 14) : "N/A"}
          target={bestWc?.achievement != null ? `${bestWc.achievement.toFixed(1)}% ach (Qualified: ${bestWc.recordCount} rows)` : "No qualified center"}
          status={bestWc ? "Good" : "Warning"}
        />
        <KpiCard
          label="Lowest Attainment"
          value={worstWc ? truncateLabel(worstWc.workCenterKey, 14) : "N/A"}
          target={worstWc?.achievement != null ? `${worstWc.achievement.toFixed(1)}% ach (Qualified: ${worstWc.recordCount} rows)` : "No qualified center"}
          status={worstWc ? "Critical" : "Good"}
        />
        <KpiCard
          label="Highest Downtime"
          value={topDtWc ? truncateLabel(topDtWc.workCenterKey, 14) : "N/A"}
          target={topDtWc ? `${formatCompactQuantity(topDtWc.downtimeMinutes)} min (${formatExactQuantity(topDtWc.downtimeMinutes)} min) · ${topDtWc.downtimeContributionPercent.toFixed(1)}% share` : ""}
          status="Critical"
        />
        <KpiCard
          label="Highest Production Loss"
          value={topLossWc ? truncateLabel(topLossWc.workCenterKey, 14) : "N/A"}
          target={topLossWc ? `${formatCompactQuantity(topLossWc.productionLoss)} NOS (${formatExactQuantity(topLossWc.productionLoss)} NOS) · ${topLossWc.lossContributionPercent.toFixed(1)}% share` : ""}
          status="Warning"
        />
      </KpiGrid>

      {selectedWorkCenter && selectedWorkCenter !== "All Work Centers" && (
        <div className="hierarchy-drill-banner">
          <span>Active Work Center Drill: <strong>{selectedWorkCenter}</strong></span>
          {onSelectWorkCenter && (
            <button type="button" onClick={() => onSelectWorkCenter("All Work Centers")}>
              Reset to All Work Centers
            </button>
          )}
        </div>
      )}

      {/* Contribution Charts Row */}
      <div className="carousel-chart-row">
        <ChartCard title="Downtime Contribution % by Work Center" eyebrow="Idle Time Share">
          <ReactECharts
            option={downtimeContribOption}
            style={{ height: 240 }}
            notMerge
            opts={{ renderer: "canvas" }}
            onEvents={
              onSelectWorkCenter
                ? {
                    click: (params: { name?: string }) => {
                      if (params.name) onSelectWorkCenter(params.name);
                    },
                  }
                : undefined
            }
          />
        </ChartCard>

        <ChartCard title="Production Loss Contribution % by Work Center" eyebrow="Loss Concentration">
          <ReactECharts
            option={lossContribOption}
            style={{ height: 240 }}
            notMerge
            opts={{ renderer: "canvas" }}
            onEvents={
              onSelectWorkCenter
                ? {
                    click: (params: { name?: string }) => {
                      if (params.name) onSelectWorkCenter(params.name);
                    },
                  }
                : undefined
            }
          />
        </ChartCard>
      </div>

      {/* Output Trend by Work Center */}
      {trendOption && (
        <ChartCard title="Production Trend by Work Center" eyebrow="Temporal Movement" style={{ marginTop: "1rem" }}>
          <ReactECharts option={trendOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
        </ChartCard>
      )}

      {/* Detailed Work Center Telemetry & Drill Table */}
      <div className="hud-card hud-card--compact" style={{ marginTop: "1rem" }}>
        <div className="hud-card__header">
          <span className="hud-card__eyebrow">Hierarchy Level 2</span>
          <h4 className="hud-card__title">Work Center Breakdown & Equipment Telemetry</h4>
        </div>
        <div className="hud-card__content" style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", fontSize: "0.8125rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Work Center</th>
                <th style={{ textAlign: "center" }}>Machines</th>
                <th style={{ textAlign: "right" }}>Production</th>
                <th style={{ textAlign: "right" }}>Target</th>
                <th style={{ textAlign: "right" }}>Ach %</th>
                <th style={{ textAlign: "right" }}>Downtime</th>
                <th style={{ textAlign: "right" }}>DT Share</th>
                <th style={{ textAlign: "right" }}>Loss (NOS)</th>
                <th style={{ textAlign: "right" }}>Loss Share</th>
                <th style={{ textAlign: "right" }}>Rej Rate</th>
                <th style={{ textAlign: "center" }}>Rank Qualification</th>
                <th style={{ textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {activeWorkCenters.map((wc: WorkCenterPerformance) => (
                <tr
                  key={wc.workCenterKey}
                  style={{
                    background: selectedWorkCenter === wc.workCenterKey ? "rgba(34, 211, 238, 0.08)" : undefined,
                  }}
                >
                  <td style={{ fontWeight: 600 }}>{wc.workCenterKey}</td>
                  <td style={{ textAlign: "center" }}>{wc.machinesCount}</td>
                  <td style={{ textAlign: "right" }} title={`Production: ${formatExactQuantity(wc.production)} NOS`}>
                    <div style={{ fontWeight: 600 }}>{formatCompactQuantity(wc.production)}</div>
                    <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>({formatExactQuantity(wc.production)})</div>
                  </td>
                  <td style={{ textAlign: "right" }} title={wc.target > 0 ? `Target: ${formatExactQuantity(wc.target)} NOS` : undefined}>
                    {wc.target > 0 ? (
                      <>
                        <div style={{ fontWeight: 600 }}>{formatCompactQuantity(wc.target)}</div>
                        <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>({formatExactQuantity(wc.target)})</div>
                      </>
                    ) : "-"}
                  </td>
                  <td style={{ textAlign: "right", color: wc.achievement && wc.achievement >= 85 ? "#22C55E" : wc.achievement ? "#F59E0B" : "inherit" }}>
                    {wc.achievement !== null ? `${wc.achievement.toFixed(1)}%` : "N/A"}
                  </td>
                  <td style={{ textAlign: "right" }} title={`Downtime: ${formatExactQuantity(wc.downtimeMinutes)} min`}>
                    <div>{formatCompactQuantity(wc.downtimeMinutes)} min</div>
                    <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>({formatExactQuantity(wc.downtimeMinutes)})</div>
                  </td>
                  <td style={{ textAlign: "right", color: wc.downtimeContributionPercent > 40 ? "#EF4444" : "inherit" }}>
                    {wc.downtimeContributionPercent.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: "right" }} title={`Loss: ${formatExactQuantity(wc.productionLoss)} NOS`}>
                    <div>{formatCompactQuantity(wc.productionLoss)}</div>
                    <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>({formatExactQuantity(wc.productionLoss)})</div>
                  </td>
                  <td style={{ textAlign: "right", color: wc.lossContributionPercent > 40 ? "#EF4444" : "inherit" }}>
                    {wc.lossContributionPercent.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {wc.rejectionRate !== null ? `${wc.rejectionRate.toFixed(2)}%` : "N/A"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {wc.qualifiedForRanking ? (
                      <span className="status-pill status-pill--good" style={{ fontSize: "0.6875rem" }}>Qualified</span>
                    ) : (
                      <span className="status-pill status-pill--warning" title={wc.qualificationReason} style={{ fontSize: "0.6875rem" }}>
                        Low Sample
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {onSelectWorkCenter && (
                      <button
                        type="button"
                        className="btn btn--xs btn--ghost"
                        onClick={() => onSelectWorkCenter(wc.workCenterKey)}
                        style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                      >
                        Drill Machines ({wc.machinesCount}) →
                      </button>
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
