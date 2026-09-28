import { describe, expect, it } from "vitest";
import {
  ALL_MACHINES,
  applyFilters,
  buildFilterOptions,
  collectMachines,
  defaultFilters,
  normalizeMachine,
  type FilterState,
} from "./dashboardFilterEngine";
import type { DprRecord } from "../normalization/normalizeDprData";

function makeMockRecord(overrides: Partial<DprRecord> = {}): DprRecord {
  return {
    index: 0,
    date: "2026-09-01",
    lineName: "ERC",
    shift: "A",
    rawStage: "Clip",
    machineName: "Line 1",
    material: "MK-V",
    actualProductionQty: 100,
    targetProduction: 150,
    productionLoss: 10,
    totalIdleTimeMinutes: 20,
    totalRejectionQty: 2,
    idleReasonBreakup: [],
    rejectionReasonBreakup: [],
    customColumns: {},
    raw: {},
    ...overrides,
  };
}

describe("Dashboard Filter Engine — Machine Filter Integration", () => {
  it("defines ALL_MACHINES and includes it in defaultFilters", () => {
    expect(ALL_MACHINES).toBe("All Machines");
    expect(defaultFilters.machine).toBe("All Machines");
  });

  it("normalizes machine values: collapses whitespace and drops null/empty", () => {
    expect(normalizeMachine("  Line 1  ")).toBe("Line 1");
    expect(normalizeMachine("Line   2")).toBe("Line 2");
    expect(normalizeMachine("")).toBeNull();
    expect(normalizeMachine("   ")).toBeNull();
    expect(normalizeMachine(null)).toBeNull();
    expect(normalizeMachine(undefined)).toBeNull();
  });

  it("dynamically collects unique machine values sorted alphabetically without blanks", () => {
    const records: DprRecord[] = [
      makeMockRecord({ index: 1, machineName: "Line 2" }),
      makeMockRecord({ index: 2, machineName: "Line 1" }),
      makeMockRecord({ index: 3, machineName: "  Line 1  " }),
      makeMockRecord({ index: 4, machineName: "Autocopying-1" }),
      makeMockRecord({ index: 5, machineName: "" }),
      makeMockRecord({ index: 6, machineName: undefined }),
    ];

    const machines = collectMachines(records);
    expect(machines).toEqual(["Autocopying-1", "Line 1", "Line 2"]);
  });

  it("buildFilterOptions includes dynamic machines array", () => {
    const records: DprRecord[] = [
      makeMockRecord({ index: 1, machineName: "Line 2" }),
      makeMockRecord({ index: 2, machineName: "Line 1" }),
    ];
    const options = buildFilterOptions(records);
    expect(options.machines).toContain("Line 1");
    expect(options.machines).toContain("Line 2");
    expect(options.machines.length).toBe(2);
  });

  it("applyFilters returns all records when machine is 'All Machines'", () => {
    const records: DprRecord[] = [
      makeMockRecord({ index: 1, machineName: "Line 1" }),
      makeMockRecord({ index: 2, machineName: "Line 2" }),
      makeMockRecord({ index: 3, machineName: "Autocopying-1" }),
    ];

    const filtered = applyFilters(records, defaultFilters);
    expect(filtered.length).toBe(3);
  });

  it("applyFilters strictly filters by selected Machine (Line 1 vs Line 2)", () => {
    const records: DprRecord[] = [
      makeMockRecord({ index: 1, machineName: "Line 1", actualProductionQty: 100 }),
      makeMockRecord({ index: 2, machineName: "Line 1", actualProductionQty: 200 }),
      makeMockRecord({ index: 3, machineName: "Line 2", actualProductionQty: 300 }),
      makeMockRecord({ index: 4, machineName: "Autocopying-1", actualProductionQty: 400 }),
    ];

    const filterLine1: FilterState = { ...defaultFilters, machine: "Line 1" };
    const resLine1 = applyFilters(records, filterLine1);
    expect(resLine1.length).toBe(2);
    expect(resLine1.map((r) => r.index)).toEqual([1, 2]);

    const filterLine2: FilterState = { ...defaultFilters, machine: "Line 2" };
    const resLine2 = applyFilters(records, filterLine2);
    expect(resLine2.length).toBe(1);
    expect(resLine2[0].index).toBe(3);
  });

  it("verifies mathematical reconciliation: Line 1 + Line 2 contributions", () => {
    const records: DprRecord[] = [
      makeMockRecord({ index: 1, machineName: "Line 1", actualProductionQty: 500, targetProduction: 1000 }),
      makeMockRecord({ index: 2, machineName: "Line 2", actualProductionQty: 450, targetProduction: 900 }),
      makeMockRecord({ index: 3, machineName: "Autocopying-1", actualProductionQty: 1000, targetProduction: 1200 }),
    ];

    const line1 = applyFilters(records, { ...defaultFilters, machine: "Line 1" });
    const line2 = applyFilters(records, { ...defaultFilters, machine: "Line 2" });

    const prodLine1 = line1.reduce((sum, r) => sum + (r.actualProductionQty ?? 0), 0);
    const prodLine2 = line2.reduce((sum, r) => sum + (r.actualProductionQty ?? 0), 0);

    expect(prodLine1).toBe(500);
    expect(prodLine2).toBe(450);
    expect(prodLine1 + prodLine2).toBe(950);
  });

  it("does NOT confuse Line and Machine dimensions", () => {
    const records: DprRecord[] = [
      makeMockRecord({ index: 1, lineName: "ERC", machineName: "Line 1" }),
      makeMockRecord({ index: 2, lineName: "ERC", machineName: "Line 2" }),
    ];

    // Filter by Line="ERC Line" and Machine="Line 1"
    const filtered = applyFilters(records, {
      ...defaultFilters,
      line: "ERC Line",
      machine: "Line 1",
    });

    expect(filtered.length).toBe(1);
    expect(filtered[0].lineName).toBe("ERC");
    expect(filtered[0].machineName).toBe("Line 1");
  });
});
