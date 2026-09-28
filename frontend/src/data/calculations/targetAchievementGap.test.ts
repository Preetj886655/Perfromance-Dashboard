import { describe, expect, it } from "vitest";
import {
  calculateGapAndAchievement,
  calculateTargetAchievementGap,
} from "./targetAchievementGap";
import type { DprRecord } from "../normalization/normalizeDprData";

function makeMockRecord(overrides: Partial<DprRecord>): DprRecord {
  return {
    index: 1,
    date: "2026-05-15",
    lineName: "ERC",
    shift: "A",
    rawStage: "Clip",
    partName: "MK-V",
    material: "MK-V",
    targetProduction: 1000,
    actualProductionQty: 800,
    totalIdleTimeMinutes: 10,
    plannedDownTimeMinutes: 0,
    totalRejectionQty: 5,
    customColumns: {},
    raw: {},
    idleReasonBreakup: [],
    rejectionReasonBreakup: [],
    ...overrides,
  };
}

describe("Target / Achievement / Gap Analysis Calculation Engine", () => {
  describe("Mathematical Formula & Edge Cases", () => {
    it("TEST 1: Target = 4048, Achieved = 647 -> Gap = 3401, Achievement ~ 15.98%", () => {
      const res = calculateGapAndAchievement(4048, 647);
      expect(res.gap).toBe(3401);
      expect(res.achievementPct).toBeCloseTo(15.9832, 2);
    });

    it("TEST 2: Target = 3708, Achieved = 1562 -> Gap = 2146, Achievement ~ 42.12%", () => {
      const res = calculateGapAndAchievement(3708, 1562);
      expect(res.gap).toBe(2146);
      expect(res.achievementPct).toBeCloseTo(42.125, 2);
    });

    it("TEST 3: Target = 1000, Achieved = 1200 -> Gap = 0, Achievement = 120%", () => {
      const res = calculateGapAndAchievement(1000, 1200);
      expect(res.gap).toBe(0); // Gap never becomes negative
      expect(res.achievementPct).toBe(120);
    });

    it("TEST 4: Target = 0, Achieved = 500 -> Gap = 0, Achievement = 0% (no division by zero)", () => {
      const res = calculateGapAndAchievement(0, 500);
      expect(res.gap).toBe(0);
      expect(res.achievementPct).toBe(0);
      expect(Number.isFinite(res.achievementPct)).toBe(true);
    });

    it("TEST 5: Target = 1000, Achieved = 0 -> Gap = 1000, Achievement = 0%", () => {
      const res = calculateGapAndAchievement(1000, 0);
      expect(res.gap).toBe(1000);
      expect(res.achievementPct).toBe(0);
    });

    it("Handles null, undefined, and non-finite inputs safely", () => {
      const res1 = calculateGapAndAchievement(Number.NaN, 500);
      expect(res1.gap).toBe(0);
      expect(res1.achievementPct).toBe(0);

      const res2 = calculateGapAndAchievement(1000, Number.NaN);
      expect(res2.gap).toBe(1000);
      expect(res2.achievementPct).toBe(0);
    });
  });

  describe("Dataset Aggregation & Period Grouping", () => {
    const sampleRecords: DprRecord[] = [
      makeMockRecord({
        index: 1,
        date: "2026-01-10",
        lineName: "ERC",
        shift: "A",
        rawStage: "Clip",
        partName: "MK-V",
        material: "MK-V",
        targetProduction: 2000,
        actualProductionQty: 1500,
      }),
      makeMockRecord({
        index: 2,
        date: "2026-01-20",
        lineName: "ERC",
        shift: "B",
        rawStage: "Clip",
        partName: "MK-V",
        material: "MK-V",
        targetProduction: 2048,
        actualProductionQty: 1200,
      }),
      makeMockRecord({
        index: 3,
        date: "2026-02-15",
        lineName: "SKL",
        shift: "B",
        rawStage: "Finishing",
        partName: "MK-III",
        material: "MK-III",
        targetProduction: 3000,
        actualProductionQty: 1000,
      }),
      makeMockRecord({
        index: 4,
        date: "2026-03-05",
        lineName: "ERC",
        shift: "C",
        rawStage: "Clip",
        partName: "MK-V",
        material: "MK-V",
        targetProduction: 1000,
        actualProductionQty: 1500, // Achieved > Target
      }),
    ];

    it("TEST 6: Line filter isolation - ERC records only contribute", () => {
      const ercRecords = sampleRecords.filter((r) => r.lineName === "ERC");
      const summary = calculateTargetAchievementGap(
        ercRecords,
        { start: "2026-01-01", end: "2026-03-31" },
        "monthly"
      );

      // ERC records: r1 (2000/1500), r2 (2048/1200), r4 (1000/1500)
      // Total Target = 2000 + 2048 + 1000 = 5048
      // Total Achieved = 1500 + 1200 + 1500 = 4200
      expect(summary.totalTarget).toBe(5048);
      expect(summary.totalAchieved).toBe(4200);
      expect(summary.yetToAchieve).toBe(848);
      expect(summary.achievementPct).toBeCloseTo((4200 / 5048) * 100, 2);
    });

    it("TEST 7: Shift filter isolation - Shift B records only contribute", () => {
      const shiftBRecords = sampleRecords.filter((r) => r.shift === "B");
      const summary = calculateTargetAchievementGap(
        shiftBRecords,
        { start: "2026-01-01", end: "2026-03-31" },
        "monthly"
      );

      // Shift B: r2 (2048/1200) + r3 (3000/1000)
      expect(summary.totalTarget).toBe(5048);
      expect(summary.totalAchieved).toBe(2200);
      expect(summary.yetToAchieve).toBe(2848);
    });

    it("TEST 8: Stage filter isolation - Clip records only contribute", () => {
      const clipRecords = sampleRecords.filter((r) => r.rawStage === "Clip");
      const summary = calculateTargetAchievementGap(
        clipRecords,
        { start: "2026-01-01", end: "2026-03-31" },
        "monthly"
      );

      // Clip: r1 (2000/1500), r2 (2048/1200), r4 (1000/1500)
      expect(summary.totalTarget).toBe(5048);
      expect(summary.totalAchieved).toBe(4200);
    });

    it("TEST 9: Material filter isolation - MK-V records only contribute", () => {
      const mkvRecords = sampleRecords.filter((r) => r.material === "MK-V");
      const summary = calculateTargetAchievementGap(
        mkvRecords,
        { start: "2026-01-01", end: "2026-03-31" },
        "monthly"
      );

      // MK-V: r1 (2000/1500), r2 (2048/1200), r4 (1000/1500)
      expect(summary.totalTarget).toBe(5048);
      expect(summary.totalAchieved).toBe(4200);
    });

    it("TEST 10: Monthly vs Weekly grouping changes the series structure", () => {
      const monthly = calculateTargetAchievementGap(
        sampleRecords,
        { start: "2026-01-01", end: "2026-03-31" },
        "monthly"
      );
      const weekly = calculateTargetAchievementGap(
        sampleRecords,
        { start: "2026-01-01", end: "2026-03-31" },
        "weekly"
      );

      // Monthly has Jan, Feb, Mar (3 buckets)
      expect(monthly.series.length).toBe(3);
      expect(monthly.series[0].label).toContain("Jan 2026");
      expect(monthly.series[1].label).toContain("Feb 2026");
      expect(monthly.series[2].label).toContain("Mar 2026");

      // Weekly has multiple W-buckets
      expect(weekly.series.length).toBeGreaterThan(0);
      expect(weekly.series[0].label).toMatch(/W\d{2}/);
    });

    it("TEST 11: Weekly vs Quarterly grouping changes the series structure", () => {
      const quarterly = calculateTargetAchievementGap(
        sampleRecords,
        { start: "2026-01-01", end: "2026-03-31" },
        "quarterly"
      );

      // Q1 2026 covers Jan-Mar
      expect(quarterly.series.length).toBe(1);
      expect(quarterly.series[0].label).toBe("Q1 2026");
      expect(quarterly.series[0].target).toBe(8048);
      expect(quarterly.series[0].achieved).toBe(5200);
    });

    it("TEST 12: Quarterly vs Yearly grouping changes the series structure", () => {
      const yearly = calculateTargetAchievementGap(
        sampleRecords,
        { start: "2026-01-01", end: "2026-03-31" },
        "yearly"
      );

      expect(yearly.series.length).toBe(1);
      expect(yearly.series[0].label).toBe("2026");
      expect(yearly.series[0].target).toBe(8048);
      expect(yearly.series[0].achieved).toBe(5200);
    });

    it("TEST 13: Date Range filtering excludes out-of-range records", () => {
      // Limit to February only: 2026-02-01 to 2026-02-28
      const febOnly = calculateTargetAchievementGap(
        sampleRecords,
        { start: "2026-02-01", end: "2026-02-28" },
        "monthly"
      );

      expect(febOnly.series.length).toBe(1);
      expect(febOnly.series[0].label).toContain("Feb 2026");
      expect(febOnly.totalTarget).toBe(3000);
      expect(febOnly.totalAchieved).toBe(1000);
      expect(febOnly.yetToAchieve).toBe(2000);
    });

    it("TEST 14: Dynamic dataset updates update the series and KPIs", () => {
      const initial = calculateTargetAchievementGap(
        sampleRecords,
        { start: "2026-01-01", end: "2026-04-30" },
        "monthly"
      );

      // Add a new row in April (e.g. from newly refreshed Google Sheets)
      const updatedRecords = [
        ...sampleRecords,
        makeMockRecord({
          index: 5,
          date: "2026-04-10",
          targetProduction: 5000,
          actualProductionQty: 4500,
        }),
      ];

      const afterRefresh = calculateTargetAchievementGap(
        updatedRecords,
        { start: "2026-01-01", end: "2026-04-30" },
        "monthly"
      );

      expect(afterRefresh.series.length).toBe(initial.series.length + 1);
      expect(afterRefresh.totalTarget).toBe(initial.totalTarget + 5000);
      expect(afterRefresh.totalAchieved).toBe(initial.totalAchieved + 4500);
    });

    it("Correctly handles periods where Achieved > Target (overachievement)", () => {
      // March row: target = 1000, actual = 1500
      const marchOnly = calculateTargetAchievementGap(
        sampleRecords,
        { start: "2026-03-01", end: "2026-03-31" },
        "monthly"
      );

      expect(marchOnly.series[0].target).toBe(1000);
      expect(marchOnly.series[0].achieved).toBe(1500);
      expect(marchOnly.series[0].gap).toBe(0); // Zero gap
      expect(marchOnly.series[0].achievementPct).toBe(150); // 150%
    });
  });
});

