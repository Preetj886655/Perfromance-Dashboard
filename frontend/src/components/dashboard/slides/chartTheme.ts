/**
 * Shared chart theme + formatting helpers.
 *
 * Operations Command Center semantic colour mapping:
 * - Production: Cyan (#22D3EE)
 * - Target: Amber (#F59E0B)
 * - Achievement / Good: Green (#22C55E)
 * - Downtime: Red (#EF4444)
 * - Production Loss: Amber / Orange (#F59E0B / #F97316)
 * - Rejection: Red (#EF4444)
 * - Typography: Inter (primary), Orbitron (restricted HUD only)
 */

export const CHART_COLORS = {
  // Production (cyan — enterprise readable)
  prod: "#2563EB",
  prodLight: "#3B82F6",
  prodLighter: "rgba(37, 99, 235, 0.14)",
  // Target / plan (amber)
  target: "#EA580C",
  targetLight: "#F97316",
  targetLighter: "rgba(234, 88, 12, 0.16)",
  // Achievement / positive (green)
  good: "#16A34A",
  goodLight: "#22C55E",
  // Production loss (amber/orange)
  loss: "#DC2626",
  lossDark: "#B91C1C",
  // Downtime (red)
  downtime: "#D97706",
  downtimeAlt: "#F59E0B",
  // Rejection / quality
  reject: "#DC2626",
  rejectAlt: "#F87171",
  // Dimensions
  stage: "#4F46E5",
  workcenter: "#6366F1",
  machine: "#0891B2",
  material: "#7C3AED",
  line: "#2563EB",
  shift: "#D97706",
  // Neutrals — higher contrast than previous #8FB4DE
  text: "#475569",
  textDim: "#64748B",
  border: "#E2E8F0",
  gridLine: "#E9EEF5",
  bgTooltip: "#FFFFFF",
} as const;

import {
  formatCompactQuantity,
  formatExactQuantity,
  formatCompactWithExact,
  formatPercentage,
  formatMinutes as formatMinutesUtil,
  formatMinutesDual,
} from "../../../utils/format";

export {
  formatCompactQuantity,
  formatExactQuantity,
  formatCompactWithExact,
  formatPercentage,
  formatMinutesDual,
};

/** Format numbers as compact visual approximation (K/M) for axes and headers. */
export function abbreviateNumber(value: number | null | undefined): string {
  return formatCompactQuantity(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return formatPercentage(value, digits);
}

export function formatMinutes(value: number | null | undefined): string {
  return formatMinutesUtil(value);
}

export function truncateLabel(label: string, max = 16): string {
  if (!label) return "—";
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Shared axis typography. Inter at 11px gives crisp readable labels.
 * No letter-spacing on axis labels — keep them compact.
 */
export const axisLabelStyle = {
  fontSize: 11,
  color: CHART_COLORS.text as string,
  fontFamily: "'Inter', -apple-system, sans-serif",
  letterSpacing: 0,
};

export const yAxisStyle = {
  type: "value" as const,
  axisLabel: {
    ...axisLabelStyle,
    formatter: (val: number) => abbreviateNumber(val),
  },
  splitLine: { lineStyle: { color: CHART_COLORS.gridLine as string, type: "dashed" as const } },
  axisTick: { show: false },
  axisLine: { lineStyle: { color: CHART_COLORS.border as string } },
};

export const xAxisCategoryStyle = {
  type: "category" as const,
  axisLabel: axisLabelStyle,
  axisTick: { show: false },
  axisLine: { lineStyle: { color: CHART_COLORS.border as string } },
};

/**
 * Dark, high-contrast tooltip. Inter font, 13px, clean shadow.
 * No cyan glow border — clean enterprise look.
 */
export const tooltipStyle = {
  backgroundColor: CHART_COLORS.bgTooltip as string,
  borderColor: CHART_COLORS.border as string,
  borderWidth: 1,
  textStyle: {
    color: CHART_COLORS.text as string,
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontSize: 13,
  },
  extraCssText: "box-shadow: 0 4px 16px rgba(15,23,42,0.12); border-radius: 6px;",
};

export function gridStyle(options: Partial<{ left: number; right: number; top: number; bottom: number }> = {}) {
  return {
    left: options.left ?? 90,
    right: options.right ?? 20,
    top: options.top ?? 28,
    bottom: options.bottom ?? 40,
    containLabel: true,
  };
}

export function tooltipFormatter(value: number, unit: string = "", divisor: number = 1): string {
  const v = value / divisor;
  if (unit.includes("%")) {
    return `${v.toFixed(2)}%`;
  }
  const { compact, exact } = formatCompactWithExact(v);
  const unitStr = unit ? ` ${unit}` : "";
  if (Math.abs(v) < 1_000) {
    return `${exact}${unitStr}`;
  }
  return `${compact}${unitStr} (${exact}${unitStr})`;
}
