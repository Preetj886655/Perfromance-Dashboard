/**
 * Presentation-only formatters for manufacturing analytics.
 * Does NOT calculate OEE, A, P, or Q.
 * Provides centralized dual number formatters (compact approximation + exact underlying quantity).
 */

export interface DualFormattedNumber {
  compact: string;
  exact: string;
}

export interface DualFormattedMinutes {
  compact: string;
  exact: string;
  formatted: string;
}

/**
 * Format exact integer with thousands separators (commas).
 * Preserves full numerical accuracy without abbreviation.
 */
export function formatExactQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || Number.isNaN(value)) {
    return "0";
  }
  return Math.round(value).toLocaleString("en-US");
}

/**
 * Compact format rules:
 * - value >= 1,000,000: Millions (M) with ~2 decimal places (e.g. 1.97M, 1.00M, 10.50M)
 * - value >= 1,000: Thousands (K) with ~1 decimal place (e.g. 256.1K, 16.4K, 1.0K, 1000.0K)
 * - value < 1,000: exact number directly (e.g. 100, 0)
 */
export function formatCompactQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || Number.isNaN(value)) {
    return "0";
  }
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1)}K`;
  }
  return `${sign}${Math.round(abs).toLocaleString("en-US")}`;
}

/**
 * Centralized formatter returning both compact approximation and exact underlying value.
 *
 * Example:
 * formatCompactWithExact(1965295) => { compact: "1.97M", exact: "1,965,295" }
 * formatCompactWithExact(256107)  => { compact: "256.1K", exact: "256,107" }
 */
export function formatCompactWithExact(value: number | null | undefined): DualFormattedNumber {
  return {
    compact: formatCompactQuantity(value),
    exact: formatExactQuantity(value),
  };
}

/**
 * Percentage formatter. Never uses K/M formatting.
 * Examples:
 * formatPercentage(43.99) => "43.99%"
 * formatPercentage(0.83)  => "0.83%"
 */
export function formatPercentage(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value) || Number.isNaN(value)) {
    return "N/A";
  }
  return `${value.toFixed(digits)}%`;
}

/**
 * Format minutes with compact and exact values.
 * Example: 256107 => "256.1K min (256,107 min)"
 */
export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || Number.isNaN(value)) {
    return "0 min";
  }
  const { compact, exact } = formatCompactWithExact(value);
  if (Math.abs(value) < 1_000) {
    return `${exact} min`;
  }
  return `${compact} min (${exact} min)`;
}

/**
 * Structured minutes dual formatter.
 * Example: 256107 => { compact: "256.1K min", exact: "256,107 min", formatted: "256.1K min (256,107 min)" }
 */
export function formatMinutesDual(value: number | null | undefined): DualFormattedMinutes {
  if (value === null || value === undefined || !Number.isFinite(value) || Number.isNaN(value)) {
    return { compact: "0 min", exact: "0 min", formatted: "0 min" };
  }
  const { compact, exact } = formatCompactWithExact(value);
  const formatted = Math.abs(value) < 1_000 ? `${exact} min` : `${compact} min (${exact} min)`;
  return {
    compact: `${compact} min`,
    exact: `${exact} min`,
    formatted,
  };
}

/** Format API ratio (0–1+) as percent string; null/undefined → "N/A". Never coerce null to 0%. */
export function formatRatioAsPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

/** Machine utilisation: null → "N/A" (API always null at snapshot grain). */
export function formatMachineUtilisation(value: number | null | undefined): string {
  return formatRatioAsPercent(value);
}

/** Standard general number formatter */
export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatDateLabel(isoDate: string): string {
  if (!isoDate) return "—";
  return isoDate;
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** UUID v4-ish check for filter validation (client-side only). */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}
