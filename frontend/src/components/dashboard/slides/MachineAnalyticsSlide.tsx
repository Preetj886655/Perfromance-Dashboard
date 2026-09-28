/**
 * MachineAnalyticsSlide — SLIDE 12: MACHINE ANALYTICS & DRILL-DOWN
 *
 * Equipment-level operational telemetry within the manufacturing hierarchy:
 * - Filtered by active Work Center or Line (when drilled)
 * - Machine Downtime and Loss Contribution % (within parent Work Center)
 * - Top machines by Downtime, Production Loss, and Output
 * - Interactive click on machine opens dedicated MachineDetailModal
 * - Zero-data safeguards
 */

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import type { MachinePerformance } from "../../../data/calculations/hierarchyEngine";
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
  onSelectMachine?: (machine: MachinePerformance) => void;
  selectedWorkCenter?: string;
  onResetWorkCenter?: () => void;
}

const EMPTY_MACHINES: MachinePerformance[] = [];

export function MachineAnalyticsSlide({
  analytics,
  onSelectMachine,
  selectedWorkCenter,
  onResetWorkCenter,
}: Props) {
  const allMachines = analytics.hierarchyAnalysis?.machines ?? EMPTY_MACHINES;
  const hasData = analytics.totalRecords > 0 && allMachines.length > 0;

  // Filter machines if a specific work center is selected (drill-down scope)
  const scopedMachines = useMemo(() => {
    if (!selectedWorkCenter || selectedWorkCenter === "All Work Centers") {
      return allMachines;
    }
    return allMachines.filter((m) => m.workCenterKey === selectedWorkCenter);
  }, [allMachines, selectedWorkCenter]);

  const topDowntimeMachines = useMemo(
    () => [...scopedMachines].sort((a, b) => b.downtimeMinutes - a.downtimeMinutes).slice(0, 10),
    [scopedMachines]
  );

  const topLossMachines = useMemo(
    () => [...scopedMachines].sort((a, b) => b.productionLoss - a.productionLoss).slice(0, 10),
    [scopedMachines]
  );

  const topProdMachines = useMemo(
    () => [...scopedMachines].sort((a, b) => b.production - a.production).slice(0, 10),
    [scopedMachines]
  );

  const topMachineDown = topDowntimeMachines[0];
  const topMachineLoss = topLossMachines[0];

  const downtimeOption = useMemo(
    () => ({
      grid: gridStyle({ left: 80, bottom: 50 }),
      tooltip: {
        trigger: "axis",
        ...tooltipStyle,
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const m = topDowntimeMachines[params[0].dataIndex];
          if (!m) return "";
          return `
            <strong>${m.machineKey}</strong> (${m.workCenterKey})<br/>
            Downtime: <strong>${formatCompactQuantity(m.downtimeMinutes)} min</strong> (${formatExactQuantity(m.downtimeMinutes)} min)<br/>
            Share of ${m.workCenterKey} DT: <strong>${m.downtimeContributionToWorkCenterPercent.toFixed(1)}%</strong><br/>
            Share of Plant DT: <strong>${m.downtimeContributionToPlantPercent.toFixed(2)}%</strong>
          `;
        },
      },
      xAxis: {
        ...xAxisCategoryStyle,
        data: topDowntimeMachines.map((m) => truncateLabel(m.machineKey, 14)),
        axisLabel: { ...axisLabelStyle, rotate: 25 },
      },
      yAxis: {
        ...yAxisStyle,
        axisLabel: { ...axisLabelStyle, formatter: (v: number) => formatCompactQuantity(v) },
      },
      series: [
        {
          name: "Downtime (min)",
          type: "bar" as const,
          data: topDowntimeMachines.map((m) => Math.round(m.downtimeMinutes)),
          itemStyle: { color: CHART_COLORS.machine, borderRadius: [3, 3, 0, 0] },
        },
      ],
    }),
    [topDowntimeMachines]
  );

  const lossOption = useMemo(
    () => ({
      grid: gridStyle({ left: 80, bottom: 50 }),
      tooltip: {
        trigger: "axis",
        ...tooltipStyle,
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const m = topLossMachines[params[0].dataIndex];
          if (!m) return "";
          return `
            <strong>${m.machineKey}</strong> (${m.workCenterKey})<br/>
            Loss: <strong>${formatCompactQuantity(m.productionLoss)} NOS</strong> (${formatExactQuantity(m.productionLoss)} NOS)<br/>
            Share of ${m.workCenterKey} Loss: <strong>${m.lossContributionToWorkCenterPercent.toFixed(1)}%</strong>
          `;
        },
      },
      xAxis: {
        ...xAxisCategoryStyle,
        data: topLossMachines.map((m) => truncateLabel(m.machineKey, 14)),
        axisLabel: { ...axisLabelStyle, rotate: 25 },
      },
      yAxis: {
        ...yAxisStyle,
        axisLabel: { ...axisLabelStyle, formatter: (v: number) => formatCompactQuantity(v) },
      },
      series: [
        {
          name: "Prod Loss (NOS)",
          type: "bar" as const,
          data: topLossMachines.map((m) => Math.round(m.productionLoss)),
          itemStyle: { color: CHART_COLORS.loss, borderRadius: [3, 3, 0, 0] },
        },
      ],
    }),
    [topLossMachines]
  );

  const productionOption = useMemo(
    () => ({
      grid: gridStyle({ left: 80, bottom: 50 }),
      tooltip: {
        trigger: "axis",
        ...tooltipStyle,
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const m = topProdMachines[params[0].dataIndex];
          if (!m) return "";
          return `
            <strong>${m.machineKey}</strong><br/>
            Production: <strong>${formatCompactQuantity(m.production)} NOS</strong> (${formatExactQuantity(m.production)} NOS)
          `;
        },
      },
      xAxis: {
        ...xAxisCategoryStyle,
        data: topProdMachines.map((m) => truncateLabel(m.machineKey, 14)),
        axisLabel: { ...axisLabelStyle, rotate: 25 },
      },
      yAxis: {
        ...yAxisStyle,
        axisLabel: { ...axisLabelStyle, formatter: (v: number) => formatCompactQuantity(v) },
      },
      series: [
        {
          name: "Production",
          type: "bar" as const,
          data: topProdMachines.map((m) => Math.round(m.production)),
          itemStyle: { color: CHART_COLORS.prod, borderRadius: [3, 3, 0, 0] },
        },
      ],
    }),
    [topProdMachines]
  );

  if (!hasData || scopedMachines.length === 0) {
    return (
      <div className="period-comparison-empty">
        <span className="period-comparison-empty__icon">ℹ</span>
        <div>
          <h4>No data available</h4>
          <p>
            {selectedWorkCenter && selectedWorkCenter !== "All Work Centers"
              ? `No machines found under Work Center "${selectedWorkCenter}".`
              : "No machine records found matching the active filter criteria."}
          </p>
          {onResetWorkCenter && selectedWorkCenter && (
            <button
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={onResetWorkCenter}
              style={{ marginTop: "0.5rem" }}
            >
              Reset to All Work Centers
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Top Machine (Downtime)"
          value={topMachineDown ? truncateLabel(topMachineDown.machineKey, 14) : "N/A"}
          target={topMachineDown ? `${formatCompactQuantity(topMachineDown.downtimeMinutes)} min (${formatExactQuantity(topMachineDown.downtimeMinutes)} min) · ${topMachineDown.downtimeContributionToWorkCenterPercent.toFixed(1)}% of WC` : ""}
          status="Critical"
        />
        <KpiCard
          label="Top Machine (Loss)"
          value={topMachineLoss ? truncateLabel(topMachineLoss.machineKey, 14) : "N/A"}
          target={topMachineLoss ? `${formatCompactQuantity(topMachineLoss.productionLoss)} NOS (${formatExactQuantity(topMachineLoss.productionLoss)} NOS) · ${topMachineLoss.lossContributionToWorkCenterPercent.toFixed(1)}% of WC` : ""}
          status="Warning"
        />
        <KpiCard
          label="Machines Visible"
          value={String(scopedMachines.length)}
          target={selectedWorkCenter ? `Under ${selectedWorkCenter}` : "Across active plant"}
        />
        <KpiCard
          label="Machines w/ Output"
          value={String(scopedMachines.filter((m) => m.production > 0).length)}
          target="Recorded production"
        />
      </KpiGrid>

      {selectedWorkCenter && selectedWorkCenter !== "All Work Centers" && (
        <div className="hierarchy-drill-banner">
          <span>Drilled Scope: Machines in <strong>{selectedWorkCenter}</strong></span>
          {onResetWorkCenter && (
            <button type="button" onClick={onResetWorkCenter}>
              View All Work Centers
            </button>
          )}
        </div>
      )}

      <div className="carousel-chart-row">
        <ChartCard title="Top Machines by Downtime (min)" eyebrow="Equipment Idle Time">
          <ReactECharts
            option={downtimeOption}
            style={{ height: 230 }}
            notMerge
            opts={{ renderer: "canvas" }}
            onEvents={
              onSelectMachine
                ? {
                    click: (params: { name?: string }) => {
                      if (params.name) {
                        const m = scopedMachines.find((x) => x.machineKey === params.name || params.name!.includes(x.machineKey));
                        if (m) onSelectMachine(m);
                      }
                    },
                  }
                : undefined
            }
          />
        </ChartCard>

        <ChartCard title="Top Machines by Production Loss (NOS)" eyebrow="Volume Impact">
          <ReactECharts
            option={lossOption}
            style={{ height: 230 }}
            notMerge
            opts={{ renderer: "canvas" }}
            onEvents={
              onSelectMachine
                ? {
                    click: (params: { name?: string }) => {
                      if (params.name) {
                        const m = scopedMachines.find((x) => x.machineKey === params.name || params.name!.includes(x.machineKey));
                        if (m) onSelectMachine(m);
                      }
                    },
                  }
                : undefined
            }
          />
        </ChartCard>
      </div>

      {topProdMachines.length > 0 && (
        <ChartCard title="Machine Output Leaderboard" eyebrow="Production Volume" style={{ marginTop: "1rem" }}>
          <ReactECharts
            option={productionOption}
            style={{ height: 230 }}
            notMerge
            opts={{ renderer: "canvas" }}
            onEvents={
              onSelectMachine
                ? {
                    click: (params: { name?: string }) => {
                      if (params.name) {
                        const m = scopedMachines.find((x) => x.machineKey === params.name || params.name!.includes(x.machineKey));
                        if (m) onSelectMachine(m);
                      }
                    },
                  }
                : undefined
            }
          />
        </ChartCard>
      )}

      {/* Machine Telemetry & Modal Trigger Table */}
      <div className="hud-card hud-card--compact" style={{ marginTop: "1rem" }}>
        <div className="hud-card__header">
          <span className="hud-card__eyebrow">Hierarchy Level 3</span>
          <h4 className="hud-card__title">Equipment Telemetry & Contribution Ratios</h4>
        </div>
        <div className="hud-card__content" style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", fontSize: "0.8125rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Machine</th>
                <th style={{ textAlign: "left" }}>Work Center</th>
                <th style={{ textAlign: "right" }}>Production</th>
                <th style={{ textAlign: "right" }}>Target</th>
                <th style={{ textAlign: "right" }}>Ach %</th>
                <th style={{ textAlign: "right" }}>Downtime</th>
                <th style={{ textAlign: "right" }}>WC DT %</th>
                <th style={{ textAlign: "right" }}>Loss (NOS)</th>
                <th style={{ textAlign: "right" }}>WC Loss %</th>
                <th style={{ textAlign: "right" }}>Rej Rate</th>
                <th style={{ textAlign: "center" }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {scopedMachines.slice(0, 15).map((m: MachinePerformance) => (
                <tr key={m.machineKey}>
                  <td style={{ fontWeight: 600 }}>{m.machineKey}</td>
                  <td style={{ color: "var(--cyan, #22D3EE)" }}>{m.workCenterKey}</td>
                  <td style={{ textAlign: "right" }} title={`Production: ${formatExactQuantity(m.production)} NOS`}>
                    <div style={{ fontWeight: 600 }}>{formatCompactQuantity(m.production)}</div>
                    <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>({formatExactQuantity(m.production)})</div>
                  </td>
                  <td style={{ textAlign: "right" }} title={m.target > 0 ? `Target: ${formatExactQuantity(m.target)} NOS` : undefined}>
                    {m.target > 0 ? (
                      <>
                        <div style={{ fontWeight: 600 }}>{formatCompactQuantity(m.target)}</div>
                        <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>({formatExactQuantity(m.target)})</div>
                      </>
                    ) : "-"}
                  </td>
                  <td style={{ textAlign: "right", color: m.achievement && m.achievement >= 85 ? "#22C55E" : m.achievement ? "#F59E0B" : "inherit" }}>
                    {m.achievement !== null ? `${m.achievement.toFixed(1)}%` : "N/A"}
                  </td>
                  <td style={{ textAlign: "right" }} title={`Downtime: ${formatExactQuantity(m.downtimeMinutes)} min`}>
                    <div>{formatCompactQuantity(m.downtimeMinutes)} min</div>
                    <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>({formatExactQuantity(m.downtimeMinutes)})</div>
                  </td>
                  <td style={{ textAlign: "right", color: m.downtimeContributionToWorkCenterPercent > 30 ? "#EF4444" : "inherit" }}>
                    {m.downtimeContributionToWorkCenterPercent.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: "right" }} title={`Loss: ${formatExactQuantity(m.productionLoss)} NOS`}>
                    <div>{formatCompactQuantity(m.productionLoss)}</div>
                    <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>({formatExactQuantity(m.productionLoss)})</div>
                  </td>
                  <td style={{ textAlign: "right", color: m.lossContributionToWorkCenterPercent > 30 ? "#EF4444" : "inherit" }}>
                    {m.lossContributionToWorkCenterPercent.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {m.rejectionRate !== null ? `${m.rejectionRate.toFixed(2)}%` : "N/A"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {onSelectMachine && (
                      <button
                        type="button"
                        className="btn btn--xs btn--ghost"
                        onClick={() => onSelectMachine(m)}
                        style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                      >
                        Inspect 🔍
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {scopedMachines.length > 15 && (
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary, #64748B)", marginTop: "0.5rem", textAlign: "center" }}>
              Showing top 15 of {scopedMachines.length} machines. Click on any machine row to inspect full root-cause telemetry.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
