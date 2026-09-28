/**
 * MaterialPartSlide — SLIDE 9: MATERIAL / PART
 *
 * Shows the material dimension (MK-III, MK-V) separately from raw Part values.
 * Production, production loss, and downtime by material — plus raw part mapping.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import {
  CHART_COLORS,
  tooltipStyle,
  truncateLabel,
  xAxisCategoryStyle,
  yAxisStyle,
  gridStyle,
  formatCompactQuantity,
  formatExactQuantity,
} from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
}

export function MaterialPartSlide({ analytics }: Props) {
  const { byMaterial, lossByMaterial, downtimeByLine, totalProductionLoss } = analytics;

  const topMaterial = byMaterial[0];
  const materialCount = byMaterial.length;

  const productionOption = {
    grid: gridStyle({ left: 80, bottom: 50 }),
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0];
        const val = typeof p.value === "number" ? p.value : 0;
        return `<strong>${p.name}</strong><br/>Production: <strong>${formatCompactQuantity(val)} NOS</strong> (${formatExactQuantity(val)} NOS)`;
      },
    },
    xAxis: { ...xAxisCategoryStyle, data: byMaterial.slice(0, 8).map((m) => truncateLabel(m.key, 14)) },
    yAxis: {
      ...yAxisStyle,
      axisLabel: { ...yAxisStyle.axisLabel, formatter: (v: number) => formatCompactQuantity(v) },
    },
    series: [
      {
        name: "Production",
        type: "bar" as const,
        data: byMaterial.slice(0, 8).map((m) => Math.round(m.production)),
        itemStyle: { color: CHART_COLORS.material },
      },
    ],
  };

  const lossOption = {
    grid: gridStyle({ left: 80, bottom: 50 }),
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0];
        const val = typeof p.value === "number" ? p.value : 0;
        return `<strong>${p.name}</strong><br/>Prod Loss: <strong>${formatCompactQuantity(val)} NOS</strong> (${formatExactQuantity(val)} NOS)`;
      },
    },
    xAxis: { ...xAxisCategoryStyle, data: byMaterial.slice(0, 8).map((m) => truncateLabel(m.key, 14)) },
    yAxis: {
      ...yAxisStyle,
      axisLabel: { ...yAxisStyle.axisLabel, formatter: (v: number) => formatCompactQuantity(v) },
    },
    series: [
      {
        name: "Prod Loss (NOS)",
        type: "bar" as const,
        data: byMaterial.slice(0, 8).map((m) => {
          const ls = lossByMaterial.find((l) => l.key === m.key);
          return ls ? Math.round(ls.minutes) : 0;
        }),
        itemStyle: { color: CHART_COLORS.loss },
      },
    ],
  };

  const dtOption = {
    grid: gridStyle({ left: 80, bottom: 50 }),
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0];
        const val = typeof p.value === "number" ? p.value : 0;
        return `<strong>${p.name}</strong><br/>Downtime: <strong>${formatCompactQuantity(val)} min</strong> (${formatExactQuantity(val)} min)`;
      },
    },
    xAxis: { ...xAxisCategoryStyle, data: byMaterial.slice(0, 8).map((m) => truncateLabel(m.key, 14)) },
    yAxis: {
      ...yAxisStyle,
      axisLabel: { ...yAxisStyle.axisLabel, formatter: (v: number) => formatCompactQuantity(v) },
    },
    series: [
      {
        name: "Downtime (min)",
        type: "bar" as const,
        data: byMaterial.slice(0, 8).map((m) => Math.round(m.downtime)),
        itemStyle: { color: CHART_COLORS.downtime },
      },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Top Material"
          value={topMaterial ? truncateLabel(topMaterial.key, 14) : "N/A"}
          target={topMaterial ? `${formatCompactQuantity(topMaterial.production)} (${formatExactQuantity(topMaterial.production)} units)` : ""}
          status="Good"
        />
        <KpiCard
          label="Materials"
          value={String(materialCount)}
          target="MK-III / MK-V variants"
        />
        <KpiCard
          label="Total Prod Loss"
          value={formatCompactQuantity(totalProductionLoss)}
          exactValue={formatExactQuantity(totalProductionLoss)}
          unit="NOS"
          target="By material selection"
          status={totalProductionLoss > 0 ? "Warning" : "Good"}
        />
        <KpiCard
          label="Downtime by Material"
          value={downtimeByLine.length > 0 ? `${downtimeByLine.length} shifts` : "N/A"}
          target="Material-level idle time"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {byMaterial.length > 0 && (
          <ChartCard title="Production by Material" eyebrow="Output">
            <ReactECharts option={productionOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {lossByMaterial.length > 0 && (
          <ChartCard title="Production Loss by Material" eyebrow="Loss">
            <ReactECharts option={lossOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
      </div>

      {byMaterial.length > 0 && (
        <ChartCard title="Downtime by Material" eyebrow="Idle time">
          <ReactECharts option={dtOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
        </ChartCard>
      )}

      {/* Raw Part → Material mapping table */}
      {byMaterial.length > 0 && (
        <div className="chart-card" style={{ marginTop: "1rem" }}>
          <div className="chart-card__head">
            <h3 className="chart-card__title">Part → Material Mapping</h3>
          </div>
          <div className="chart-card__body" style={{ maxHeight: 200, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${CHART_COLORS.border}` }}>Material</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: `1px solid ${CHART_COLORS.border}` }}>Production</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: `1px solid ${CHART_COLORS.border}` }}>Prod Loss</th>
                </tr>
              </thead>
              <tbody>
                {byMaterial.map((p) => {
                  const lossVal = lossByMaterial.find((l) => l.key === p.key)?.minutes ?? 0;
                  return (
                    <tr key={p.key}>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${CHART_COLORS.border}` }}>{p.key}</td>
                      <td style={{ textAlign: "right", padding: "6px 8px", borderBottom: `1px solid ${CHART_COLORS.border}` }} title={`Production: ${formatExactQuantity(p.production)} NOS`}>
                        <div style={{ fontWeight: 600, color: "#FFFFFF" }}>{formatCompactQuantity(p.production)}</div>
                        <div style={{ fontSize: "0.6875rem", opacity: 0.75, fontFamily: "'JetBrains Mono', monospace" }}>({formatExactQuantity(p.production)})</div>
                      </td>
                      <td style={{ textAlign: "right", padding: "6px 8px", borderBottom: `1px solid ${CHART_COLORS.border}` }} title={`Loss: ${formatExactQuantity(lossVal)} NOS`}>
                        <div>{formatCompactQuantity(lossVal)}</div>
                        <div style={{ fontSize: "0.6875rem", opacity: 0.75, fontFamily: "'JetBrains Mono', monospace" }}>({formatExactQuantity(lossVal)})</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

