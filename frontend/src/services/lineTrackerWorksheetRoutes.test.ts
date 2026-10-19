import { describe, expect, it } from "vitest";
import {
  buildLineTrackerWorksheetHash,
  parseLineTrackerWorksheetRoute,
} from "./lineTrackerWorksheetRoutes";

describe("lineTrackerWorksheetRoutes", () => {
  it("parses a worksheet route with an encoded exact composite key", () => {
    const route = parseLineTrackerWorksheetRoute(
      "#/line-tracker/worksheet/rm-heat-plan-vs-actual?heat_no=3521493&lot_no=LOT%2F22",
    );

    expect(route?.worksheetKey).toBe("rm-heat-plan-vs-actual");
    expect(route?.params.get("heat_no")).toBe("3521493");
    expect(route?.params.get("lot_no")).toBe("LOT/22");
  });

  it("builds an encoded drill-down hash for a reference record", () => {
    expect(
      buildLineTrackerWorksheetHash("heat-lot-number-reference", {
        heat_no: "3521493",
        lot_no: "LOT/22",
      }),
    ).toBe(
      "#/line-tracker/worksheet/heat-lot-number-reference?heat_no=3521493&lot_no=LOT%2F22",
    );
  });

  it("omits empty parameters and rejects a non-worksheet route", () => {
    expect(
      buildLineTrackerWorksheetHash("rm-heat-plan-vs-actual", {
        heat_no: "",
        lot_no: undefined,
      }),
    ).toBe("#/line-tracker/worksheet/rm-heat-plan-vs-actual");
    expect(parseLineTrackerWorksheetRoute("#/line-tracker")).toBeNull();
  });

  it("preserves exact machine identifiers in related worksheet navigation", () => {
    const hash = buildLineTrackerWorksheetHash("machine-consumables", {
      work_center: "Turning",
      machine: "CNC 1",
    });
    const route = parseLineTrackerWorksheetRoute(hash);

    expect(route?.worksheetKey).toBe("machine-consumables");
    expect(route?.params.get("work_center")).toBe("Turning");
    expect(route?.params.get("machine")).toBe("CNC 1");
  });

  it("keeps the Phase 5 worksheet routes addressable", () => {
    expect(parseLineTrackerWorksheetRoute("#/line-tracker/worksheet/entries")?.worksheetKey)
      .toBe("entries");
    expect(parseLineTrackerWorksheetRoute("#/line-tracker/worksheet/manpower-summary")?.worksheetKey)
      .toBe("manpower-summary");
  });

  it("keeps Phase 1–4 worksheet routes addressable", () => {
    const phaseOneToFourKeys = [
      "production-order",
      "copy-of-production-order",
      "order-plan-monthly",
      "rm-heat-plan-vs-actual",
      "heat-lot-number-reference",
      "machine-consumables",
      "machine-master",
      "capacity-change-log",
      "planned-shutdowns",
      "downtime-log",
      "downtime-analysis",
      "oee-reliability",
    ];

    for (const key of phaseOneToFourKeys) {
      expect(parseLineTrackerWorksheetRoute(`#/line-tracker/worksheet/${key}`)?.worksheetKey)
        .toBe(key);
    }
  });

  it("keeps the Phase 6 dashboard worksheet routes addressable", () => {
    expect(parseLineTrackerWorksheetRoute("#/line-tracker/worksheet/production-dashboard")?.worksheetKey)
      .toBe("production-dashboard");
    expect(parseLineTrackerWorksheetRoute("#/line-tracker/worksheet/dashboard")?.worksheetKey)
      .toBe("dashboard");
    expect(parseLineTrackerWorksheetRoute("#/line-tracker/worksheet/summary")?.worksheetKey)
      .toBe("summary");
  });
});
