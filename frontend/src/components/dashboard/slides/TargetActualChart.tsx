/**
 * Target vs Actual chart — reusable component for Monthly / Weekly /
 * Quarterly / Yearly period analytics in Executive Overview and beyond.
 *
 * Professional Target vs Actual visualization:
 * - Target: Neutral gray bar (#A3A3A3)
 * - Actual: Red bar (#EF4444, side-by-side, NOT stacked)
 * - Achievement %: Blue line (#2563EB) on secondary right Y-axis
 * - Dual-format tooltips (compact + exact numbers) with informational Gap
 */

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { PeriodTargetActualPoint } from "../../../data/calculations/periodEngine";
import {
  formatCompactQuantity,
  formatExactQuantity,
  tooltipStyle,
  axisLabelStyle,
  yAxisStyle,
  xAxisCategoryStyle,
  gridStyle,
} from "./chartTheme";

interface Props {
  title: string;
  data: PeriodTargetActualPoint[];
  loading?: boolean;
  height?: number;
}

export function TargetActualChart({ title, data, loading = false, height = 280 }: Props) {
  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const option = useMemo(() => {
    if (!safeData.length) {
      return {
        grid: { top: 40, bottom: 30, left: 0, right: 0, containLabel: true },
        xAxis: { type: "category", data: [], show: false },
        yAxis: [{ ...yAxisStyle, splitLine: { show: false }, axisLabel: { show: false } }],
        series: [],
      };
    }

    const categories = safeData.map((d) => d?.label ?? "");
    const targetValues = safeData.map((d) => (typeof d?.target === "number" && Number.isFinite(d.target) ? d.target : 0));
    const actualValues = safeData.map((d) => (typeof d?.actual === "number" && Number.isFinite(d.actual) ? d.actual : 0));
    const gapValues = safeData.map((_, i) => Math.max(targetValues[i] - actualValues[i], 0));
    const lineValues = safeData.map((_, i) => {
      const t = targetValues[i];
      const a = actualValues[i];
      return t > 0 ? Number(((a / t) * 100).toFixed(1)) : 0;
    });

    const isDense = categories.length > 14;

    return {
      grid: gridStyle({ top: 38, bottom: 44, right: 48, left: 55 }),
      tooltip: {
        ...tooltipStyle,
        trigger: "axis",
        confine: true,
        axisPointer: {
          type: "shadow",
          shadowStyle: { color: "rgba(148, 163, 184, 0.12)" },
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const idx = params[0].dataIndex;
          const datum = data[idx];
          if (!datum) return "";

          const target = targetValues[idx];
          const actual = actualValues[idx];
          const gap = gapValues[idx];
          const ach = lineValues[idx];

          const targetCompact = formatCompactQuantity(target);
          const targetExact = formatExactQuantity(target);
          const actualCompact = formatCompactQuantity(actual);
          const actualExact = formatExactQuantity(actual);
          const gapCompact = formatCompactQuantity(gap);
          const gapExact = formatExactQuantity(gap);

          return `
            <div style="font-family: Inter, sans-serif; min-width: 200px; padding: 4px 2px;">
              <div style="font-weight: 700; margin-bottom: 6px; color: #0F172A; font-size: 13px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px;">
                ${datum.label}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 12px;">
                <span style="display: flex; align-items: center; gap: 6px; color: #64748B;">
                  <span style="width: 10px; height: 10px; background-color: #A3A3A3; border-radius: 2px; display: inline-block;"></span>
                  Target:
                </span>
                <span style="font-weight: 600; color: #1E293B; font-variant-numeric: tabular-nums;">
                  ${targetCompact} <span style="font-size: 11px; color: #64748B; font-weight: normal;">(${targetExact} NOS)</span>
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 12px;">
                <span style="display: flex; align-items: center; gap: 6px; color: #64748B;">
                  <span style="width: 10px; height: 10px; background-color: #EF4444; border-radius: 2px; display: inline-block;"></span>
                  Actual:
                </span>
                <span style="font-weight: 600; color: #DC2626; font-variant-numeric: tabular-nums;">
                  ${actualCompact} <span style="font-size: 11px; color: #64748B; font-weight: normal;">(${actualExact} NOS)</span>
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #E2E8F0; font-size: 12px;">
                <span style="display: flex; align-items: center; gap: 6px; color: #2563EB; font-weight: 600;">
                  <span style="width: 10px; height: 3px; background-color: #2563EB; display: inline-block;"></span>
                  Achievement %:
                </span>
                <span style="font-weight: 700; color: #2563EB; font-size: 13px; font-variant-numeric: tabular-nums;">
                  ${ach.toFixed(1)}%
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 3px; font-size: 11px; color: #64748B;">
                <span>Gap:</span>
                <span style="font-weight: 600; color: #475569;">${gapCompact} (${gapExact} NOS)</span>
              </div>
            </div>
          `;
        },
      },
      legend: {
        data: ["Target", "Actual", "Achievement %"],
        top: 0,
        textStyle: { color: "#475569", fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
      },
      xAxis: {
        ...xAxisCategoryStyle,
        data: categories,
        axisLabel: {
          ...axisLabelStyle,
          color: "#475569",
          rotate: categories.length > 8 ? 32 : 0,
          fontSize: 11,
        },
      },
      yAxis: [
        {
          ...yAxisStyle,
          type: "value",
          name: "NOS",
          nameTextStyle: { color: "#64748B", fontSize: 10 },
          min: 0,
          axisLabel: {
            ...axisLabelStyle,
            formatter: (v: number) => formatCompactQuantity(v),
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
        // Group 1: Target (Gray)
        {
          name: "Target",
          type: "bar",
          yAxisIndex: 0,
          data: targetValues,
          barMaxWidth: 26,
          itemStyle: {
            color: "#A3A3A3",
            borderRadius: [3, 3, 0, 0],
          },
          barGap: "15%",
          label: {
            show: !isDense,
            position: "top",
            formatter: (p: any) => {
              const v = Number(p.value || 0);
              return v > 0 ? formatCompactQuantity(v) : "";
            },
            color: "#475569",
            fontSize: 9,
            fontWeight: 600,
          },
        },
        // Group 2: Actual (Red, side-by-side, NOT stacked)
        {
          name: "Actual",
          type: "bar",
          yAxisIndex: 0,
          data: actualValues,
          barMaxWidth: 26,
          itemStyle: {
            color: "#EF4444",
            borderRadius: [3, 3, 0, 0],
          },
          label: {
            show: !isDense,
            position: "top",
            formatter: (p: any) => {
              const v = Number(p.value || 0);
              return v > 0 ? formatCompactQuantity(v) : "";
            },
            color: "#DC2626",
            fontSize: 9,
            fontWeight: 600,
          },
        },
        // Overlay Line: Achievement % (Blue)
        {
          name: "Achievement %",
          type: "line",
          yAxisIndex: 1,
          data: lineValues,
          lineStyle: { color: "#2563EB", width: 2 },
          itemStyle: { color: "#2563EB", borderColor: "#FFFFFF", borderWidth: 1.5 },
          symbol: "circle",
          symbolSize: isDense ? 4 : 6,
          label: {
            show: categories.length <= 6,
            position: "top",
            formatter: (p: any) => `${p.value}%`,
            color: "#1D4ED8",
            fontSize: 9,
            fontWeight: 700,
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            padding: [1, 3],
            borderRadius: 3,
            borderColor: "#BFDBFE",
            borderWidth: 1,
          },
          z: 10,
        },
      ],
    };
  }, [data]);

  if (loading) {
    return (
      <div style={{ height: 310, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
        <div style={{ width: 32, height: 32, border: "3px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 12, color: "#94A3B8" }}>Loading chart…</span>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div
        style={{
          height: 260,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#94A3B8",
          fontSize: 13,
          textAlign: "center",
          padding: "0 1rem",
          gap: 6,
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
        </svg>
        <span style={{ fontWeight: 600, color: "#64748B" }}>No data available</span>
        <span style={{ fontSize: 12 }}>
          No production records match the current filters.{" "}
          Try expanding the date range or clearing a filter.
        </span>
      </div>
    );
  }

  const actualSum = data.reduce((a, b) => a + (b.actual || 0), 0);
  const targetSum = data.reduce((a, b) => a + (b.target || 0), 0);

  return (
    <div
      style={{ height }}
      aria-label={`${title} chart`}
      role="img"
      data-actual-sum={actualSum}
      data-target-sum={targetSum}
      data-points={data.length}
    >
      <ReactECharts option={option} style={{ height: "100%", width: "100%" }} notMerge opts={{ renderer: "canvas", devicePixelRatio: window.devicePixelRatio ?? 1 }} />
    </div>
  );
}
