import { useCallback, useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { motion, AnimatePresence } from "motion/react";
import {
  calculateMaintenanceAnalytics,
  deriveMaintenanceFilterOptions,
  filterMaintenanceRecords,
} from "../../data/maintenance/maintenanceAnalytics";
import type {
  MaintenanceApiResponse,
  MaintenanceFilterState,
  MaintenanceRecord,
} from "../../data/maintenance/types";
import { fetchMaintenanceDataset } from "../../services/maintenanceApi";
import {
  CHART_COLORS,
  axisLabelStyle,
  gridStyle,
  tooltipStyle,
} from "../dashboard/slides/chartTheme";

export function MaintenanceDashboard() {
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [apiResponse, setApiResponse] = useState<MaintenanceApiResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal state for viewing incident details
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceRecord | null>(null);

  // Table pagination state
  const [tablePage, setTablePage] = useState<number>(1);
  const pageSize = 15;

  // Filter state
  const [filters, setFilters] = useState<MaintenanceFilterState>({
    dateFrom: "",
    dateTo: "",
    machine: "ALL",
    shift: "ALL",
    breakdownType: "ALL",
    attendedBy: "ALL",
    search: "",
  });

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setFetchError(null);

    try {
      const resp = await fetchMaintenanceDataset(undefined, undefined, isRefresh);
      setApiResponse(resp);

      // Initialize date bounds on first load if not set
      if (resp.data && resp.data.length > 0) {
        setFilters((prev) => {
          if (prev.dateFrom && prev.dateTo) return prev;
          const opts = deriveMaintenanceFilterOptions(resp.data);
          return {
            ...prev,
            dateFrom: opts.defaultDateFrom,
            dateTo: opts.maxDate,
          };
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFetchError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const rawRecords = useMemo(() => apiResponse?.data ?? [], [apiResponse]);

  const filterOptions = useMemo(
    () => deriveMaintenanceFilterOptions(rawRecords),
    [rawRecords],
  );

  const filteredRecords = useMemo(
    () => filterMaintenanceRecords(rawRecords, filters),
    [rawRecords, filters],
  );

  const analytics = useMemo(
    () => calculateMaintenanceAnalytics(filteredRecords),
    [filteredRecords],
  );

  // Table pagination
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (tablePage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, tablePage]);

  // Export CSV
  const handleExportCsv = () => {
    if (filteredRecords.length === 0) return;
    const headers = [
      "ID",
      "Date",
      "Shift",
      "Machine",
      "Breakdown Type",
      "Downtime (mins)",
      "Attended By",
      "Problem Description",
      "Root Cause",
      "Corrective Action",
      "Counter Measure",
      "Spare Parts",
      "Production Loss",
    ];

    const rows = filteredRecords.map((r) => [
      r.id,
      r.date ?? "",
      r.shift ?? "",
      `"${(r.machine ?? "").replace(/"/g, '""')}"`,
      `"${(r.breakdownType ?? "").replace(/"/g, '""')}"`,
      r.downtimeMinutes,
      `"${(r.attendedBy ?? "").replace(/"/g, '""')}"`,
      `"${(r.breakdownDescription ?? "").replace(/"/g, '""')}"`,
      `"${(r.rootCause ?? "").replace(/"/g, '""')}"`,
      `"${(r.correctiveAction ?? "").replace(/"/g, '""')}"`,
      `"${(r.counterMeasure ?? "").replace(/"/g, '""')}"`,
      `"${(r.spareParts ?? "").replace(/"/g, '""')}"`,
      r.productionLoss ?? "",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `patil_maintenance_breakdown_${filters.dateFrom}_to_${filters.dateTo}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Preset handlers
  const handleCurrentYear = () => {
    const curYear = new Date().getFullYear();
    setFilters((prev) => ({
      ...prev,
      dateFrom: `${curYear}-01-01`,
      dateTo: filterOptions.maxDate,
    }));
    setTablePage(1);
  };

  const handleAllTime = () => {
    setFilters((prev) => ({
      ...prev,
      dateFrom: filterOptions.minDate,
      dateTo: filterOptions.maxDate,
    }));
    setTablePage(1);
  };

  const handleResetFilters = () => {
    setFilters({
      dateFrom: filterOptions.defaultDateFrom,
      dateTo: filterOptions.maxDate,
      machine: "ALL",
      shift: "ALL",
      breakdownType: "ALL",
      attendedBy: "ALL",
      search: "",
    });
    setTablePage(1);
  };

  // ECharts Configurations
  const trendChartOption = useMemo(() => {
    const periods = analytics.trend.map((t) => t.period);
    const downtimeMins = analytics.trend.map((t) => t.downtimeMinutes);
    const incidents = analytics.trend.map((t) => t.incidents);

    return {
      tooltip: {
        ...tooltipStyle,
        trigger: "axis",
        axisPointer: { type: "cross" },
      },
      legend: {
        data: ["Downtime (Minutes)", "Incident Count"],
        top: 0,
        textStyle: { color: CHART_COLORS.text },
      },
      grid: { ...gridStyle, top: 40, bottom: 35, left: 60, right: 50 },
      xAxis: {
        type: "category",
        data: periods,
        axisLabel: { ...axisLabelStyle, rotate: 30 },
      },
      yAxis: [
        {
          type: "value",
          name: "Minutes",
          axisLabel: axisLabelStyle,
          splitLine: { lineStyle: { color: CHART_COLORS.gridLine } },
        },
        {
          type: "value",
          name: "Incidents",
          axisLabel: axisLabelStyle,
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Downtime (Minutes)",
          type: "bar",
          data: downtimeMins,
          itemStyle: { color: "#d97706", borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 35,
        },
        {
          name: "Incident Count",
          type: "line",
          yAxisIndex: 1,
          data: incidents,
          smooth: true,
          itemStyle: { color: "#2563eb" },
          lineStyle: { width: 3 },
          symbol: "circle",
          symbolSize: 6,
        },
      ],
    };
  }, [analytics.trend]);

  const paretoChartOption = useMemo(() => {
    const top10 = analytics.machinePareto.slice(0, 10);
    const machines = top10.map((m) => m.machine);
    const downtime = top10.map((m) => m.downtimeMinutes);
    const cumulative = top10.map((m) => m.cumulativePercentage);

    return {
      tooltip: {
        ...tooltipStyle,
        trigger: "axis",
        axisPointer: { type: "cross" },
      },
      legend: {
        data: ["Downtime (mins)", "Cumulative %"],
        top: 0,
        textStyle: { color: CHART_COLORS.text },
      },
      grid: { ...gridStyle, top: 40, bottom: 65, left: 60, right: 50 },
      xAxis: {
        type: "category",
        data: machines,
        axisLabel: {
          ...axisLabelStyle,
          interval: 0,
          rotate: 35,
          formatter: (val: string) => (val.length > 15 ? val.slice(0, 14) + "…" : val),
        },
      },
      yAxis: [
        {
          type: "value",
          name: "Downtime (Mins)",
          axisLabel: axisLabelStyle,
          splitLine: { lineStyle: { color: CHART_COLORS.gridLine } },
        },
        {
          type: "value",
          name: "Cumulative %",
          min: 0,
          max: 100,
          axisLabel: { ...axisLabelStyle, formatter: "{value}%" },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Downtime (mins)",
          type: "bar",
          data: downtime,
          itemStyle: { color: "#ea580c", borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 30,
        },
        {
          name: "Cumulative %",
          type: "line",
          yAxisIndex: 1,
          data: cumulative,
          itemStyle: { color: "#4f46e5" },
          lineStyle: { width: 2.5 },
          symbol: "circle",
          symbolSize: 6,
          markLine: {
            silent: true,
            lineStyle: { color: "#dc2626", type: "dashed" },
            data: [{ yAxis: 80, name: "80% Pareto Threshold" }],
          },
        },
      ],
    };
  }, [analytics.machinePareto]);

  const categoryPieOption = useMemo(() => {
    const pieData = analytics.categoryDistribution.map((c) => ({
      name: c.category,
      value: c.downtimeMinutes,
    }));

    return {
      tooltip: {
        ...tooltipStyle,
        trigger: "item",
        formatter: "{b}: {c} mins ({d}%)",
      },
      legend: {
        bottom: 0,
        textStyle: { color: CHART_COLORS.text, fontSize: 11 },
      },
      series: [
        {
          name: "Breakdown Category",
          type: "pie",
          radius: ["42%", "70%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: "#fff",
            borderWidth: 2,
          },
          label: { show: false },
          emphasis: {
            label: {
              show: true,
              fontSize: 12,
              fontWeight: "bold",
              formatter: "{b}\n{d}%",
            },
          },
          data: pieData,
        },
      ],
    };
  }, [analytics.categoryDistribution]);

  const shiftChartOption = useMemo(() => {
    const shifts = analytics.shiftDistribution.map((s) => s.shift);
    const downtime = analytics.shiftDistribution.map((s) => s.downtimeMinutes);
    const incidents = analytics.shiftDistribution.map((s) => s.incidents);

    return {
      tooltip: { ...tooltipStyle, trigger: "axis" },
      legend: {
        data: ["Downtime (Mins)", "Incidents"],
        top: 0,
        textStyle: { color: CHART_COLORS.text },
      },
      grid: { ...gridStyle, top: 40, bottom: 25, left: 55, right: 25 },
      xAxis: {
        type: "category",
        data: shifts,
        axisLabel: axisLabelStyle,
      },
      yAxis: {
        type: "value",
        axisLabel: axisLabelStyle,
        splitLine: { lineStyle: { color: CHART_COLORS.gridLine } },
      },
      series: [
        {
          name: "Downtime (Mins)",
          type: "bar",
          data: downtime,
          itemStyle: { color: "#0891b2", borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 35,
        },
        {
          name: "Incidents",
          type: "bar",
          data: incidents,
          itemStyle: { color: "#6366f1", borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 35,
        },
      ],
    };
  }, [analytics.shiftDistribution]);

  const technicianChartOption = useMemo(() => {
    const topTechnicians = analytics.technicianPerformance.slice(0, 8);
    const techs = topTechnicians.map((t) => t.technician).reverse();
    const count = topTechnicians.map((t) => t.incidentsAttended).reverse();

    return {
      tooltip: { ...tooltipStyle, trigger: "axis" },
      grid: { ...gridStyle, top: 15, bottom: 20, left: 110, right: 30 },
      xAxis: {
        type: "value",
        axisLabel: axisLabelStyle,
        splitLine: { lineStyle: { color: CHART_COLORS.gridLine } },
      },
      yAxis: {
        type: "category",
        data: techs,
        axisLabel: { ...axisLabelStyle, interval: 0 },
      },
      series: [
        {
          name: "Breakdowns Attended",
          type: "bar",
          data: count,
          itemStyle: { color: "#10b981", borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 20,
        },
      ],
    };
  }, [analytics.technicianPerformance]);

  return (
    <div className="maintenance-container">
      {/* Header Bar */}
      <div className="maintenance-header">
        <div className="maintenance-header__info">
          <h1>
            <span>🔧</span> Maintenance Department — Medchal Plant
          </h1>
          <p>
            Authoritative breakdown register, downtime Pareto analysis, and corrective actions
            tracking from Google Spreadsheet: <code>Medchal breakdown report</code>
          </p>
        </div>

        <div className="maintenance-header__actions">
          {apiResponse?.connectionStatus === "connected" ? (
            <span className="maintenance-badge maintenance-badge--connected">
              <span className="maintenance-badge--indicator" />
              Live Google Sheets (Beakdown)
            </span>
          ) : (
            <span className="maintenance-badge maintenance-badge--offline">
              <span className="maintenance-badge--indicator" />
              {apiResponse?.source === "local-reference"
                ? "Offline (Local Reference Loaded)"
                : "Live Connection Pending Access"}
            </span>
          )}

          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => void loadData(true)}
            disabled={refreshing || loading}
            title="Refresh latest data from Google Sheets"
          >
            {refreshing ? "🔄 Syncing..." : "🔄 Refresh"}
          </button>

          <button
            type="button"
            className="btn btn--primary"
            onClick={handleExportCsv}
            disabled={filteredRecords.length === 0}
            title="Export filtered records as CSV"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* Service Account Permission Banner if sheet is not accessible */}
      {(apiResponse?.error || fetchError) && (
        <div className="maintenance-sa-banner maintenance-sa-banner--warning">
          <div>
            <strong>Google Sheets Access Notice:</strong> {fetchError ?? apiResponse?.error}
            <div style={{ marginTop: "0.25rem", fontSize: "0.8125rem" }}>
              To enable automatic live sync, share the Google Sheet with:{" "}
              <code>
                {apiResponse?.serviceAccount ??
                  "manufacturing-dashboard@patil-manufacturing-dashboard.iam.gserviceaccount.com"}
              </code>{" "}
              as <strong>Viewer</strong>.
            </div>
          </div>
        </div>
      )}

      {/* Filter Control Bar */}
      <div className="maintenance-filterbar">
        <div className="maintenance-filterbar__row">
          <div className="maintenance-filter-group">
            <label>Date From</label>
            <input
              type="date"
              className="maintenance-input"
              value={filters.dateFrom}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, dateFrom: e.target.value }));
                setTablePage(1);
              }}
            />
          </div>

          <div className="maintenance-filter-group">
            <label>Date To</label>
            <input
              type="date"
              className="maintenance-input"
              value={filters.dateTo}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, dateTo: e.target.value }));
                setTablePage(1);
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.375rem", alignSelf: "flex-end" }}>
            <button
              type="button"
              className="btn btn--ghost"
              style={{ fontSize: "0.75rem", padding: "0.4rem 0.65rem" }}
              onClick={handleCurrentYear}
            >
              Current Year 2026
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              style={{ fontSize: "0.75rem", padding: "0.4rem 0.65rem" }}
              onClick={handleAllTime}
            >
              All Time
            </button>
          </div>

          <div className="maintenance-filter-group">
            <label>Machine</label>
            <select
              className="maintenance-select"
              value={filters.machine}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, machine: e.target.value }));
                setTablePage(1);
              }}
            >
              <option value="ALL">All Machines ({filterOptions.machines.length})</option>
              {filterOptions.machines.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="maintenance-filter-group">
            <label>Shift</label>
            <select
              className="maintenance-select"
              value={filters.shift}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, shift: e.target.value }));
                setTablePage(1);
              }}
            >
              <option value="ALL">All Shifts</option>
              {filterOptions.shifts.map((s) => (
                <option key={s} value={s}>
                  Shift {s}
                </option>
              ))}
            </select>
          </div>

          <div className="maintenance-filter-group">
            <label>Breakdown Category</label>
            <select
              className="maintenance-select"
              value={filters.breakdownType}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, breakdownType: e.target.value }));
                setTablePage(1);
              }}
            >
              <option value="ALL">All Categories</option>
              {filterOptions.breakdownTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="maintenance-filter-group">
            <label>Attended By</label>
            <select
              className="maintenance-select"
              value={filters.attendedBy}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, attendedBy: e.target.value }));
                setTablePage(1);
              }}
            >
              <option value="ALL">All Technicians</option>
              {filterOptions.technicians.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="maintenance-filter-group maintenance-filter-group--search">
            <label>Search Description / Root Cause / Spares</label>
            <input
              type="text"
              className="maintenance-input"
              placeholder="Filter by keyword (e.g. sensor, bearing, motor)..."
              value={filters.search}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, search: e.target.value }));
                setTablePage(1);
              }}
            />
          </div>

          <div style={{ alignSelf: "flex-end" }}>
            <button
              type="button"
              className="btn btn--secondary"
              style={{ padding: "0.5rem 0.75rem", fontSize: "0.8125rem" }}
              onClick={handleResetFilters}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="maintenance-kpi-grid">
        <motion.div
          className="maintenance-kpi-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="maintenance-kpi-card__top">
            <span className="maintenance-kpi-card__title">Total Lost Time</span>
            <span className="maintenance-kpi-card__icon">⏱️</span>
          </div>
          <div className="maintenance-kpi-card__value">
            {analytics.kpis.totalDowntimeHours.toLocaleString()} hrs
          </div>
          <div className="maintenance-kpi-card__subtitle">
            <span>{analytics.kpis.totalDowntimeMinutes.toLocaleString()} minutes recorded</span>
          </div>
        </motion.div>

        <motion.div
          className="maintenance-kpi-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <div className="maintenance-kpi-card__top">
            <span className="maintenance-kpi-card__title">Total Breakdown Incidents</span>
            <span className="maintenance-kpi-card__icon">⚠️</span>
          </div>
          <div className="maintenance-kpi-card__value">
            {analytics.kpis.totalIncidents.toLocaleString()}
          </div>
          <div className="maintenance-kpi-card__subtitle">
            <span>Filtered breakdown events</span>
          </div>
        </motion.div>

        <motion.div
          className="maintenance-kpi-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="maintenance-kpi-card__top">
            <span className="maintenance-kpi-card__title">MTTR (Mean Time to Repair)</span>
            <span className="maintenance-kpi-card__icon">🛠️</span>
          </div>
          <div className="maintenance-kpi-card__value">
            {analytics.kpis.mttrMinutes} min
          </div>
          <div className="maintenance-kpi-card__subtitle">
            <span>~{analytics.kpis.mttrHours} hrs per breakdown</span>
          </div>
        </motion.div>

        <motion.div
          className="maintenance-kpi-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <div className="maintenance-kpi-card__top">
            <span className="maintenance-kpi-card__title">Top Problematic Machine</span>
            <span className="maintenance-kpi-card__icon">🏭</span>
          </div>
          <div
            className="maintenance-kpi-card__value"
            style={{ fontSize: "1.25rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            title={analytics.kpis.topMachineName ?? "None"}
          >
            {analytics.kpis.topMachineName ?? "None"}
          </div>
          <div className="maintenance-kpi-card__subtitle">
            <span>{analytics.kpis.topMachineDowntime.toLocaleString()} mins lost time</span>
          </div>
        </motion.div>

        <motion.div
          className="maintenance-kpi-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="maintenance-kpi-card__top">
            <span className="maintenance-kpi-card__title">Primary Failure Type</span>
            <span className="maintenance-kpi-card__icon">⚡</span>
          </div>
          <div className="maintenance-kpi-card__value">
            {analytics.kpis.topCategory ?? "N/A"}
          </div>
          <div className="maintenance-kpi-card__subtitle">
            <span>{analytics.kpis.topCategoryPercent}% of total downtime</span>
          </div>
        </motion.div>
      </div>

      {/* Analytics Charts Grid */}
      <div className="maintenance-charts-grid">
        {/* Trend Chart (Span 8) */}
        <div className="maintenance-chart-card maintenance-chart-card--span-8">
          <div className="maintenance-chart-card__header">
            <div>
              <h3 className="maintenance-chart-card__title">
                Downtime Movement & Incident Frequency
              </h3>
              <span className="maintenance-chart-card__subtitle">
                Monthly breakdown hours and event counts across selected date span
              </span>
            </div>
          </div>
          <ReactECharts
            option={trendChartOption}
            style={{ height: "300px", width: "100%" }}
            notMerge={true}
          />
        </div>

        {/* Category Split (Span 4) */}
        <div className="maintenance-chart-card maintenance-chart-card--span-4">
          <div className="maintenance-chart-card__header">
            <div>
              <h3 className="maintenance-chart-card__title">Failure Category Split</h3>
              <span className="maintenance-chart-card__subtitle">
                Mechanical vs Electrical distribution
              </span>
            </div>
          </div>
          <ReactECharts
            option={categoryPieOption}
            style={{ height: "300px", width: "100%" }}
            notMerge={true}
          />
        </div>

        {/* Machine Downtime Pareto (Span 8) */}
        <div className="maintenance-chart-card maintenance-chart-card--span-8">
          <div className="maintenance-chart-card__header">
            <div>
              <h3 className="maintenance-chart-card__title">
                Machine Downtime Pareto (80/20 Rule)
              </h3>
              <span className="maintenance-chart-card__subtitle">
                Top 10 machines contributing to cumulative plant breakdown minutes
              </span>
            </div>
          </div>
          <ReactECharts
            option={paretoChartOption}
            style={{ height: "320px", width: "100%" }}
            notMerge={true}
          />
        </div>

        {/* Shift & Technician Breakdown (Span 4) */}
        <div className="maintenance-chart-card maintenance-chart-card--span-4">
          <div className="maintenance-chart-card__header">
            <div>
              <h3 className="maintenance-chart-card__title">Shift Distribution</h3>
              <span className="maintenance-chart-card__subtitle">
                Downtime and incident volume by shift
              </span>
            </div>
          </div>
          <ReactECharts
            option={shiftChartOption}
            style={{ height: "320px", width: "100%" }}
            notMerge={true}
          />
        </div>

        {/* Technician Workload (Span 12) */}
        <div className="maintenance-chart-card maintenance-chart-card--span-12">
          <div className="maintenance-chart-card__header">
            <div>
              <h3 className="maintenance-chart-card__title">Technician Resolution Distribution</h3>
              <span className="maintenance-chart-card__subtitle">
                Total breakdown events attended and resolved by technician
              </span>
            </div>
          </div>
          <ReactECharts
            option={technicianChartOption}
            style={{ height: "240px", width: "100%" }}
            notMerge={true}
          />
        </div>
      </div>

      {/* Breakdown Incident Register Table */}
      <div className="maintenance-table-wrapper">
        <div className="maintenance-table-header">
          <div>
            <h2>Breakdown Incident Register ({filteredRecords.length} records)</h2>
            <span style={{ fontSize: "0.8125rem", color: "#64748b" }}>
              Click any row to inspect complete root cause, containment, corrective actions & spare parts
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn--secondary"
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
              disabled={tablePage <= 1}
              onClick={() => setTablePage((p) => Math.max(1, p - 1))}
            >
              ◀ Prev
            </button>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Page {tablePage} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
              disabled={tablePage >= totalPages}
              onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
            >
              Next ▶
            </button>
          </div>
        </div>

        <div className="maintenance-table-scroll">
          <table className="maintenance-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Shift</th>
                <th>Machine</th>
                <th>Category</th>
                <th>Downtime</th>
                <th>Attended By</th>
                <th>Problem Description</th>
                <th>Corrective Action Taken</th>
                <th>Spare Parts</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                    No breakdown incidents match the current filters.
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((r) => (
                  <tr
                    key={r.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedRecord(r)}
                  >
                    <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>{r.date ?? "—"}</td>
                    <td style={{ fontWeight: 600 }}>{r.shift ?? "—"}</td>
                    <td style={{ fontWeight: 600, color: "#1e293b" }}>{r.machine}</td>
                    <td>
                      <span
                        className={`maintenance-type-pill ${
                          r.breakdownType === "Mechanical"
                            ? "maintenance-type-pill--mechanical"
                            : r.breakdownType === "Electrical"
                            ? "maintenance-type-pill--electrical"
                            : "maintenance-type-pill--other"
                        }`}
                      >
                        {r.breakdownType}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: "#ea580c", whiteSpace: "nowrap" }}>
                      {r.downtimeMinutes} min
                    </td>
                    <td>{r.attendedBy ?? "—"}</td>
                    <td style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.breakdownDescription ?? ""}>
                      {r.breakdownDescription ?? "—"}
                    </td>
                    <td style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.correctiveAction ?? ""}>
                      {r.correctiveAction ?? "—"}
                    </td>
                    <td style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.spareParts ?? ""}>
                      {r.spareParts ?? "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRecord(r);
                        }}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incident Detail Modal */}
      <AnimatePresence>
        {selectedRecord && (
          <div
            className="maintenance-modal-backdrop"
            onClick={() => setSelectedRecord(null)}
          >
            <motion.div
              className="maintenance-modal"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <div className="maintenance-modal__header">
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.25rem", color: "#0f172a" }}>
                    Breakdown Detail: {selectedRecord.machine}
                  </h3>
                  <span style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                    Record {selectedRecord.id} • Date: {selectedRecord.date} • Shift: {selectedRecord.shift}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setSelectedRecord(null)}
                >
                  ✕
                </button>
              </div>

              <div className="maintenance-modal__body">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                  <div className="maintenance-modal__field">
                    <span className="maintenance-modal__field-label">Downtime</span>
                    <div className="maintenance-modal__field-value" style={{ fontWeight: 700, color: "#ea580c" }}>
                      {selectedRecord.downtimeMinutes} minutes
                    </div>
                  </div>
                  <div className="maintenance-modal__field">
                    <span className="maintenance-modal__field-label">Category</span>
                    <div className="maintenance-modal__field-value">
                      {selectedRecord.breakdownType}
                    </div>
                  </div>
                  <div className="maintenance-modal__field">
                    <span className="maintenance-modal__field-label">Attended By</span>
                    <div className="maintenance-modal__field-value">
                      {selectedRecord.attendedBy ?? "Not specified"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                  <div className="maintenance-modal__field">
                    <span className="maintenance-modal__field-label">Plant</span>
                    <div className="maintenance-modal__field-value">
                      {selectedRecord.plantCode ?? "MED- Forge"}
                    </div>
                  </div>
                  <div className="maintenance-modal__field">
                    <span className="maintenance-modal__field-label">Machine Owner</span>
                    <div className="maintenance-modal__field-value">
                      {selectedRecord.machineOwner ?? "—"}
                    </div>
                  </div>
                  <div className="maintenance-modal__field">
                    <span className="maintenance-modal__field-label">Spare Parts</span>
                    <div className="maintenance-modal__field-value">
                      {selectedRecord.spareParts ?? "None listed"}
                    </div>
                  </div>
                </div>

                <div className="maintenance-modal__field">
                  <span className="maintenance-modal__field-label">Breakdown Description</span>
                  <div className="maintenance-modal__field-value">
                    {selectedRecord.breakdownDescription ?? "No description recorded"}
                  </div>
                </div>

                <div className="maintenance-modal__field">
                  <span className="maintenance-modal__field-label">Root Cause Analysis</span>
                  <div className="maintenance-modal__field-value">
                    {selectedRecord.rootCause ?? "No root cause documented"}
                  </div>
                </div>

                <div className="maintenance-modal__field">
                  <span className="maintenance-modal__field-label">Immediate Counter Measure</span>
                  <div className="maintenance-modal__field-value">
                    {selectedRecord.counterMeasure ?? "No containment measure documented"}
                  </div>
                </div>

                <div className="maintenance-modal__field">
                  <span className="maintenance-modal__field-label">Corrective Action Taken</span>
                  <div className="maintenance-modal__field-value">
                    {selectedRecord.correctiveAction ?? "No corrective action documented"}
                  </div>
                </div>

                {selectedRecord.remarks && (
                  <div className="maintenance-modal__field">
                    <span className="maintenance-modal__field-label">Remarks</span>
                    <div className="maintenance-modal__field-value">
                      {selectedRecord.remarks}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
