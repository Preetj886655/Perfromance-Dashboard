/**
 * Presentation-only formatters. Does NOT calculate OEE, A, P, or Q.
 * API ratios are decimal fractions (e.g. 0.844815); display as percent.
 */

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
