/**
 * Unit Tests — Period Target vs Actual Aggregation Functions
 *
 * Phase 8 — Tests all four period series builders in periodEngine.ts:
 *   buildMonthlyTargetActualSeries
 *   buildWeeklyTargetActualSeries
 *   buildQuarterlyTargetActualSeries
 *   buildYearlyTargetActualSeries
 *
 * Covers: basic aggregation, date range filtering (inclusive boundaries),
 * partial periods, empty datasets, zero-target achievement, chronological
 * ordering, records with missing dates, and multiple records per period.
 */

import { describe, it, expect } from "vitest";
import {
  buildMonthlyTargetActualSeries,
  buildWeeklyTargetActualSeries,
  buildQuarterlyTargetActualSeries,
  buildYearlyTargetActualSeries,
  type PeriodTargetActualPoint,
} from "./periodEngine";
import type { DprRecord } from "../normalization/normalizeDprData";

// ---------------------------------------------------------------------------
// Helpers to create minimal DprRecord stubs for tests
// ---------------------------------------------------------------------------

/** Create a minimal DprRecord with production data for testing. */
function makeRecord(
  date: string,
  actualProductionQty: number,
  targetProduction: number
): DprRecord {
  return {
    date,
    actualProductionQty,
    targetProduction,
    // Required fields with neutral/zero values
    lineName: "ERC",
    shift: "A",
    rawStage: "PRESS",
    material: "CLUTCH DRUM",
    machineName: "MC-01",
    machineNo: "01",
    workCenter: "",
    totalDowntimeMinutes: 0,
    plannedDowntimeMinutes: 0,
    unplannedDowntimeMinutes: 0,
    availableTimeMinutes: 480,
    productionHour: 8,
    rejectionQty: 0,
    productionLoss: 0,
    targetQtyPerHour: null,
    remarks: "",
  } as unknown as DprRecord;
}

const FULL_RANGE = { start: "2026-01-01", end: "2026-12-31" };

// ---------------------------------------------------------------------------
// buildMonthlyTargetActualSeries
// ---------------------------------------------------------------------------

describe("buildMonthlyTargetActualSeries", () => {
  it("returns empty array for empty record set", () => {
    const result = buildMonthlyTargetActualSeries([], FULL_RANGE);
    expect(result).toEqual([]);
  });

  it("returns empty array when all records are outside date range", () => {
    const records = [makeRecord("2025-03-15", 100, 120)];
    const result = buildMonthlyTargetActualSeries(records, {
      start: "2026-01-01",
      end: "2026-12-31",
    });
    expect(result).toEqual([]);
  });

  it("aggregates records into correct month buckets", () => {
    const records = [
      makeRecord("2026-01-10", 100, 120),
      makeRecord("2026-01-20", 50, 60),
      makeRecord("2026-02-05", 200, 220),
    ];
    const result = buildMonthlyTargetActualSeries(records, FULL_RANGE);
    expect(result).toHaveLength(2);
    const jan = result.find((r) => r.periodKey === "2026-01")!;
    expect(jan.actual).toBe(150);
    expect(jan.target).toBe(180);
    const feb = result.find((r) => r.periodKey === "2026-02")!;
    expect(feb.actual).toBe(200);
    expect(feb.target).toBe(220);
  });

  it("returns periods in chronological order (ascending periodKey)", () => {
    const records = [
      makeRecord("2026-03-01", 300, 350),
      makeRecord("2026-01-01", 100, 120),
      makeRecord("2026-02-01", 200, 220),
    ];
    const result = buildMonthlyTargetActualSeries(records, FULL_RANGE);
    const keys = result.map((r) => r.periodKey);
    expect(keys).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("computes achievement = actual/target × 100", () => {
    const records = [makeRecord("2026-06-15", 80, 100)];
    const result = buildMonthlyTargetActualSeries(records, FULL_RANGE);
    expect(result[0].achievement).toBeCloseTo(80, 5);
  });

  it("returns achievement = null when target is 0", () => {
    const records = [makeRecord("2026-06-15", 0, 0)];
    const result = buildMonthlyTargetActualSeries(records, FULL_RANGE);
    expect(result[0].achievement).toBeNull();
  });

  it("respects inclusive start boundary — includes record ON start date", () => {
    const records = [makeRecord("2026-01-01", 100, 120)];
    const result = buildMonthlyTargetActualSeries(records, {
      start: "2026-01-01",
      end: "2026-12-31",
    });
    expect(result).toHaveLength(1);
    expect(result[0].periodKey).toBe("2026-01");
  });

  it("respects inclusive end boundary — includes record ON end date", () => {
    const records = [makeRecord("2026-06-30", 100, 120)];
    const result = buildMonthlyTargetActualSeries(records, {
      start: "2026-01-01",
      end: "2026-06-30",
    });
    expect(result).toHaveLength(1);
    expect(result[0].periodKey).toBe("2026-06");
  });

  it("excludes records ONE day outside the date range boundary", () => {
    const records = [
      makeRecord("2025-12-31", 100, 120), // before start
      makeRecord("2026-01-15", 200, 220), // inside
      makeRecord("2027-01-01", 300, 320), // after end
    ];
    const result = buildMonthlyTargetActualSeries(records, {
      start: "2026-01-01",
      end: "2026-12-31",
    });
    expect(result).toHaveLength(1);
    expect(result[0].actual).toBe(200);
  });

  it("skips records with null/undefined date", () => {
    const withNull = { ...makeRecord("", 100, 120), date: undefined as unknown as string };
    const records = [withNull, makeRecord("2026-05-01", 50, 60)];
    const result = buildMonthlyTargetActualSeries(records, FULL_RANGE);
    expect(result).toHaveLength(1);
    expect(result[0].actual).toBe(50);
  });

  it("handles a partial period (only some days in a month are within range)", () => {
    // Range only covers the first week of February
    const records = [
      makeRecord("2026-02-01", 100, 120),
      makeRecord("2026-02-03", 50, 60),
      makeRecord("2026-02-15", 200, 220), // outside narrow range
    ];
    const result = buildMonthlyTargetActualSeries(records, {
      start: "2026-02-01",
      end: "2026-02-07",
    });
    expect(result).toHaveLength(1);
    expect(result[0].actual).toBe(150); // only the first two records
    expect(result[0].target).toBe(180);
  });
});

// ---------------------------------------------------------------------------
// buildWeeklyTargetActualSeries
// ---------------------------------------------------------------------------

describe("buildWeeklyTargetActualSeries", () => {
  it("returns empty array for empty record set", () => {
    expect(buildWeeklyTargetActualSeries([], FULL_RANGE)).toEqual([]);
  });

  it("aggregates records in the same ISO week into one bucket", () => {
    // 2026-01-05 (Mon) and 2026-01-09 (Fri) are both in ISO week 2026-W02
    const records = [
      makeRecord("2026-01-05", 100, 120),
      makeRecord("2026-01-09", 200, 220),
    ];
    const result = buildWeeklyTargetActualSeries(records, FULL_RANGE);
    expect(result).toHaveLength(1);
    expect(result[0].actual).toBe(300);
    expect(result[0].target).toBe(340);
  });

  it("creates separate buckets for different ISO weeks", () => {
    // W01: 2026-01-01 (Thu)  W02: 2026-01-05 (Mon)
    const records = [
      makeRecord("2026-01-01", 100, 120),
      makeRecord("2026-01-05", 200, 220),
    ];
    const result = buildWeeklyTargetActualSeries(records, FULL_RANGE);
    expect(result).toHaveLength(2);
  });

  it("orders weeks chronologically", () => {
    const records = [
      makeRecord("2026-02-09", 300, 350), // W07
      makeRecord("2026-01-05", 100, 120), // W02
      makeRecord("2026-01-12", 200, 220), // W03
    ];
    const result = buildWeeklyTargetActualSeries(records, FULL_RANGE);
    const keys = result.map((r) => r.periodKey);
    expect(keys[0]).toBe(keys.slice().sort()[0]);
    expect([...keys]).toEqual([...keys].sort());
  });

  it("sets achievement = null when target is 0", () => {
    const records = [makeRecord("2026-01-05", 50, 0)];
    const result = buildWeeklyTargetActualSeries(records, FULL_RANGE);
    expect(result[0].achievement).toBeNull();
  });

  it("excludes records outside the date range", () => {
    const records = [
      makeRecord("2025-12-31", 999, 999),
      makeRecord("2026-03-01", 100, 120),
    ];
    const result = buildWeeklyTargetActualSeries(records, {
      start: "2026-03-01",
      end: "2026-03-31",
    });
    expect(result).toHaveLength(1);
    expect(result[0].actual).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// buildQuarterlyTargetActualSeries
// ---------------------------------------------------------------------------

describe("buildQuarterlyTargetActualSeries", () => {
  it("returns empty array for empty record set", () => {
    expect(buildQuarterlyTargetActualSeries([], FULL_RANGE)).toEqual([]);
  });

  it("aggregates Jan–Mar into Q1, Apr–Jun into Q2, etc.", () => {
    const records = [
      makeRecord("2026-01-15", 100, 120),
      makeRecord("2026-03-30", 200, 220),
      makeRecord("2026-04-01", 300, 340),
      makeRecord("2026-06-30", 100, 110),
      makeRecord("2026-09-30", 500, 550),
      makeRecord("2026-12-31", 700, 720),
    ];
    const result = buildQuarterlyTargetActualSeries(records, FULL_RANGE);
    expect(result).toHaveLength(4);
    const q1 = result.find((r) => r.periodKey === "2026-Q1")!;
    expect(q1.actual).toBe(300);
    const q2 = result.find((r) => r.periodKey === "2026-Q2")!;
    expect(q2.actual).toBe(400);
    const q3 = result.find((r) => r.periodKey === "2026-Q3")!;
    expect(q3.actual).toBe(500);
    const q4 = result.find((r) => r.periodKey === "2026-Q4")!;
    expect(q4.actual).toBe(700);
  });

  it("labels each quarter correctly as 'Q{N} {YYYY}'", () => {
    const records = [makeRecord("2026-05-15", 100, 120)];
    const result = buildQuarterlyTargetActualSeries(records, FULL_RANGE);
    expect(result[0].label).toBe("Q2 2026");
  });

  it("computes achievement correctly", () => {
    const records = [makeRecord("2026-01-10", 90, 100)];
    const result = buildQuarterlyTargetActualSeries(records, FULL_RANGE);
    expect(result[0].achievement).toBeCloseTo(90, 5);
  });

  it("handles partial quarter within date range boundary", () => {
    // Range only covers January (partial Q1)
    const records = [
      makeRecord("2026-01-31", 100, 120),
      makeRecord("2026-02-01", 200, 220), // excluded
    ];
    const result = buildQuarterlyTargetActualSeries(records, {
      start: "2026-01-01",
      end: "2026-01-31",
    });
    expect(result).toHaveLength(1);
    expect(result[0].actual).toBe(100);
  });

  it("spans multiple years when dateRange crosses a year boundary", () => {
    const records = [
      makeRecord("2025-12-15", 100, 120),
      makeRecord("2026-01-05", 200, 220),
    ];
    const result = buildQuarterlyTargetActualSeries(records, {
      start: "2025-10-01",
      end: "2026-03-31",
    });
    const keys = result.map((r) => r.periodKey);
    expect(keys).toContain("2025-Q4");
    expect(keys).toContain("2026-Q1");
  });
});

// ---------------------------------------------------------------------------
// buildYearlyTargetActualSeries
// ---------------------------------------------------------------------------

describe("buildYearlyTargetActualSeries", () => {
  it("returns empty array for empty record set", () => {
    expect(buildYearlyTargetActualSeries([], FULL_RANGE)).toEqual([]);
  });

  it("aggregates all records in the same year into one bucket", () => {
    const records = [
      makeRecord("2026-01-01", 100, 120),
      makeRecord("2026-06-15", 200, 220),
      makeRecord("2026-12-31", 300, 330),
    ];
    const result = buildYearlyTargetActualSeries(records, FULL_RANGE);
    expect(result).toHaveLength(1);
    expect(result[0].actual).toBe(600);
    expect(result[0].target).toBe(670);
  });

  it("creates separate buckets for different years", () => {
    const records = [
      makeRecord("2024-06-01", 100, 120),
      makeRecord("2025-03-01", 200, 220),
      makeRecord("2026-09-01", 300, 330),
    ];
    const result = buildYearlyTargetActualSeries(records, {
      start: "2024-01-01",
      end: "2026-12-31",
    });
    expect(result).toHaveLength(3);
    const y2025 = result.find((r) => r.periodKey === "2025")!;
    expect(y2025.actual).toBe(200);
  });

  it("orders years chronologically", () => {
    const records = [
      makeRecord("2027-01-01", 300, 330),
      makeRecord("2025-01-01", 100, 120),
      makeRecord("2026-01-01", 200, 220),
    ];
    const result = buildYearlyTargetActualSeries(records, {
      start: "2025-01-01",
      end: "2027-12-31",
    });
    expect(result.map((r) => r.periodKey)).toEqual(["2025", "2026", "2027"]);
  });

  it("labels each year as its numeric string", () => {
    const records = [makeRecord("2026-07-01", 100, 120)];
    const result = buildYearlyTargetActualSeries(records, FULL_RANGE);
    expect(result[0].label).toBe("2026");
  });

  it("computes achievement as null when target is 0", () => {
    const records = [makeRecord("2026-07-01", 50, 0)];
    const result = buildYearlyTargetActualSeries(records, FULL_RANGE);
    expect(result[0].achievement).toBeNull();
  });

  it("excludes records outside the date range", () => {
    const records = [
      makeRecord("2024-12-31", 999, 999),
      makeRecord("2026-01-01", 100, 120),
      makeRecord("2027-01-01", 888, 888),
    ];
    const result = buildYearlyTargetActualSeries(records, {
      start: "2025-01-01",
      end: "2026-12-31",
    });
    expect(result).toHaveLength(1);
    expect(result[0].actual).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Cross-function consistency tests
// ---------------------------------------------------------------------------

describe("Period aggregation — cross-function consistency", () => {
  /**
   * All four functions must return the same TOTAL actual and target when
   * given the same records and the same date range (totals are period-
   * agnostic).
   */
  it("all four series have equal total actual production", () => {
    const records = [
      makeRecord("2026-01-10", 100, 120),
      makeRecord("2026-02-15", 200, 220),
      makeRecord("2026-03-20", 150, 160),
      makeRecord("2026-04-05", 300, 340),
    ];
    const range = { start: "2026-01-01", end: "2026-12-31" };
    const sumActual = (pts: PeriodTargetActualPoint[]) =>
      pts.reduce((s, p) => s + p.actual, 0);
    const sumTarget = (pts: PeriodTargetActualPoint[]) =>
      pts.reduce((s, p) => s + p.target, 0);

    const monthly = buildMonthlyTargetActualSeries(records, range);
    const weekly = buildWeeklyTargetActualSeries(records, range);
    const quarterly = buildQuarterlyTargetActualSeries(records, range);
    const yearly = buildYearlyTargetActualSeries(records, range);

    const totalActual = sumActual(monthly);
    expect(sumActual(weekly)).toBe(totalActual);
    expect(sumActual(quarterly)).toBe(totalActual);
    expect(sumActual(yearly)).toBe(totalActual);

    const totalTarget = sumTarget(monthly);
    expect(sumTarget(weekly)).toBe(totalTarget);
    expect(sumTarget(quarterly)).toBe(totalTarget);
    expect(sumTarget(yearly)).toBe(totalTarget);
  });

  it("filters are applied before aggregation — changing date range changes all four series", () => {
    const records = [
      makeRecord("2026-01-10", 100, 120),
      makeRecord("2026-06-15", 200, 220),
      makeRecord("2026-12-20", 300, 330),
    ];

    const fullRange = { start: "2026-01-01", end: "2026-12-31" };
    const narrowRange = { start: "2026-06-01", end: "2026-06-30" };

    expect(buildMonthlyTargetActualSeries(records, fullRange)).toHaveLength(3);
    expect(buildMonthlyTargetActualSeries(records, narrowRange)).toHaveLength(1);

    expect(buildQuarterlyTargetActualSeries(records, fullRange)).toHaveLength(3);
    expect(buildQuarterlyTargetActualSeries(records, narrowRange)).toHaveLength(1);

    expect(buildYearlyTargetActualSeries(records, fullRange)).toHaveLength(1);
    expect(buildYearlyTargetActualSeries(records, narrowRange)).toHaveLength(1);
  });
});

