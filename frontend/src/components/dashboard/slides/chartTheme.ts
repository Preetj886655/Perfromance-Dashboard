/**
 * Shared chart theme + formatting helpers.
 *
 * Semantic colour mapping so the same metric feels visually consistent across
 * every carousel slide. No new dependencies — uses the CSS custom properties
 * already declared in tokens.css.
 */

export const CHART_COLORS = {
  // Production (primary brand)
  prod: "#4f46e5",
  prodLight: "#6366f1",
  prodLighter: "#a5b4fc",
  // Target / plan
  target: "#0ea5e9",
  targetLight: "#38bdf8",
  // Achievement / positive
  good: "#10b981",
  goodLight: "#6ee7b7",
  // Production loss
  loss: "#f59e0b",
  lossDark: "#d97706",
  // Downtime
  downtime: "#dc2626",
  downtimeAlt: "#f97316",
  // Rejection / quality
  reject: "#ef4444",
  rejectAlt: "#f59e0b",
  // Dimensions
  stage: "#0ea5e9",
  workcenter: "#8b5cf6",
  machine: "#6366f1",
  material: "#ec4899",
  line: "#10b981",
  shift: "#f97316",
  // Neutrals
  text: "#6b7280",
  textDim: "#9ca3af",
  border: "#e5e8ed",
} as const;

/** Abbreviate large numbers for chart labels (tooltip keeps full precision). */
export function abbreviateNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toString();
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(digits)}%`;
}

export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${abbreviateNumber(value)} min`;
}

export function truncateLabel(label: string, max = 16): string {
  if (!label) return "—";
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/** Shared axis typography + split-line styling for all ECharts bar/line charts. */
export const axisLabelStyle = { fontSize: 10, color: CHART_COLORS.text as string };

export const yAxisStyle = {
  type: "value" as const,
  axisLabel: axisLabelStyle,
  splitLine: { lineStyle: { color: "rgba(31,36,48,0.06)" } },
  axisTick: { show: false },
  axisLine: { show: false },
};

export const xAxisCategoryStyle = {
  type: "category" as const,
  axisLabel: axisLabelStyle,
  axisTick: { show: false },
  axisLine: { show: false },
};

export function gridStyle(options: Partial<{ left: number; right: number; top: number; bottom: number }> = {}) {
  return { left: options.left ?? 60, right: options.right ?? 16, top: options.top ?? 20, bottom: options.bottom ?? 40 };
}

export function tooltipFormatter(value: number, unit: string = "", divisor: number = 1): string {
  const v = value / divisor;
  let label: string;
  if (unit.includes("%")) {
    label = `${v.toFixed(2)}%`;
  } else if (Math.abs(v) >= 1_000_000) {
    label = `${(v / 1_000_000).toFixed(2)}M${unit ? ` ${unit}` : ""}`;
  } else if (Math.abs(v) >= 1_000) {
    label = `${(v / 1_000).toFixed(1)}K${unit ? ` ${unit}` : ""}`;
  } else {
    label = `${Math.round(v)}${unit ? ` ${unit}` : ""}`;
  }
  return label;
}
