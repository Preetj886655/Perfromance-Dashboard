import { describe, expect, it } from "vitest";
import { normalizeDprRow } from "./normalizeDprData";
import { mapToWorkCenter } from "./workCenterMapping";

describe("operational record normalization", () => {
  it("binds downtime fields and converts hours to minutes", () => {
    const record = normalizeDprRow({
      Date: "2026-09-18",
      Stage: "Turned Bar",
      "Machine Name": "W-CNC 6",
      "Downtime Hours": "1,234.5",
      "Downtime Category": "Breakdown",
      "Downtime Type (raw)": "Mechanical",
    }, 0);

    expect(record?.totalIdleTimeMinutes).toBe(74070);
    expect(record?.downtimeCategory).toBe("Breakdown");
    expect(record?.downtimeType).toBe("Mechanical");
    expect(record?.workCenter).toBe("CNC Turning");
  });

  it("resolves the requested stage and machine families", () => {
    expect(mapToWorkCenter("Bar corpper 1", "Cut Bar")).toBe("Bar Cropping (BC)");
    expect(mapToWorkCenter("DB 4", "Deburring")).toBe("Deburring (DB)");
    expect(mapToWorkCenter("MPI 3", "MPI")).toBe("MPI Inspection");
    expect(mapToWorkCenter("Autocopying-5", "Turned Bar")).toBe("Autocopy Turning");
    expect(mapToWorkCenter("Press line E1", "Forming")).toBe("Clip Forming");
    expect(mapToWorkCenter("Quenching", "Quenching")).toBe("Heat Treatment");
    expect(mapToWorkCenter("Packing", "Packing")).toBe("Packing");
  });

  it("keeps unavailable downtime values unavailable", () => {
    const record = normalizeDprRow({
      Date: "2026-09-18",
      Stage: "Packing",
      "Machine Name": "Packing",
      "Downtime Mins": "#N/A",
    }, 0);

    expect(record?.totalIdleTimeMinutes).toBeUndefined();
    expect(record?.downtimeCategory).toBeUndefined();
  });
});
