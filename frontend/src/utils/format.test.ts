import { describe, expect, it } from "vitest";
import {
  formatCompactQuantity,
  formatExactQuantity,
  formatCompactWithExact,
  formatPercentage,
  formatMinutes,
  formatMinutesDual,
} from "./format";

describe("Dual Number Formatter Specification", () => {
  it("formats value < 1,000 as exact directly", () => {
    expect(formatCompactQuantity(100)).toBe("100");
    expect(formatExactQuantity(100)).toBe("100");
    expect(formatCompactWithExact(100)).toEqual({
      compact: "100",
      exact: "100",
    });
  });

  it("formats 1,000 with 1 decimal place", () => {
    expect(formatCompactQuantity(1000)).toBe("1.0K");
    expect(formatExactQuantity(1000)).toBe("1,000");
    expect(formatCompactWithExact(1000)).toEqual({
      compact: "1.0K",
      exact: "1,000",
    });
  });

  it("formats 10,000 as 10.0K", () => {
    expect(formatCompactQuantity(10000)).toBe("10.0K");
    expect(formatExactQuantity(10000)).toBe("10,000");
  });

  it("formats 16,398 as 16.4K (16,398)", () => {
    expect(formatCompactQuantity(16398)).toBe("16.4K");
    expect(formatExactQuantity(16398)).toBe("16,398");
    expect(formatCompactWithExact(16398)).toEqual({
      compact: "16.4K",
      exact: "16,398",
    });
  });

  it("formats 52,800 as 52.8K (52,800)", () => {
    expect(formatCompactQuantity(52800)).toBe("52.8K");
    expect(formatExactQuantity(52800)).toBe("52,800");
  });

  it("formats 68,764 as 68.8K (68,764)", () => {
    expect(formatCompactQuantity(68764)).toBe("68.8K");
    expect(formatExactQuantity(68764)).toBe("68,764");
  });

  it("formats 256,107 as 256.1K (256,107)", () => {
    expect(formatCompactQuantity(256107)).toBe("256.1K");
    expect(formatExactQuantity(256107)).toBe("256,107");
    expect(formatCompactWithExact(256107)).toEqual({
      compact: "256.1K",
      exact: "256,107",
    });
  });

  it("formats 476,300 as 476.3K (476,300)", () => {
    expect(formatCompactQuantity(476300)).toBe("476.3K");
    expect(formatExactQuantity(476300)).toBe("476,300");
  });

  it("formats 999,999 as 1000.0K (999,999)", () => {
    expect(formatCompactQuantity(999999)).toBe("1000.0K");
    expect(formatExactQuantity(999999)).toBe("999,999");
  });

  it("formats 1,000,000 as 1.00M (1,000,000)", () => {
    expect(formatCompactQuantity(1000000)).toBe("1.00M");
    expect(formatExactQuantity(1000000)).toBe("1,000,000");
  });

  it("formats 1,250,000 as 1.25M (1,250,000)", () => {
    expect(formatCompactQuantity(1250000)).toBe("1.25M");
    expect(formatExactQuantity(1250000)).toBe("1,250,000");
  });

  it("formats 1,965,295 as 1.97M (1,965,295)", () => {
    expect(formatCompactQuantity(1965295)).toBe("1.97M");
    expect(formatExactQuantity(1965295)).toBe("1,965,295");
    expect(formatCompactWithExact(1965295)).toEqual({
      compact: "1.97M",
      exact: "1,965,295",
    });
  });

  it("formats 2,351,081 as 2.35M (2,351,081)", () => {
    expect(formatCompactQuantity(2351081)).toBe("2.35M");
    expect(formatExactQuantity(2351081)).toBe("2,351,081");
    expect(formatCompactWithExact(2351081)).toEqual({
      compact: "2.35M",
      exact: "2,351,081",
    });
  });

  it("formats 4,467,187 as 4.47M (4,467,187)", () => {
    expect(formatCompactQuantity(4467187)).toBe("4.47M");
    expect(formatExactQuantity(4467187)).toBe("4,467,187");
    expect(formatCompactWithExact(4467187)).toEqual({
      compact: "4.47M",
      exact: "4,467,187",
    });
  });

  it("formats 10,000,000 as 10.00M (10,000,000)", () => {
    expect(formatCompactQuantity(10000000)).toBe("10.00M");
    expect(formatExactQuantity(10000000)).toBe("10,000,000");
  });

  it("formats 10,500,000 as 10.50M (10,500,000)", () => {
    expect(formatCompactQuantity(10500000)).toBe("10.50M");
    expect(formatExactQuantity(10500000)).toBe("10,500,000");
  });

  it("preserves percentages without compact formatting", () => {
    expect(formatPercentage(43.99)).toBe("43.99%");
    expect(formatPercentage(0.83)).toBe("0.83%");
    expect(formatPercentage(44.0, 1)).toBe("44.0%");
    expect(formatPercentage(null)).toBe("N/A");
  });

  it("formats minutes with dual presentation", () => {
    expect(formatMinutes(256107)).toBe("256.1K min (256,107 min)");
    expect(formatMinutes(500)).toBe("500 min");
    const dual = formatMinutesDual(256107);
    expect(dual.compact).toBe("256.1K min");
    expect(dual.exact).toBe("256,107 min");
  });
});

