import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchLineTrackerSummary,
  fetchLineTrackerEntries,
  fetchLineTrackerOrders,
  fetchLineTrackerPpcOrders,
  fetchLineTrackerMonthlyPlan,
  fetchLineTrackerTraceability,
  fetchLineTrackerMachines,
  fetchLineTrackerHeats,
  fetchLineTrackerOeeBreakdown,
  fetchLineTrackerReliability,
  fetchLineTrackerHistoricalRecords,
} from "./lineTrackerApi";

describe("lineTrackerApi client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchLineTrackerSummary calls /api/v1/line-tracker/summary with refresh flag", async () => {
    const mockSummary = {
      source_type: "local_excel",
      source_notice: "Local Development Source: Not Live Google Sheets",
      file_name: "ERC_MkV_Line_Tracker R0_10102026.xlsx",
      records_summary: {
        shift_entries_accepted: 10,
        historical_downtime_accepted: 14567,
        machines_count: 31,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as Response);

    const result = await fetchLineTrackerSummary(true);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/line-tracker/summary?refresh=true",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
    expect(result.source_type).toBe("local_excel");
    expect(result.records_summary.machines_count).toBe(31);
  });

  it("fetchLineTrackerEntries builds correct query parameters", async () => {
    const mockEntriesResponse = {
      count: 2,
      entries: [
        { machine: "Press line E1", work_center: "Forming", output_qty: 4866 },
        { machine: "Press line P2", work_center: "Forming", output_qty: 4898 },
      ],
      oee_aggregate: {},
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockEntriesResponse,
    } as Response);

    const result = await fetchLineTrackerEntries("Forming", "Press line E1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/line-tracker/entries?work_center=Forming&machine=Press+line+E1",
      expect.any(Object)
    );
    expect(result.count).toBe(2);
    expect(result.entries[0].machine).toBe("Press line E1");
  });

  it("fetchLineTrackerOrders returns orders", async () => {
    const mockOrders = {
      count: 6,
      orders: [{ order_number: "PO-2026-001", customer: "WR", traceability_status: "Pending Metallurgical Reconciliation" }],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockOrders,
    } as Response);

    const result = await fetchLineTrackerOrders();
    expect(result.count).toBe(6);
    expect(result.orders[0].traceability_status).toContain("Pending Metallurgical Reconciliation");
  });

  it("fetchLineTrackerMachines returns machine list", async () => {
    const mockMachines = {
      count: 31,
      machines: [{ machine: "CNC 1", work_center: "Turning", rated_ct_sec: 25.0 }],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMachines,
    } as Response);

    const result = await fetchLineTrackerMachines();
    expect(result.count).toBe(31);
    expect(result.machines[0].machine).toBe("CNC 1");
  });

  it("fetchLineTrackerHeats returns heat catalog", async () => {
    const mockHeats = {
      count: 41,
      heats: [{ heat_number: "F260566", lot_number: "PR 6/16" }],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockHeats,
    } as Response);

    const result = await fetchLineTrackerHeats();
    expect(result.count).toBe(41);
    expect(result.heats[0].heat_number).toBe("F260566");
  });

  it("fetchLineTrackerPpcOrders returns enriched orders and summary", async () => {
    const mockPpc = {
      count: 6,
      orders: [
        {
          order_number: "PO-2026-001",
          customer: "WR",
          produced_qty: 18159.0,
          outstanding_qty: 589626.0,
          completion_pct: 2.99,
          fulfillment_status: "At Risk",
        },
      ],
      summary: {
        total_ordered_qty: 3943015,
        total_produced_or_allocated_qty: 560537,
        at_risk_orders_count: 1,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPpc,
    } as Response);

    const result = await fetchLineTrackerPpcOrders(true);
    expect(fetchSpy).toHaveBeenCalledWith("/api/v1/line-tracker/ppc/orders?refresh=true", expect.any(Object));
    expect(result.count).toBe(6);
    expect(result.orders[0].fulfillment_status).toBe("At Risk");
    expect(result.summary.total_ordered_qty).toBe(3943015);
  });

  it("fetchLineTrackerMonthlyPlan returns monthly calendar and phasing", async () => {
    const mockPlan = {
      metadata: {
        source_sheet: "Order Plan (Monthly)",
        is_stale_snapshot: true,
      },
      monthly_calendar: [
        { month: "Apr-26", planned_production: 142247.0, actual_production: 0 },
      ],
      order_plans: [],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPlan,
    } as Response);

    const result = await fetchLineTrackerMonthlyPlan();
    expect(result.metadata.is_stale_snapshot).toBe(true);
    expect(result.monthly_calendar[0].planned_production).toBe(142247.0);
  });

  it("fetchLineTrackerTraceability returns conversion funnel and reconciliation alerts", async () => {
    const mockTrace = {
      funnel_summary: {
        total_billet_mt: 2102.18,
        total_forming_ok_nos: 1456660,
      },
      verified_heats_count: 40,
      heats: [],
      reconciliation_alerts: [
        { heat_number: "H-2409-118", status: "Pending Metallurgical Reconciliation" },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockTrace,
    } as Response);

    const result = await fetchLineTrackerTraceability();
    expect(result.verified_heats_count).toBe(40);
    expect(result.reconciliation_alerts[0].status).toContain("Pending Metallurgical Reconciliation");
  });

  it("throws descriptive error when response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    await expect(fetchLineTrackerSummary()).rejects.toThrow(
      "Failed to fetch line tracker summary: 500 Internal Server Error"
    );
  });

  it("fetchLineTrackerOeeBreakdown calls /api/v1/line-tracker/oee/breakdown with query parameters", async () => {
    const mockOeeResponse = {
      overall: {
        count: 10,
        oee_pct: 37.96,
        availability_pct: 100.0,
        performance_pct: 38.17,
        quality_pct: 99.45,
        sum_speed_loss_min: 4080.8,
      },
      work_centers: [
        { work_center: "Turning", metrics: { oee_pct: 30.06 } },
        { work_center: "Forming", metrics: { oee_pct: 67.53 } },
      ],
      machines: [],
      shifts: [],
      speed_loss_pareto: [],
      cycle_time_analysis: {
        total_speed_loss_minutes: 4080.8,
        slower_than_rated_count: 9,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockOeeResponse,
    } as Response);

    const result = await fetchLineTrackerOeeBreakdown({
      workCenter: "Turning",
      shift: "Shift 2 (Night)",
      refresh: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/line-tracker/oee/breakdown?work_center=Turning&shift=Shift+2+%28Night%29&refresh=true",
      expect.any(Object)
    );
    expect(result.overall.oee_pct).toBe(37.96);
    expect(result.work_centers[0].work_center).toBe("Turning");
    expect(result.cycle_time_analysis.total_speed_loss_minutes).toBe(4080.8);
  });

  it("fetchLineTrackerEntries supports object parameters with shift and date filtering", async () => {
    const mockResp = {
      count: 7,
      entries: [{ machine: "CNC 1", work_center: "Turning" }],
      oee_aggregate: { oee_pct: 30.06 },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResp,
    } as Response);

    const result = await fetchLineTrackerEntries({
      workCenter: "Turning",
      shift: "Shift 2 (Night)",
      dateFrom: "2026-09-19",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/line-tracker/entries?work_center=Turning&shift=Shift+2+%28Night%29&date_from=2026-09-19",
      expect.any(Object)
    );
    expect(result.count).toBe(7);
  });

  it("fetchLineTrackerReliability calls /api/v1/line-tracker/reliability/pareto with query parameters", async () => {
    const mockReliability = {
      summary: {
        total_records: 14567,
        total_downtime_hours: 36542.3,
        overall_mttr_hours: 3.81,
        overall_mtbf_approx_hours: 12.1,
        mirrored_rows_excluded: 302,
      },
      category_pareto: [
        { category: "Dimensions & Length Issue", total_hours: 14303.1, share_pct: 39.14 },
        { category: "Breakdown", total_hours: 5644.8, share_pct: 15.45 },
      ],
      machine_ranking: [
        { machine: "Autocopying-5", breakdown_event_count: 148, mttr_hours: 6.6, mtbf_approx_hours: 121.3 },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockReliability,
    } as Response);

    const result = await fetchLineTrackerReliability({
      category: "Breakdown",
      machine: "Autocopying-5",
      refresh: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/line-tracker/reliability/pareto?category=Breakdown&machine=Autocopying-5&refresh=true",
      expect.any(Object)
    );
    expect(result.summary.total_records).toBe(14567);
    expect(result.summary.overall_mttr_hours).toBe(3.81);
    expect(result.summary.mirrored_rows_excluded).toBe(302);
    expect(result.category_pareto[0].category).toBe("Dimensions & Length Issue");
  });

  it("selects the isolated Google Sheets source for the Downtime Log analysis", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ summary: { total_records: 1 } }),
    } as Response);

    await fetchLineTrackerReliability({ source: "google_sheets" });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/line-tracker/reliability/pareto?source=google_sheets",
      expect.any(Object)
    );
  });

  it("fetchLineTrackerHistoricalRecords calls /api/v1/line-tracker/reliability/records with search and pagination", async () => {
    const mockRecords = {
      total_count: 14567,
      page: 2,
      page_size: 50,
      total_pages: 292,
      records: [
        { row_number: 51, machine: "Autocopying-5", category: "Breakdown", downtime_minutes: 120 },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockRecords,
    } as Response);

    const result = await fetchLineTrackerHistoricalRecords({
      search: "Hydraulic",
      page: 2,
      pageSize: 50,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/line-tracker/reliability/records?search=Hydraulic&page=2&page_size=50",
      expect.any(Object)
    );
    expect(result.total_count).toBe(14567);
    expect(result.records[0].machine).toBe("Autocopying-5");
  });

  it("keeps the paginated Downtime Log records on the Google Sheets source", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ total_count: 1, records: [] }),
    } as Response);

    await fetchLineTrackerHistoricalRecords({ source: "google_sheets", page: 1, pageSize: 25 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/line-tracker/reliability/records?page=1&page_size=25&source=google_sheets",
      expect.any(Object)
    );
  });
});



