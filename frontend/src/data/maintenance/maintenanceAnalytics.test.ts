import { describe, expect, it } from "vitest";
import {
  calculateMaintenanceAnalytics,
  deriveMaintenanceFilterOptions,
  filterMaintenanceRecords,
} from "./maintenanceAnalytics";
import type { MaintenanceFilterState, MaintenanceRecord } from "./types";

const mockRecords: MaintenanceRecord[] = [
  {
    id: "bd-1",
    plantCode: "MED- Forge",
    machine: "Bar cropper 1",
    machineOwner: "Pritam",
    date: "2026-03-15",
    shift: "B",
    downtimeMinutes: 60,
    breakdownType: "Mechanical",
    breakdownDescription: "Bearing stuck in conveyor",
    counterMeasure: "Free jammed piece",
    rootCause: "Bearing worn out",
    correctiveAction: "Replaced bearing",
    spareParts: "6204 Bearing",
    targetDate: null,
    attendedBy: "Joydeep",
    availableTime: 600,
    productionLoss: 10,
    remarks: null,
  },
  {
    id: "bd-2",
    plantCode: "MED- Forge",
    machine: "Autocopying M/C 2",
    machineOwner: "Mitu",
    date: "2026-03-16",
    shift: "A",
    downtimeMinutes: 120,
    breakdownType: "Electrical",
    breakdownDescription: "PLC sensor wiring open",
    counterMeasure: null,
    rootCause: "Cable chafing",
    correctiveAction: "Rewired and rerouted cable",
    spareParts: null,
    targetDate: null,
    attendedBy: "Gowda",
    availableTime: 540,
    productionLoss: 25,
    remarks: "Repaired quickly",
  },
  {
    id: "bd-3",
    plantCode: "MED- Forge",
    machine: "Bar cropper 1",
    machineOwner: "Pritam",
    date: "2026-04-10",
    shift: "A",
    downtimeMinutes: 30,
    breakdownType: "Mechanical",
    breakdownDescription: "Blade blunt",
    counterMeasure: "Flip blade",
    rootCause: "Normal wear",
    correctiveAction: "Sharpen spare blades",
    spareParts: "Cropper blade",
    targetDate: null,
    attendedBy: "Joydeep",
    availableTime: 630,
    productionLoss: 5,
    remarks: null,
  },
];

describe("deriveMaintenanceFilterOptions", () => {
  it("derives machines, shifts, types, technicians, and date bounds", () => {
    const opts = deriveMaintenanceFilterOptions(mockRecords);
    expect(opts.machines).toEqual(["Autocopying M/C 2", "Bar cropper 1"]);
    expect(opts.shifts).toEqual(["A", "B"]);
    expect(opts.breakdownTypes).toEqual(["Electrical", "Mechanical"]);
    expect(opts.technicians).toEqual(["Gowda", "Joydeep"]);
    expect(opts.minDate).toBe("2026-03-15");
    expect(opts.maxDate).toBe("2026-04-10");
  });
});

describe("filterMaintenanceRecords", () => {
  const baseFilter: MaintenanceFilterState = {
    dateFrom: "2026-01-01",
    dateTo: "2026-12-31",
    machine: "ALL",
    shift: "ALL",
    breakdownType: "ALL",
    attendedBy: "ALL",
    search: "",
  };

  it("filters by date range", () => {
    const filtered = filterMaintenanceRecords(mockRecords, {
      ...baseFilter,
      dateFrom: "2026-03-16",
      dateTo: "2026-03-20",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("bd-2");
  });

  it("filters by machine", () => {
    const filtered = filterMaintenanceRecords(mockRecords, {
      ...baseFilter,
      machine: "Bar cropper 1",
    });
    expect(filtered).toHaveLength(2);
  });

  it("filters by search term across descriptions and corrective actions", () => {
    const filtered = filterMaintenanceRecords(mockRecords, {
      ...baseFilter,
      search: "rewired",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].machine).toBe("Autocopying M/C 2");
  });
});

describe("calculateMaintenanceAnalytics", () => {
  it("accurately computes KPIs, Pareto, and category distributions", () => {
    const analytics = calculateMaintenanceAnalytics(mockRecords);

    // Total downtime: 60 + 120 + 30 = 210 mins
    expect(analytics.kpis.totalDowntimeMinutes).toBe(210);
    expect(analytics.kpis.totalDowntimeHours).toBe(3.5);
    expect(analytics.kpis.totalIncidents).toBe(3);
    // MTTR: 210 / 3 = 70 mins
    expect(analytics.kpis.mttrMinutes).toBe(70);
    expect(analytics.kpis.mechanicalDowntime).toBe(90);
    expect(analytics.kpis.electricalDowntime).toBe(120);
    expect(analytics.kpis.topMachineName).toBe("Autocopying M/C 2");
    expect(analytics.kpis.totalProductionLoss).toBe(40);

    // Machine Pareto checks
    expect(analytics.machinePareto).toHaveLength(2);
    expect(analytics.machinePareto[0].machine).toBe("Autocopying M/C 2");
    expect(analytics.machinePareto[0].downtimeMinutes).toBe(120);
    expect(analytics.machinePareto[1].machine).toBe("Bar cropper 1");
    expect(analytics.machinePareto[1].downtimeMinutes).toBe(90);
    expect(analytics.machinePareto[1].cumulativePercentage).toBe(100);

    // Technician performance
    expect(analytics.technicianPerformance).toHaveLength(2);
    const joydeep = analytics.technicianPerformance.find((t) => t.technician === "Joydeep");
    expect(joydeep?.incidentsAttended).toBe(2);
    expect(joydeep?.totalDowntimeMinutes).toBe(90);
    expect(joydeep?.avgResolutionMinutes).toBe(45);
  });
});

