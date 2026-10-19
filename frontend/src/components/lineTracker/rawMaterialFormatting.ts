export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function formatNumber(value: number | null, digits = 3): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value);
}

export function formatPercentFraction(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 2 }).format(value);
}

export function formatAssetNumber(value: number | null, digits = 2): string {
  return formatNumber(value, digits);
}
