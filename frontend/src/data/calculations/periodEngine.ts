/**
 * Period Engine — Shared Time-Based Analytics Utility
 *
 * Implements standard calendar and ISO week math for:
 * - Current Week (Monday → Sunday)
 * - Previous Week
 * - Current Month
 * - Previous Month
 * - Current Quarter (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec)
 * - Previous Quarter
 * - Current Year
 * - Previous Year
 * - Custom Date Range
 *
 * All "current" periods are calculated from the real system date (new Date()).
 * They are NEVER anchored to the maximum date in the dataset.
 */

import type { DprRecord } from "../normalization/normalizeDprData";
import { calculateProductionKpis } from "./productionKpis";
import { calculateOeeSummary } from "./oeeCalculator";

export type PeriodPreset =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "all-time"
  | "current-week"
  | "previous-week"
  | "current-month"
  | "previous-month"
  | "current-quarter"
  | "previous-quarter"
  | "current-year"
  | "previous-year"
  | "custom";

export type DateRange = {
  start: string; // ISO YYYY-MM-DD
  end: string;   // ISO YYYY-MM-DD
};

export type PeriodWindow = {
  preset: PeriodPreset;
  label: string;
  current: DateRange;
  previous: DateRange;
  trendGranularity: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
};

export type Polarity = "higher-is-better" | "lower-is-better" | "neutral";
export type VarianceStatus = "good" | "warning" | "critical" | "neutral";

export type MetricDelta = {
  current: number;
  previous: number;
  deltaAbs: number;
  deltaPct: number | null; // null if previous === 0
  isPercentagePoint: boolean;
  formattedCurrent: string;
  formattedPrevious: string;
  formattedDelta: string;
  trend: "up" | "down" | "flat";
  polarity: Polarity;
  varianceStatus: VarianceStatus;
};

export type TrendDataPoint = {
  bucketKey: string; // ISO date, "YYYY-Www", or "YYYY-MM"
  label: string;     // Friendly display label
  production: number;
  target: number;
  achievement: number | null;
  downtime: number;
  rejection: number;
  productionLoss: number;
};

export type PeriodComparison = {
  hasCurrentData: boolean;
  hasPreviousData: boolean;
  currentRecordsCount: number;
  previousRecordsCount: number;
  production: MetricDelta;
  target: MetricDelta;
  achievement: MetricDelta;
  productionLoss: MetricDelta;
  downtime: MetricDelta;
  rejection: MetricDelta;
  rejectionRate: MetricDelta;
  machineUtilization: MetricDelta;
  oee: MetricDelta | null; // null if uncalculable or invalid
};

/**
 * Format a Date object as ISO YYYY-MM-DD using local calendar year, month, date.
 * Avoids UTC timezone conversion shifts.
 */
export function toIsoDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse an ISO YYYY-MM-DD string into a Date object at 00:00:00 local time.
 */
export function parseIsoDateString(str: string): Date {
  const [year, month, day] = str.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

/**
 * Check if a given year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Get ISO week day: Monday = 1, Tuesday = 2, ..., Sunday = 7.
 */
export function getIsoDayOfWeek(date: Date): number {
  const day = date.getDay(); // Sunday is 0, Monday is 1, ...
  return day === 0 ? 7 : day;
}

/**
 * Add or subtract days from a date (returns new Date).
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Calculate ISO 8601 week number and year.
 */
export function getIsoWeekInfo(date: Date): { year: number; week: number; label: string } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const isoYear = d.getUTCFullYear();
  return {
    year: isoYear,
    week: weekNo,
    label: `${isoYear}-W${String(weekNo).padStart(2, "0")}`,
  };
}

/**
 * Resolves start/end dates for a period preset and its corresponding previous comparison period.
 *
 * @param preset The period preset to resolve
 * @param customRange Start and end dates if preset is 'custom'
 * @param referenceDate Clock date to calculate from (defaults to real current time: new Date())
 */
export function resolvePeriodWindow(
  preset: PeriodPreset,
  customRange?: { start?: string; end?: string },
  referenceDate: Date = new Date()
): PeriodWindow {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const year = ref.getFullYear();
  const month = ref.getMonth(); // 0-indexed: 0 = Jan, 8 = Sep

  switch (preset) {
    case "weekly": {
      if (customRange?.start && customRange?.end && customRange.start <= customRange.end) {
        const startDate = parseIsoDateString(customRange.start);
        const endDate = parseIsoDateString(customRange.end);
        const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
        const previousEndDate = addDays(startDate, -1);
        const previousStartDate = addDays(previousEndDate, -(days - 1));
        return {
          preset,
          label: "Weekly",
          current: { start: customRange.start, end: customRange.end },
          previous: { start: toIsoDateString(previousStartDate), end: toIsoDateString(previousEndDate) },
          trendGranularity: "weekly",
        };
      }
      const isoDay = getIsoDayOfWeek(ref);
      const monday = addDays(ref, -(isoDay - 1));
      const sunday = addDays(monday, 6);
      const prevMonday = addDays(monday, -7);
      const prevSunday = addDays(monday, -1);
      return {
        preset,
        label: "Weekly",
        current: { start: toIsoDateString(monday), end: toIsoDateString(sunday) },
        previous: { start: toIsoDateString(prevMonday), end: toIsoDateString(prevSunday) },
        trendGranularity: "weekly",
      };
    }

    case "monthly": {
      if (customRange?.start && customRange?.end && customRange.start <= customRange.end) {
        const startDate = parseIsoDateString(customRange.start);
        const endDate = parseIsoDateString(customRange.end);
        const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
        const previousEndDate = addDays(startDate, -1);
        const previousStartDate = addDays(previousEndDate, -(days - 1));
        return {
          preset,
          label: "Monthly",
          current: { start: customRange.start, end: customRange.end },
          previous: { start: toIsoDateString(previousStartDate), end: toIsoDateString(previousEndDate) },
          trendGranularity: "monthly",
        };
      }
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0);
      const startOfPrevMonth = new Date(year, month - 1, 1);
      const endOfPrevMonth = new Date(year, month, 0);
      return {
        preset,
        label: "Monthly",
        current: { start: toIsoDateString(startOfMonth), end: toIsoDateString(endOfMonth) },
        previous: { start: toIsoDateString(startOfPrevMonth), end: toIsoDateString(endOfPrevMonth) },
        trendGranularity: "monthly",
      };
    }

    case "quarterly": {
      if (customRange?.start && customRange?.end && customRange.start <= customRange.end) {
        const startDate = parseIsoDateString(customRange.start);
        const endDate = parseIsoDateString(customRange.end);
        const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
        const previousEndDate = addDays(startDate, -1);
        const previousStartDate = addDays(previousEndDate, -(days - 1));
        return {
          preset,
          label: "Quarterly",
          current: { start: customRange.start, end: customRange.end },
          previous: { start: toIsoDateString(previousStartDate), end: toIsoDateString(previousEndDate) },
          trendGranularity: "quarterly",
        };
      }
      const qIndex = Math.floor(month / 3);
      const qStartMonth = qIndex * 3;
      const startOfQ = new Date(year, qStartMonth, 1);
      const endOfQ = new Date(year, qStartMonth + 3, 0);
      const startOfPrevQ = new Date(year, qStartMonth - 3, 1);
      const endOfPrevQ = new Date(year, qStartMonth, 0);
      return {
        preset,
        label: `Quarterly (Q${qIndex + 1})`,
        current: { start: toIsoDateString(startOfQ), end: toIsoDateString(endOfQ) },
        previous: { start: toIsoDateString(startOfPrevQ), end: toIsoDateString(endOfPrevQ) },
        trendGranularity: "quarterly",
      };
    }

    case "yearly": {
      if (customRange?.start && customRange?.end && customRange.start <= customRange.end) {
        const startDate = parseIsoDateString(customRange.start);
        const endDate = parseIsoDateString(customRange.end);
        const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
        const previousEndDate = addDays(startDate, -1);
        const previousStartDate = addDays(previousEndDate, -(days - 1));
        return {
          preset,
          label: "Yearly",
          current: { start: customRange.start, end: customRange.end },
          previous: { start: toIsoDateString(previousStartDate), end: toIsoDateString(previousEndDate) },
          trendGranularity: "yearly",
        };
      }
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31);
      const startOfPrevYear = new Date(year - 1, 0, 1);
      const endOfPrevYear = new Date(year - 1, 11, 31);
      return {
        preset,
        label: `Yearly (${year})`,
        current: { start: toIsoDateString(startOfYear), end: toIsoDateString(endOfYear) },
        previous: { start: toIsoDateString(startOfPrevYear), end: toIsoDateString(endOfPrevYear) },
        trendGranularity: "yearly",
      };
    }

    case "current-week": {
      // ISO week: Monday to Sunday
      const isoDay = getIsoDayOfWeek(ref);
      const monday = addDays(ref, -(isoDay - 1));
      const sunday = addDays(monday, 6);

      const prevMonday = addDays(monday, -7);
      const prevSunday = addDays(monday, -1);

      return {
        preset,
        label: "Current Week",
        current: { start: toIsoDateString(monday), end: toIsoDateString(sunday) },
        previous: { start: toIsoDateString(prevMonday), end: toIsoDateString(prevSunday) },
        trendGranularity: "daily",
      };
    }

    case "previous-week": {
      const isoDay = getIsoDayOfWeek(ref);
      const currentMonday = addDays(ref, -(isoDay - 1));
      const prevMonday = addDays(currentMonday, -7);
      const prevSunday = addDays(currentMonday, -1);

      const twoWeeksAgoMonday = addDays(prevMonday, -7);
      const twoWeeksAgoSunday = addDays(prevMonday, -1);

      return {
        preset,
        label: "Previous Week",
        current: { start: toIsoDateString(prevMonday), end: toIsoDateString(prevSunday) },
        previous: { start: toIsoDateString(twoWeeksAgoMonday), end: toIsoDateString(twoWeeksAgoSunday) },
        trendGranularity: "daily",
      };
    }

    case "current-month": {
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0);

      const startOfPrevMonth = new Date(year, month - 1, 1);
      const endOfPrevMonth = new Date(year, month, 0);

      return {
        preset,
        label: "Current Month",
        current: { start: toIsoDateString(startOfMonth), end: toIsoDateString(endOfMonth) },
        previous: { start: toIsoDateString(startOfPrevMonth), end: toIsoDateString(endOfPrevMonth) },
        trendGranularity: "weekly",
      };
    }

    case "previous-month": {
      const startOfPrevMonth = new Date(year, month - 1, 1);
      const endOfPrevMonth = new Date(year, month, 0);

      const startOfTwoMonthsAgo = new Date(year, month - 2, 1);
      const endOfTwoMonthsAgo = new Date(year, month - 1, 0);

      return {
        preset,
        label: "Previous Month",
        current: { start: toIsoDateString(startOfPrevMonth), end: toIsoDateString(endOfPrevMonth) },
        previous: { start: toIsoDateString(startOfTwoMonthsAgo), end: toIsoDateString(endOfTwoMonthsAgo) },
        trendGranularity: "weekly",
      };
    }

    case "current-quarter": {
      // Quarters: Q1 (Jan-Mar: 0,1,2), Q2 (Apr-Jun: 3,4,5), Q3 (Jul-Sep: 6,7,8), Q4 (Oct-Dec: 9,10,11)
      const qIndex = Math.floor(month / 3);
      const qStartMonth = qIndex * 3;
      const startOfQ = new Date(year, qStartMonth, 1);
      const endOfQ = new Date(year, qStartMonth + 3, 0);

      const startOfPrevQ = new Date(year, qStartMonth - 3, 1);
      const endOfPrevQ = new Date(year, qStartMonth, 0);

      return {
        preset,
        label: `Current Quarter (Q${qIndex + 1})`,
        current: { start: toIsoDateString(startOfQ), end: toIsoDateString(endOfQ) },
        previous: { start: toIsoDateString(startOfPrevQ), end: toIsoDateString(endOfPrevQ) },
        trendGranularity: "monthly",
      };
    }

    case "previous-quarter": {
      const qIndex = Math.floor(month / 3);
      const prevQIndex = qIndex === 0 ? 3 : qIndex - 1;
      const prevQYear = qIndex === 0 ? year - 1 : year;
      const prevQStartMonth = prevQIndex * 3;

      const startOfPrevQ = new Date(prevQYear, prevQStartMonth, 1);
      const endOfPrevQ = new Date(prevQYear, prevQStartMonth + 3, 0);

      const startOfPriorQ = new Date(prevQYear, prevQStartMonth - 3, 1);
      const endOfPriorQ = new Date(prevQYear, prevQStartMonth, 0);

      return {
        preset,
        label: `Previous Quarter (Q${prevQIndex + 1})`,
        current: { start: toIsoDateString(startOfPrevQ), end: toIsoDateString(endOfPrevQ) },
        previous: { start: toIsoDateString(startOfPriorQ), end: toIsoDateString(endOfPriorQ) },
        trendGranularity: "monthly",
      };
    }

    case "current-year": {
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31);

      const startOfPrevYear = new Date(year - 1, 0, 1);
      const endOfPrevYear = new Date(year - 1, 11, 31);

      return {
        preset,
        label: `Current Year (${year})`,
        current: { start: toIsoDateString(startOfYear), end: toIsoDateString(endOfYear) },
        previous: { start: toIsoDateString(startOfPrevYear), end: toIsoDateString(endOfPrevYear) },
        trendGranularity: "monthly",
      };
    }

    case "previous-year": {
      const prevYear = year - 1;
      const startOfPrevYear = new Date(prevYear, 0, 1);
      const endOfPrevYear = new Date(prevYear, 11, 31);

      const startOfPriorYear = new Date(prevYear - 1, 0, 1);
      const endOfPriorYear = new Date(prevYear - 1, 11, 31);

      return {
        preset,
        label: `Previous Year (${prevYear})`,
        current: { start: toIsoDateString(startOfPrevYear), end: toIsoDateString(endOfPrevYear) },
        previous: { start: toIsoDateString(startOfPriorYear), end: toIsoDateString(endOfPriorYear) },
        trendGranularity: "monthly",
      };
    }

    case "all-time":
      return {
        preset,
        label: "All Time",
        current: { start: "", end: "" },
        previous: { start: "", end: "" },
        trendGranularity: "monthly",
      };

    case "custom":
    default: {
      const start = customRange?.start ?? "";
      const end = customRange?.end ?? "";

      let prevStart = "";
      let prevEnd = "";

      if (start && end && start <= end) {
        const startDate = parseIsoDateString(start);
        const endDate = parseIsoDateString(end);
        const diffMs = endDate.getTime() - startDate.getTime();
        const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;

        const previousEndDate = addDays(startDate, -1);
        const previousStartDate = addDays(previousEndDate, -(days - 1));

        prevStart = toIsoDateString(previousStartDate);
        prevEnd = toIsoDateString(previousEndDate);
      }

      const diffDays =
        start && end
          ? Math.round(
              (parseIsoDateString(end).getTime() -
                parseIsoDateString(start).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 30;

      return {
        preset: "custom",
        label: "Custom Date Range",
        current: { start, end },
        previous: { start: prevStart, end: prevEnd },
        trendGranularity:
          diffDays <= 14
            ? "daily"
            : diffDays <= 90
              ? "weekly"
              : "monthly",
      };
    }
  }
}

/**
 * Calculates delta and percentage change between current and previous values.
 *
 * For percentage-based metrics (e.g. Achievement %, Rejection %, Utilization %, OEE %):
 * `isPercentagePoint` is TRUE, delta is formatted as `+X.X p.p.` (percentage points).
 *
 * For volume/count metrics (e.g. Production, Loss, Downtime):
 * `isPercentagePoint` is FALSE, delta is formatted as percentage growth `+X.X%`.
 */
export function calculateMetricDelta(
  current: number,
  previous: number,
  isPercentagePoint: boolean = false,
  unitLabel: string = "",
  polarity: Polarity = "higher-is-better"
): MetricDelta {
  const deltaAbs = current - previous;
  const deltaPct = previous !== 0 ? (deltaAbs / Math.abs(previous)) * 100 : null;

  let trend: "up" | "down" | "flat" = "flat";
  if (Math.abs(deltaAbs) > 0.0001) {
    trend = deltaAbs > 0 ? "up" : "down";
  }

  const sign = deltaAbs > 0 ? "+" : deltaAbs < 0 ? "-" : "";
  const absDiff = Math.abs(deltaAbs);

  let formattedDelta = "";
  if (isPercentagePoint) {
    formattedDelta = `${sign}${absDiff.toFixed(1)} p.p.`;
  } else if (deltaPct !== null) {
    const pctSign = deltaPct > 0 ? "+" : deltaPct < 0 ? "-" : "";
    formattedDelta = `${pctSign}${Math.abs(deltaPct).toFixed(1)}%`;
  } else {
    formattedDelta = sign + absDiff.toLocaleString() + (unitLabel ? ` ${unitLabel}` : "");
  }

  let varianceStatus: VarianceStatus = "neutral";
  if (polarity === "higher-is-better") {
    if (isPercentagePoint) {
      if (deltaAbs >= 0) varianceStatus = "good";
      else if (deltaAbs >= -5) varianceStatus = "warning";
      else varianceStatus = "critical";
    } else {
      if (deltaPct === null) varianceStatus = "neutral";
      else if (deltaPct >= 0) varianceStatus = "good";
      else if (deltaPct >= -15) varianceStatus = "warning";
      else varianceStatus = "critical";
    }
  } else if (polarity === "lower-is-better") {
    if (isPercentagePoint) {
      if (deltaAbs <= 0) varianceStatus = "good";
      else if (deltaAbs <= 0.5) varianceStatus = "warning";
      else varianceStatus = "critical";
    } else {
      if (deltaPct === null) varianceStatus = "neutral";
      else if (deltaPct <= 0) varianceStatus = "good";
      else if (deltaPct <= 15) varianceStatus = "warning";
      else varianceStatus = "critical";
    }
  }

  return {
    current,
    previous,
    deltaAbs,
    deltaPct,
    isPercentagePoint,
    formattedCurrent: isPercentagePoint ? `${current.toFixed(1)}%` : current.toLocaleString() + (unitLabel ? ` ${unitLabel}` : ""),
    formattedPrevious: isPercentagePoint ? `${previous.toFixed(1)}%` : previous.toLocaleString() + (unitLabel ? ` ${unitLabel}` : ""),
    formattedDelta,
    trend,
    polarity,
    varianceStatus,
  };
}

/** Row-level production target (target/hr × hours), mirroring productionKpis logic. */
function getRowTarget(row: DprRecord): number {
  if (typeof row.targetProduction === "number" && Number.isFinite(row.targetProduction)) {
    return row.targetProduction;
  }
  if (!(typeof row.targetQtyPerHour === "number" && Number.isFinite(row.targetQtyPerHour))) {
    return 0;
  }
  const hourFactor =
    typeof row.productionHour === "number" && Number.isFinite(row.productionHour)
      ? row.productionHour
      : typeof row.availableTimeMinutes === "number" && Number.isFinite(row.availableTimeMinutes)
        ? row.availableTimeMinutes / 60
        : 1;
  return row.targetQtyPerHour * hourFactor;
}

/**
 * Builds aggregated time series based on chosen granularity (daily, weekly, monthly).
 */
export function buildGranularTrendSeries(
  records: DprRecord[],
  granularity: "daily" | "weekly" | "monthly" | "quarterly" | "yearly"
): TrendDataPoint[] {
  const buckets = new Map<string, { label: string; production: number; target: number; downtime: number; rejection: number; productionLoss: number }>();

  for (const row of records) {
    if (!row.date) continue;
    let key = row.date;
    let label = row.date;

    const parsed = parseIsoDateString(row.date);

    if (granularity === "weekly") {
      const { year, week, label: weekLabel } = getIsoWeekInfo(parsed);
      key = weekLabel;
      label = `W${week} (${year})`;
    } else if (granularity === "monthly") {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const y = parsed.getFullYear();
      const m = parsed.getMonth();
      key = `${y}-${String(m + 1).padStart(2, "0")}`;
      label = `${monthNames[m]} ${y}`;
    } else if (granularity === "quarterly") {
      const y = parsed.getFullYear();
      const m = parsed.getMonth();
      const q = Math.floor(m / 3) + 1;
      key = `${y}-Q${q}`;
      label = `Q${q} ${y}`;
    } else if (granularity === "yearly") {
      const y = parsed.getFullYear();
      key = `${y}`;
      label = `${y}`;
    }

    const existing = buckets.get(key) ?? {
      label,
      production: 0,
      target: 0,
      downtime: 0,
      rejection: 0,
      productionLoss: 0,
    };

    existing.production += row.actualProductionQty ?? 0;
    existing.target += getRowTarget(row);
    existing.downtime += (row.plannedDownTimeMinutes ?? 0) + (row.totalIdleTimeMinutes ?? 0);
    existing.rejection += row.totalRejectionQty ?? 0;
    existing.productionLoss += typeof row.productionLoss === "number" && Number.isFinite(row.productionLoss) ? row.productionLoss : 0;

    buckets.set(key, existing);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucketKey, data]) => ({
      bucketKey,
      label: data.label,
      production: data.production,
      target: data.target,
      achievement: data.target > 0 ? (data.production / data.target) * 100 : null,
      downtime: data.downtime,
      rejection: data.rejection,
      productionLoss: data.productionLoss,
    }));
}

/**
 * Single point in a Target vs Actual period chart.
 */
export type PeriodTargetActualPoint = {
  periodKey: string; // stable sort key
  label: string; // friendly display label
  target: number;
  actual: number;
  achievement: number | null; // null if target === 0
};

/**
 * Row-level target (target/hr × hours), matching productionKpis / useDashboardAnalytics.
 */
function rowTarget(row: DprRecord): number {
  if (typeof row.targetProduction === "number" && Number.isFinite(row.targetProduction)) {
    return row.targetProduction;
  }
  if (!(typeof row.targetQtyPerHour === "number" && Number.isFinite(row.targetQtyPerHour))) {
    return 0;
  }
  const hourFactor =
    typeof row.productionHour === "number" && Number.isFinite(row.productionHour)
      ? row.productionHour
      : typeof row.availableTimeMinutes === "number" && Number.isFinite(row.availableTimeMinutes)
        ? row.availableTimeMinutes / 60
        : 1;
  return row.targetQtyPerHour * hourFactor;
}

/**
 * Row-level actual production.
 */
function rowActual(row: DprRecord): number {
  return typeof row.actualProductionQty === "number" && Number.isFinite(row.actualProductionQty)
    ? row.actualProductionQty
    : 0;
}
export function comparePeriods(
  currentRecords: DprRecord[],
  previousRecords: DprRecord[]
): PeriodComparison {
  const currentKpis = calculateProductionKpis(currentRecords);
  const previousKpis = calculateProductionKpis(previousRecords);

  const currentLoss = currentRecords.reduce(
    (sum, r) => (typeof r.productionLoss === "number" && Number.isFinite(r.productionLoss) ? sum + r.productionLoss : sum),
    0
  );
  const previousLoss = previousRecords.reduce(
    (sum, r) => (typeof r.productionLoss === "number" && Number.isFinite(r.productionLoss) ? sum + r.productionLoss : sum),
    0
  );

  const currentOee = calculateOeeSummary(currentRecords);
  const previousOee = calculateOeeSummary(previousRecords);

  const hasCurrentData = currentRecords.length > 0;
  const hasPreviousData = previousRecords.length > 0;

  const production = calculateMetricDelta(
    currentKpis.totalProduction,
    previousKpis.totalProduction,
    false,
    "units",
    "higher-is-better"
  );

  const target = calculateMetricDelta(
    currentKpis.totalTargetProduction,
    previousKpis.totalTargetProduction,
    false,
    "units",
    "higher-is-better"
  );

  const achievement = calculateMetricDelta(
    currentKpis.productionAchievementPercent ?? 0,
    previousKpis.productionAchievementPercent ?? 0,
    true,
    "p.p.",
    "higher-is-better"
  );

  const productionLoss = calculateMetricDelta(
    currentLoss,
    previousLoss,
    false,
    "NOS",
    "lower-is-better"
  );

  const downtime = calculateMetricDelta(
    currentKpis.totalDowntimeMinutes,
    previousKpis.totalDowntimeMinutes,
    false,
    "min",
    "lower-is-better"
  );

  const rejection = calculateMetricDelta(
    currentKpis.totalRejection,
    previousKpis.totalRejection,
    false,
    "pcs",
    "lower-is-better"
  );

  const rejectionRate = calculateMetricDelta(
    currentKpis.rejectionRatePercent ?? 0,
    previousKpis.rejectionRatePercent ?? 0,
    true,
    "p.p.",
    "lower-is-better"
  );

  const machineUtilization = calculateMetricDelta(
    currentKpis.machineUtilizationPercent ?? 0,
    previousKpis.machineUtilizationPercent ?? 0,
    true,
    "p.p.",
    "higher-is-better"
  );

  let oee: MetricDelta | null = null;
  if (
    currentOee.oeePercent !== null &&
    previousOee.oeePercent !== null &&
    Number.isFinite(currentOee.oeePercent) &&
    Number.isFinite(previousOee.oeePercent)
  ) {
    oee = calculateMetricDelta(
      currentOee.oeePercent,
      previousOee.oeePercent,
      true,
      "p.p.",
      "higher-is-better"
    );
  }

  return {
    hasCurrentData,
    hasPreviousData,
    currentRecordsCount: currentRecords.length,
    previousRecordsCount: previousRecords.length,
    production,
    target,
    achievement,
    productionLoss,
    downtime,
    rejection,
    rejectionRate,
    machineUtilization,
    oee,
  };
}

/**
 * Build monthly Target vs Actual series from a filtered record set.
 * Only months intersecting `dateRange` are included.
 * Target uses production target; Actual uses actual production quantity.
 */
export function buildMonthlyTargetActualSeries(
  records: DprRecord[],
  dateRange: { start: string; end: string }
): PeriodTargetActualPoint[] {
  const acc: Record<string, { key: string; target: number; actual: number }> = {};
  for (const row of records) {
    if (!row.date) continue;
    if (row.date < dateRange.start || row.date > dateRange.end) continue;
    const d = parseIsoDateString(row.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    acc[key] = acc[key] ?? { key, target: 0, actual: 0 };
    acc[key].target += rowTarget(row);
    acc[key].actual += rowActual(row);
  }
  return Object.entries(acc)
    .map(([key, v]) => ({ key, target: v.target, actual: v.actual }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => {
      const [yearStr, monthStr] = entry.key.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const label = formatMonth(year, month);
      return {
        periodKey: entry.key,
        label,
        target: entry.target,
        actual: entry.actual,
        achievement: entry.target > 0 ? (entry.actual / entry.target) * 100 : null,
      };
    });
}

/**
 * Build weekly Target vs Actual series from a filtered record set.
 * Only weeks intersecting `dateRange` are included.
 */
export function buildWeeklyTargetActualSeries(
  records: DprRecord[],
  dateRange: { start: string; end: string }
): PeriodTargetActualPoint[] {
  const acc: Record<string, { key: string; label: string; target: number; actual: number }> = {};
  for (const row of records) {
    if (!row.date) continue;
    if (row.date < dateRange.start || row.date > dateRange.end) continue;
    const info = getIsoWeekInfo(parseIsoDateString(row.date));
    const key = `${info.year}-W${String(info.week).padStart(2, "0")}`;
    acc[key] = acc[key] ?? { key, label: info.label, target: 0, actual: 0 };
    acc[key].target += rowTarget(row);
    acc[key].actual += rowActual(row);
  }
  return Object.entries(acc)
    .map(([key, v]) => ({ key, label: v.label, target: v.target, actual: v.actual }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => ({
      periodKey: entry.key,
      label: entry.label,
      target: entry.target,
      actual: entry.actual,
      achievement: entry.target > 0 ? (entry.actual / entry.target) * 100 : null,
    }));
}

/**
 * Build quarterly Target vs Actual series from a filtered record set.
 * Only quarters intersecting `dateRange` are included.
 */
export function buildQuarterlyTargetActualSeries(
  records: DprRecord[],
  dateRange: { start: string; end: string }
): PeriodTargetActualPoint[] {
  const acc: Record<string, { key: string; year: number; quarter: number; target: number; actual: number }> = {};
  for (const row of records) {
    if (!row.date) continue;
    if (row.date < dateRange.start || row.date > dateRange.end) continue;
    const d = parseIsoDateString(row.date);
    const quarter = Math.floor(d.getMonth() / 3);
    const key = `${d.getFullYear()}-Q${quarter + 1}`;
    acc[key] = acc[key] ?? { key, year: d.getFullYear(), quarter: quarter + 1, target: 0, actual: 0 };
    acc[key].target += rowTarget(row);
    acc[key].actual += rowActual(row);
  }
  return Object.entries(acc)
    .map(([key, v]) => ({ key, year: v.year, quarter: v.quarter, target: v.target, actual: v.actual }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => ({
      periodKey: entry.key,
      label: `Q${entry.quarter} ${entry.year}`,
      target: entry.target,
      actual: entry.actual,
      achievement: entry.target > 0 ? (entry.actual / entry.target) * 100 : null,
    }));
}

/**
 * Build yearly Target vs Actual series from a filtered record set.
 * Only years intersecting `dateRange` are included.
 */
export function buildYearlyTargetActualSeries(
  records: DprRecord[],
  dateRange: { start: string; end: string }
): PeriodTargetActualPoint[] {
  const acc: Record<string, { key: string; year: number; target: number; actual: number }> = {};
  for (const row of records) {
    if (!row.date) continue;
    if (row.date < dateRange.start || row.date > dateRange.end) continue;
    const year = parseIsoDateString(row.date).getFullYear();
    const key = `${year}`;
    acc[key] = acc[key] ?? { key, year, target: 0, actual: 0 };
    acc[key].target += rowTarget(row);
    acc[key].actual += rowActual(row);
  }
  return Object.entries(acc)
    .map(([key, v]) => ({ key, year: v.year, target: v.target, actual: v.actual }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => ({
      periodKey: entry.key,
      label: `${entry.year}`,
      target: entry.target,
      actual: entry.actual,
      achievement: entry.target > 0 ? (entry.actual / entry.target) * 100 : null,
    }));
}

function formatMonth(year: number, month: number): string {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
