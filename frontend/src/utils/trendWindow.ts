/**
 * Presentation-only trend window from period_start + period_type.
 * Not a business calendar rule — UI convenience so /oee/trend gets from/to.
 */

import type { PeriodType } from "../types/dashboard";

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Inclusive [from, to] ending at period_start:
 * - day: 14 calendar days
 * - week: 12 ISO weeks (84 days back)
 * - month: 12 months (1st of each month window)
 */
export function trendWindowFor(
  periodType: PeriodType,
  periodStart: string,
): { period_start_from: string; period_start_to: string } {
  const end = parseIsoDate(periodStart);
  const start = new Date(end.getTime());

  if (periodType === "day") {
    start.setUTCDate(start.getUTCDate() - 13);
  } else if (periodType === "week") {
    start.setUTCDate(start.getUTCDate() - 7 * 11);
  } else {
    start.setUTCMonth(start.getUTCMonth() - 11);
  }

  return {
    period_start_from: toIsoDate(start),
    period_start_to: toIsoDate(end),
  };
}
