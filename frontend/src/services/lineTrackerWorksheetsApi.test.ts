import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "../api/client";
import {
  fetchMonthlyOrderPlan,
  fetchProductionOrderAnalytics,
  fetchRawMaterialPlanAnalytics,
  fetchHeatLotReferenceAnalytics,
  fetchMachineMasterAnalytics,
  fetchMachineConsumablesAnalytics,
  fetchCapacityChangeAnalytics,
  fetchPlannedShutdownAnalytics,
  fetchLineTrackerWorksheet,
  fetchLineTrackerWorksheetCatalog,
  fetchShiftEntriesAnalytics,
  fetchManpowerSummaryAnalytics,
  fetchProductionDashboard,
  fetchCapacityDashboard,
  fetchDashboardSummary,
} from "./lineTrackerWorksheetsApi";

vi.mock("../api/client", () => ({
  apiGet: vi.fn(),
}));

describe("lineTrackerWorksheetsApi", () => {
  const apiGetMock = vi.mocked(apiGet);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests the worksheet catalog and can explicitly refresh it", async () => {
    apiGetMock.mockResolvedValueOnce({ worksheets: [] });

    await fetchLineTrackerWorksheetCatalog(true);

    expect(apiGetMock).toHaveBeenCalledWith("/api/v1/line-tracker/worksheets", {
      refresh: "true",
    });
  });

  it("requests a worksheet with pagination, search, and refresh options", async () => {
    apiGetMock.mockResolvedValueOnce({ records: [] });

    await fetchLineTrackerWorksheet("production-order", {
      page: 3,
      pageSize: 25,
      search: "PO-2026",
      refresh: true,
    });

    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/v1/line-tracker/worksheets/production-order",
      {
        page: 3,
        page_size: 25,
        search: "PO-2026",
        refresh: "true",
      },
    );
  });

  it("encodes worksheet keys and applies default pagination", async () => {
    apiGetMock.mockResolvedValueOnce({ records: [] });

    await fetchLineTrackerWorksheet("key/with space");

    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/v1/line-tracker/worksheets/key%2Fwith%20space",
      {
        page: 1,
        page_size: 50,
        search: undefined,
        refresh: undefined,
      },
    );
  });

  it("requests production-order analytics with filters and sorting", async () => {
    apiGetMock.mockResolvedValueOnce({ orders: [] });

    await fetchProductionOrderAnalytics("copy-of-production-order", {
      page: 2,
      pageSize: 10,
      search: "Central",
      customer: "Central",
      part: "MK-V",
      status: "Open",
      sortBy: "order_quantity",
      sortOrder: "desc",
      refresh: true,
    });

    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/v1/line-tracker/orders/analytics",
      {
        worksheet_key: "copy-of-production-order",
        page: 2,
        page_size: 10,
        search: "Central",
        customer: "Central",
        part: "MK-V",
        order_status: "Open",
        sort_by: "order_quantity",
        sort_order: "desc",
        refresh: "true",
      },
    );
  });

  it("requests monthly plan filters without changing source month labels", async () => {
    apiGetMock.mockResolvedValueOnce({ plans: [] });

    await fetchMonthlyOrderPlan({
      page: 3,
      pageSize: 15,
      search: "26265489205106",
      customer: "Western Railway",
      part: "MK-V",
      type: "Production",
      month: "Feb-26",
      sortBy: "month_total",
      sortOrder: "asc",
    });

    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/v1/line-tracker/orders/monthly-plan",
      {
        page: 3,
        page_size: 15,
        search: "26265489205106",
        customer: "Western Railway",
        part: "MK-V",
        source_type: "Production",
        month: "Feb-26",
        sort_by: "month_total",
        sort_order: "asc",
        refresh: undefined,
      },
    );
  });

  it("requests raw-material plan filters and exact heat/lot lookup", async () => {
    apiGetMock.mockResolvedValueOnce({ records: [] });

    await fetchRawMaterialPlanAnalytics({
      page: 2,
      pageSize: 10,
      search: "Heat 3521493",
      customer: "Customer A",
      supplier: "Supplier B",
      sourceBatch: "Batch 7",
      heatNo: "3521493",
      lotNo: "LOT-22",
      sortBy: "yield_vs_plan_fraction",
      sortOrder: "desc",
      refresh: true,
    });

    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/v1/line-tracker/raw-material/plan-actual",
      {
        page: 2,
        page_size: 10,
        search: "Heat 3521493",
        customer: "Customer A",
        supplier: "Supplier B",
        source_batch: "Batch 7",
        heat_no: "3521493",
        lot_no: "LOT-22",
        sort_by: "yield_vs_plan_fraction",
        sort_order: "desc",
        refresh: "true",
      },
    );
  });

  it("requests reference data with the composite lookup and source-backed filters", async () => {
    apiGetMock.mockResolvedValueOnce({ records: [] });

    await fetchHeatLotReferenceAnalytics({
      customer: "Customer A",
      supplier: "Supplier B",
      sourceBatch: "Batch 7",
      heatNo: "3521493",
      lotNo: "LOT-22",
    });

    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/v1/line-tracker/raw-material/heat-lot-reference",
      {
        page: 1,
        page_size: 20,
        search: undefined,
        customer: "Customer A",
        supplier: "Supplier B",
        source_batch: "Batch 7",
        heat_no: "3521493",
        lot_no: "LOT-22",
        sort_by: "source_row",
        sort_order: "asc",
        refresh: undefined,
      },
    );
  });

  it("requests the machine registry with status, work-center, sorting, and refresh", async () => {
    apiGetMock.mockResolvedValueOnce({ records: [] });

    await fetchMachineMasterAnalytics({
      page: 2,
      pageSize: 15,
      search: "CNC 1",
      workCenter: "Turning",
      status: "Active",
      sortBy: "hourly_capacity",
      sortOrder: "desc",
      refresh: true,
    });

    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/v1/line-tracker/assets/machine-master",
      {
        page: 2,
        page_size: 15,
        search: "CNC 1",
        work_center: "Turning",
        machine_status: "Active",
        category: undefined,
        due_status: undefined,
        machine: undefined,
        classification: undefined,
        scope: undefined,
        sort_by: "hourly_capacity",
        sort_order: "desc",
        refresh: "true",
      },
    );
  });

  it("requests consumable, capacity-log, and shutdown source filters", async () => {
    apiGetMock.mockResolvedValue({ records: [] });

    await fetchMachineConsumablesAnalytics({
      workCenter: "Turning",
      machine: "CNC 1",
      category: "Tooling",
      dueStatus: "missing",
    });
    expect(apiGetMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/line-tracker/assets/machine-consumables",
      expect.objectContaining({
        work_center: "Turning",
        machine: "CNC 1",
        category: "Tooling",
        due_status: "missing",
      }),
    );

    await fetchCapacityChangeAnalytics({ classification: "example", machine: "CNC 1" });
    expect(apiGetMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/line-tracker/assets/capacity-change-log",
      expect.objectContaining({ classification: "example", machine: "CNC 1" }),
    );

    await fetchPlannedShutdownAnalytics({ classification: "unverified", scope: "Machine" });
    expect(apiGetMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/line-tracker/assets/planned-shutdowns",
      expect.objectContaining({ classification: "unverified", scope: "Machine" }),
    );
  });

  it("requests shift-entry filters, pagination, sorting, and refresh", async () => {
    apiGetMock.mockResolvedValueOnce({ records: [] });
    await fetchShiftEntriesAnalytics({
      page: 2,
      pageSize: 15,
      search: "CNC 1",
      dateFrom: "2026-09-19",
      dateTo: "2026-09-20",
      shift: "Shift 1",
      workCenter: "Turning",
      machine: "CNC 1",
      part: "MKV",
      source: "Live",
      downtimeCategory: "Breakdown",
      breakdownType: "Mechanical",
      statusVsRated: "Slower than rated",
      sortBy: "oee_fraction",
      sortOrder: "asc",
      refresh: true,
    });
    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/v1/line-tracker/operations/entries",
      {
        page: 2,
        page_size: 15,
        search: "CNC 1",
        date_from: "2026-09-19",
        date_to: "2026-09-20",
        shift: "Shift 1",
        work_center: "Turning",
        machine: "CNC 1",
        part: "MKV",
        source: "Live",
        downtime_category: "Breakdown",
        breakdown_type: "Mechanical",
        status_vs_rated: "Slower than rated",
        sort_by: "oee_fraction",
        sort_order: "asc",
        refresh: "true",
      },
    );
  });

  it("requests a separate work-center manpower summary", async () => {
    apiGetMock.mockResolvedValueOnce({ records: [] });
    await fetchManpowerSummaryAnalytics({
      level: "work-center",
      page: 2,
      pageSize: 10,
      search: "Turning",
      sortBy: "avg_actual",
      sortOrder: "desc",
    });
    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/v1/line-tracker/operations/manpower-summary",
      {
        level: "work-center",
        page: 2,
        page_size: 10,
        search: "Turning",
        sort_by: "avg_actual",
        sort_order: "desc",
        refresh: undefined,
      },
    );
  });

  it("requests Production Dashboard date, stage, and machine filters", async () => {
    apiGetMock.mockResolvedValueOnce({ records: [] });
    await fetchProductionDashboard({
      dateFrom: "2026-09-01",
      dateTo: "2026-09-18",
      stage: "Clip",
      machine: "Line 1",
      refresh: true,
    });
    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/v1/line-tracker/dashboards/production",
      {
        date_from: "2026-09-01",
        date_to: "2026-09-18",
        stage: "Clip",
        machine: "Line 1",
        refresh: "true",
      },
    );
  });

  it("requests capacity and summary dashboards from their own routes", async () => {
    apiGetMock.mockResolvedValueOnce({ records: [] });
    await fetchCapacityDashboard(true);
    expect(apiGetMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/line-tracker/dashboards/capacity",
      { refresh: "true" },
    );

    apiGetMock.mockResolvedValueOnce({ months: [] });
    await fetchDashboardSummary({
      dateFrom: "2024-08-31",
      dateTo: "2026-09-18",
    });
    expect(apiGetMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/line-tracker/dashboards/summary",
      {
        date_from: "2024-08-31",
        date_to: "2026-09-18",
        refresh: undefined,
      },
    );
  });
});
