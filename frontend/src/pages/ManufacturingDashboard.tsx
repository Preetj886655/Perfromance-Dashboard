import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";

import { calculateDowntimeAnalysis } from "../data/calculations/downtimeAnalysis";
import {
  calculateMachineOee,
  calculateOeeSummary,
  calculateShiftOee,
} from "../data/calculations/oeeCalculator";
import { calculateProductionKpis } from "../data/calculations/productionKpis";
import { calculateQualityAnalysis } from "../data/calculations/qualityAnalysis";
import { calculateManufacturingAnalysis } from "../data/calculations/manufacturingAnalysis";
import type { DprRecord, DprValidationIssue } from "../data/normalization/normalizeDprData";
import {
  applyFilters,
  ALL_LINES,
  ALL_MACHINES,
  ALL_MATERIALS,
  ALL_SHIFTS,
  ALL_STAGES,
  buildFilterOptions,
  datasetDateBounds,
  defaultFilters,
  type FilterOptions,
  type FilterState,
} from "../data/filters/dashboardFilterEngine";
import {
  type PeriodPreset,
  resolvePeriodWindow,
} from "../data/calculations/periodEngine";
import { useAuth } from "../auth/useAuth";
import { analyzeBusinessDataQuality } from "../data/analysis/businessDataQuality";
import { parseDprWorkbookFile, type ParsedDprWorkbook } from "../data/parser/excelParser";
import { saveDashboardDataset, type DashboardDatasetState } from "../data/state/dashboardDataStore";
import { fetchManufacturingDataset, fetchManufacturingStatus, normalizeGoogleSheetRecords } from "../services/manufacturingApi";
import type { ManufacturingApiResponse, ManufacturingConnectionStatus } from "../services/manufacturingApi";
import { useManufacturingLivePolling } from "../hooks/useManufacturingLivePolling";
import { LiveStatusIndicator, DataSourceIndicator, AutoRefreshToggle } from "../components/LiveStatusIndicator";
import type { LiveSyncStatus } from "../hooks/useManufacturingLivePolling";
import { DashboardCarousel, type CarouselSlide } from "../components/dashboard/DashboardCarousel";
import {
  ExecutiveOverviewSlide,
  ProductionSlide,
  ProductionLossSlide,
  DowntimeCommandCenterSlide,
  DowntimeRootCauseSlide,
  QualitySlide,
  LinePerformanceSlide,
  ShiftPerformanceSlide,
  MaterialPartSlide,
  StageAnalyticsSlide,
  WorkCenterAnalyticsSlide,
  MachineAnalyticsSlide,
  RelationshipSlide,
  ManagementInsightsSlide,
  TargetGapAnalysisSlide,
  useDashboardAnalytics,
} from "../components/dashboard/slides";
import { ImportedDatasetSection } from "../components/dashboard/ImportedDatasetSection";
import { LiveGoogleSheetsSection } from "../components/dashboard/LiveGoogleSheetsSection";
import { motion, AnimatePresence } from "motion/react";
import { springMicro } from "../styles/motionVariants";
import { DashboardLoadingSkeleton } from "../components/common/DashboardSkeleton";

// ===== DATA SOURCE TYPES =====
// Strict separation: imported vs live Google Sheets

/**
 * Filter state for the dashboard is owned by the shared filter engine
 * (`data/filters/dashboardFilterEngine.ts`) which contains the Stage filter.
 * Re-exported here for backward-compatible imports across components.
 */
export type { FilterState } from "../data/filters/dashboardFilterEngine";

/** Live Google Sheets dataset state */
type LiveDatasetState = {
  records: DprRecord[];
  spreadsheetId: string;
  worksheet: string;
  recordCount: number;
  lastUpdated: string | null;
  connectionStatus: "connected" | "offline" | "error";
  error: string | null;
};

/** Imported dataset state (Excel/CSV/Google Sheets via Data Import ONLY) */
type ImportedDatasetState = {
  records: DprRecord[];
  fileName: string;
  sheetName: string;
  recordCount: number;
  uploadedAt: string;
  sourceType: "excel" | "csv" | "google-sheets";
  /** Present when the source is a Google Sheet connected through Data Import. */
  spreadsheetId?: string;
  worksheet?: string;
  lastUpdated?: string | null;
};

type PageRoute =
  | "dashboard"
  | "production"
  | "oee"
  | "quality"
  | "ppc"
  | "scm"
  | "store"
  | "maintenance"
  | "npd"
  | "hr"
  | "safety"
  | "logistics"
  | "5s"
  | "kpi"
  | "data-import"
  | "google-forms"
  | "actions"
  | "settings";

type KpiPoint = {
  label: string;
  value: string;
  target: string;
  variance: string;
  trend: "up" | "down" | "flat";
  status: "Good" | "Warning" | "Critical";
  sparkline: number[];
};

const navItems = [
  { key: "dashboard", label: "Overview", icon: "◉" },
  { key: "production", label: "Production", icon: "▣" },
  { key: "quality", label: "Quality", icon: "◌" },
  { key: "ppc", label: "PPC", icon: "▤" },
  { key: "scm", label: "SCM", icon: "↔" },
  { key: "store", label: "Store", icon: "▦" },
  { key: "maintenance", label: "Maintenance", icon: "⚙" },
  { key: "npd", label: "NPD / Design", icon: "✦" },
  { key: "hr", label: "HR", icon: "◍" },
  { key: "safety", label: "Safety", icon: "▲" },
  { key: "logistics", label: "Logistics / Dispatch", icon: "⇄" },
  { key: "5s", label: "5S", icon: "▭" },
  { key: "kpi", label: "KPI & Reports", icon: "▁" },
  { key: "data-import", label: "Data Import", icon: "⇪" },
  { key: "google-forms", label: "Google Forms", icon: "▣" },
  { key: "actions", label: "Pending Actions", icon: "⚑" },
  { key: "settings", label: "Settings", icon: "⚙" },
] as const;

const routeToTitle: Record<PageRoute, string> = {
  dashboard: "Overall Manufacturing Dashboard",
  production: "Production Dashboard",
  oee: "OEE Dashboard",
  quality: "Quality Dashboard",
  ppc: "PPC Dashboard",
  scm: "SCM Dashboard",
  store: "Store Dashboard",
  maintenance: "Maintenance Dashboard",
  npd: "NPD / Design Dashboard",
  hr: "HR Dashboard",
  safety: "Safety Dashboard",
  logistics: "Dispatch Dashboard",
  "5s": "5S Assessment",
  kpi: "KPI & Reports",
  "data-import": "Data Import Center",
  "google-forms": "Department Data Collection",
  actions: "Top 10 Pending Actions",
  settings: "Dashboard Settings",
};

// defaultFilters now lives in the shared filter engine (Stage-aware).

type DashboardSlideKey = "executive" | "production" | "quality" | "downtime" | "machine-line" | "oee" | "insights" | "data-quality" | "data-import";

const dashboardSlides: Array<{ key: DashboardSlideKey; page: PageRoute; title: string; subtitle: string }> = [
  { key: "executive", page: "dashboard", title: "Executive Overview", subtitle: "Plant-wide performance at a glance" },
  { key: "production", page: "production", title: "Production Performance", subtitle: "Actual output, target attainment, and daily movement" },
  { key: "quality", page: "quality", title: "Quality Analysis", subtitle: "Rejection patterns across the selected data" },
  { key: "downtime", page: "production", title: "Downtime Analysis", subtitle: "Where recorded lost time is concentrated" },
  { key: "machine-line", page: "production", title: "Machine / Line Performance", subtitle: "Compare the dimensions present in the uploaded data" },
  { key: "oee", page: "oee", title: "OEE", subtitle: "Availability, performance, quality, and OEE when supported" },
  { key: "insights", page: "dashboard", title: "Analytics & Insights", subtitle: "Evidence-based observations from the active filters" },
  { key: "data-quality", page: "data-import", title: "Data Quality", subtitle: "Coverage, completeness, and source readiness" },
  { key: "data-import", page: "data-import", title: "Data Import", subtitle: "Upload manufacturing data to generate analytics" },
];

const mockRecords: DprRecord[] = [
  {
    index: 0,
    serialNo: 1,
    date: "2026-08-14",
    shift: "A",
    lineName: "ERC",
    machineName: "Autocopying-2",
    workCenter: "Autocopy",
    material: "MK-III",
    partName: "MK3",
    partNo: "PD001",
    productionHour: 12,
    targetQtyPerHour: 50,
    actualProductionQty: 562,
    plannedDownTimeMinutes: 70,
    availableTimeMinutes: 650,
    totalIdleTimeMinutes: 42,
    totalRunTimeMinutes: 608,
    availabilityRatio: 0.934,
    actualQtyPerHour: 46.8,
    performanceRatio: 0.936,
    machineUtilizationRatio: 0.844,
    totalRejectionQty: 8,
    rejectionPpm: 14235,
    qualityRatio: 0.986,
    sourceOeeRatio: 0.863,
    idleReason: "Material Shortage",
    rejectionReason: "Surface Defect",
    idleReasonBreakup: [{ reason: "Material Shortage", minutes: 42 }],
    rejectionReasonBreakup: [{ reason: "Surface Defect", qty: 8 }],
    customColumns: {},
    raw: {},
  },
  {
    index: 1,
    serialNo: 2,
    date: "2026-08-14",
    shift: "B",
    lineName: "SKL",
    machineName: "SBL",
    workCenter: "Unmapped",
    material: undefined,
    partName: "SKL12",
    partNo: "PD006",
    productionHour: 12,
    targetQtyPerHour: 650,
    actualProductionQty: 6180,
    plannedDownTimeMinutes: 60,
    availableTimeMinutes: 660,
    totalIdleTimeMinutes: 28,
    totalRunTimeMinutes: 632,
    availabilityRatio: 0.956,
    actualQtyPerHour: 515,
    performanceRatio: 0.792,
    machineUtilizationRatio: 0.858,
    totalRejectionQty: 62,
    rejectionPpm: 10032,
    qualityRatio: 0.99,
    sourceOeeRatio: 0.749,
    idleReason: "Tool Wear",
    rejectionReason: "Dimension Drift",
    idleReasonBreakup: [{ reason: "Tool Wear", minutes: 28 }],
    rejectionReasonBreakup: [{ reason: "Dimension Drift", qty: 62 }],
    customColumns: {},
    raw: {},
  },
  {
    index: 2,
    serialNo: 3,
    date: "2026-08-15",
    shift: "C",
    lineName: "Injection Moulding",
    machineName: "W-CNC 1",
    workCenter: "Unmapped",
    material: "MK-V",
    partName: "MK5",
    partNo: "PD005",
    productionHour: 12,
    targetQtyPerHour: 210,
    actualProductionQty: 1798,
    plannedDownTimeMinutes: 72,
    availableTimeMinutes: 648,
    totalIdleTimeMinutes: 64,
    totalRunTimeMinutes: 584,
    availabilityRatio: 0.901,
    actualQtyPerHour: 149.8,
    performanceRatio: 0.713,
    machineUtilizationRatio: 0.811,
    totalRejectionQty: 31,
    rejectionPpm: 17241,
    qualityRatio: 0.983,
    sourceOeeRatio: 0.631,
    idleReason: "Machine BD",
    rejectionReason: "Flow Mark",
    idleReasonBreakup: [{ reason: "Machine BD", minutes: 64 }],
    rejectionReasonBreakup: [{ reason: "Flow Mark", qty: 31 }],
    customColumns: {},
    raw: {},
  },
];

const pendingActions = [
  { priority: "Critical", action: "Line 2 downtime root cause review", department: "Maintenance", owner: "S. Pawar", due: "16 Aug", status: "Open", days: 4 },
  { priority: "High", action: "Material shortage for coil stock", department: "SCM", owner: "K. Iyer", due: "18 Aug", status: "In Progress", days: 6 },
  { priority: "Medium", action: "CAPA closure for rejection lot Q-118", department: "Quality", owner: "P. Shah", due: "20 Aug", status: "Pending", days: 8 },
  { priority: "High", action: "PPC reschedule for N+2 dispatch", department: "PPC", owner: "D. Nair", due: "17 Aug", status: "Open", days: 3 },
  { priority: "Low", action: "5S audit follow-up on raw store", department: "5S", owner: "R. Menon", due: "22 Aug", status: "Scheduled", days: 9 },
];

function resolveHashRoute(): PageRoute {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  const map: Record<string, PageRoute> = {
    "#/dashboard": "dashboard",
    "#/production": "production",
    "#/oee": "oee",
    "#/quality": "quality",
    "#/ppc": "ppc",
    "#/scm": "scm",
    "#/store": "store",
    "#/maintenance": "maintenance",
    "#/npd": "npd",
    "#/hr": "hr",
    "#/safety": "safety",
    "#/logistics": "logistics",
    "#/5s": "5s",
    "#/kpi": "kpi",
    "#/data-import": "data-import",
    "#/data-quality": "data-import",
    "#/google-forms": "google-forms",
    "#/actions": "actions",
    "#/settings": "settings",
  };
  return map[hash] ?? "dashboard";
}

function getTrendPath(values: number[]) {
  const safeValues = values.length > 0 ? values : [0];
  const max = Math.max(...safeValues);
  const min = Math.min(...safeValues);
  const range = Math.max(max - min, 1);
  return safeValues
    .map((value, index) => {
      const x = (index / Math.max(safeValues.length - 1, 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function toMetricText(value: number | null, suffix = "%", digits = 2): string {
  if (value === null || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(digits)}${suffix}`;
}

function toPlainNumber(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return "N/A";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function percentileStatus(value: number | null, good = 95, warning = 85): "Good" | "Warning" | "Critical" {
  if (value === null) return "Warning";
  if (value >= good) return "Good";
  if (value >= warning) return "Warning";
  return "Critical";
}

function varianceTrend(value: number | null, baseline: number): { text: string; trend: "up" | "down" | "flat" } {
  if (value === null) return { text: "N/A", trend: "flat" };
  const delta = value - baseline;
  if (Math.abs(delta) < 0.05) return { text: "0.0", trend: "flat" };
  return {
    text: `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`,
    trend: delta > 0 ? "up" : "down",
  };
}

function StatusBadge({ status }: { status: "Good" | "Warning" | "Critical" }) {
  const map = {
    Good: "status-pill status-pill--good",
    Warning: "status-pill status-pill--warning",
    Critical: "status-pill status-pill--critical",
  } as const;
  return <span className={map[status]}>{status}</span>;
}

function KpiCard({ item }: { item: KpiPoint }) {
  const icon = item.trend === "up" ? "▲" : item.trend === "down" ? "▼" : "•";
  const trendClass = item.trend === "up" ? "trend trend--up" : item.trend === "down" ? "trend trend--down" : "trend";
  return (
    <article className="kpi-card">
      <div className="kpi-card__topline">
        <h3>{item.label}</h3>
        <StatusBadge status={item.status} />
      </div>
      <div className="kpi-card__value-row">
        <div>
          <p className="kpi-card__value">{item.value}</p>
          <div className="kpi-card__meta">
            <span>{item.target}</span>
            <span className={trendClass}>{icon} {item.variance}</span>
          </div>
        </div>
      </div>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="sparkline" aria-label={`${item.label} trend`}>
        <path d={getTrendPath(item.sparkline)} />
      </svg>
    </article>
  );
}

function GaugeCard({ label, value, target, colorClass }: { label: string; value: number | null; target: number; colorClass: string }) {
  const safe = value ?? 0;
  const percent = Math.min(Math.max((safe / target) * 100, 0), 100);
  return (
    <div className="gauge-card">
      <div className={`gauge ${colorClass}`} style={{ background: `conic-gradient(var(--meter) 0 ${percent}%, rgba(148,163,184,0.20) ${percent}% 100%)` }}>
        <div className="gauge__center">
          <strong>{value === null ? "N/A" : `${safe.toFixed(2)}%`}</strong>
        </div>
      </div>
      <div className="gauge-card__meta">
        <h3>{label}</h3>
        <span>Target {target}%</span>
      </div>
    </div>
  );
}

// FilterOptions lives in the shared filter engine (Stage-aware).

function FilterBar({
  filters,
  onChange,
  onApply,
  onReset,
  onLatestData,
  autoDateMode,
  options,
  loadingLive = false,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  onApply: () => void;
  onReset: () => void;
  /** Return to automatic latest-available-source-date mode. */
  onLatestData: () => void;
  /** True while the Date Range is synchronized with the latest source date. */
  autoDateMode: boolean;
  options: FilterOptions;
  /** True while the live Google Sheets dataset is still being fetched. */
  loadingLive?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const makeOptions = (allLabel: string, values: string[]) => {
    if (!values.length) {
      return [allLabel, "Not available in dataset"];
    }
    return [allLabel, ...values];
  };

  const dateRangeInvalid = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);

  // Stage options are line-aware, computed from ACTUAL dataset records: only
  // stages genuinely present in the selected line's data are offered (all
  // dataset stages when Line = All Lines). The list is never hard-coded.
  const lineAwareStages =
    filters.line === ALL_LINES ? options.stages : options.stagesByLine[filters.line] ?? [];

  const selectFields = [
    { key: "line", label: "Line", options: makeOptions(ALL_LINES, options.lines) },
    { key: "shift", label: "Shift", options: makeOptions(ALL_SHIFTS, options.shifts) },
    { key: "stage", label: "Stage", options: makeOptions(ALL_STAGES, lineAwareStages) },
    { key: "machine", label: "Machine", options: makeOptions(ALL_MACHINES, options.machines) },
    { key: "material", label: "Material", options: makeOptions(ALL_MATERIALS, options.materials) },
  ] as const;

  const update = (key: keyof FilterState, value: string) => {
    if (key === "line") {
      // Dependent filters: if the newly selected line does not contain the
      // currently selected stage, reset Stage to a safe state ("All Stages").
      const validStages =
        value === ALL_LINES ? options.stages : options.stagesByLine[value] ?? [];
      const stage =
        filters.stage !== ALL_STAGES && !validStages.includes(filters.stage)
          ? ALL_STAGES
          : filters.stage;
      onChange({ ...filters, line: value, stage });
      return;
    }
    onChange({ ...filters, [key]: value });
  };

  const periodOptions: Array<{ value: PeriodPreset; label: string }> = [
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
  ];

  const periodLabel = periodOptions.find((p) => p.value === filters.period)?.label ?? "Monthly";

  const dateHint = loadingLive
    ? "Loading live Google Sheets data…"
    : dateRangeInvalid
    ? "Start date must be on or before end date."
    : filters.dateFrom && filters.dateTo
      ? `Active window: ${formatDisplayDate(filters.dateFrom)} → ${formatDisplayDate(filters.dateTo)} (${periodLabel} grouping)`
      : options.minDate && options.maxDate
        ? `Available: ${formatDisplayDate(options.minDate)} → ${formatDisplayDate(options.maxDate)} (${periodLabel} grouping)`
        : "Dates come from the loaded dataset.";

  return (
    <section className={`panel filter-panel ${expanded ? "filter-panel--expanded" : ""}`}>
      <div className="filter-panel__header">
        <div>
          <p className="eyebrow">Filter the live manufacturing dashboard</p>
          <h2>
            <span className="filter-panel__icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </span>
            Operations Control
          </h2>
        </div>
        <button type="button" className="filter-panel__toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls="operations-filters">
          {expanded ? "Collapse Filters" : "Show Filters"}<span aria-hidden="true">{expanded ? " ⌃" : " ⌄"}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!expanded ? (
          <motion.div
            key="summary"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="filter-panel__summary"
          >
            <span><strong>Date Range:</strong> {filters.dateFrom ? formatDisplayDate(filters.dateFrom) : "All"} → {filters.dateTo ? formatDisplayDate(filters.dateTo) : "All"}{autoDateMode ? " (auto)" : ""}</span>
            <span><strong>Period:</strong> {periodLabel}</span>
            <span><strong>Line:</strong> {filters.line}</span>
            <span><strong>Shift:</strong> {filters.shift}</span>
            <span><strong>Stage:</strong> {filters.stage}</span>
            <span><strong>Machine:</strong> {filters.machine}</span>
            <span><strong>Material:</strong> {filters.material}</span>
          </motion.div>
        ) : (
          <motion.div
            key="body"
            id="operations-filters"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="filter-panel__body"
          >
            <div className="filter-grid">
              <label className="field field--date-range">
                <span>Date Range</span>
                <div className="date-range">
                  <input
                    type="date"
                    value={filters.dateFrom}
                    min={options.minDate || undefined}
                    max={filters.dateTo || options.maxDate || undefined}
                    onChange={(event) => {
                      onChange({ ...filters, dateFrom: event.target.value });
                    }}
                    aria-label="Start date"
                  />
                  <span className="date-range__separator" aria-hidden="true">→</span>
                  <input
                    type="date"
                    value={filters.dateTo}
                    min={filters.dateFrom || options.minDate || undefined}
                    max={options.maxDate || undefined}
                    onChange={(event) => {
                      onChange({ ...filters, dateTo: event.target.value });
                    }}
                    aria-label="End date"
                  />
                  {(filters.dateFrom || filters.dateTo) ? (
                    <button
                      type="button"
                      className="date-range__clear"
                      title="Clear date range"
                      aria-label="Clear date range"
                      onClick={() => {
                        onChange({ ...filters, dateFrom: "", dateTo: "" });
                      }}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
                <small className={`field__hint ${dateRangeInvalid ? "field__hint--error" : ""}`}>{dateHint}</small>
              </label>

              <label className="field">
                <span>Period</span>
                <select
                  value={filters.period}
                  onChange={(event) => onChange({ ...filters, period: event.target.value as PeriodPreset })}
                  aria-label="Filter by period"
                >
                  {periodOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              {selectFields.map((field) => {
                const unavailable = field.options.length === 2 && field.options[1] === "Not available in dataset";
                return (
                  <label key={field.key} className="field">
                    <span>{field.label}</span>
                    <select
                      value={filters[field.key]}
                      onChange={(event) => update(field.key, event.target.value)}
                      disabled={unavailable}
                    >
                      {field.options.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>

            <div className="filter-actions">
              <motion.button
                type="button"
                className="btn btn--primary"
                onClick={onApply}
                disabled={dateRangeInvalid}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={springMicro}
              >
                Apply Filters
              </motion.button>
              <motion.button
                type="button"
                className="btn btn--ghost"
                onClick={onLatestData}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={springMicro}
                title="Synchronize the Date Range with the latest date available in the live Google Sheet"
              >
                {autoDateMode ? "● Latest Available Data" : "Latest Available Data"}
              </motion.button>
              <motion.button
                type="button"
                className="btn btn--ghost"
                onClick={onReset}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={springMicro}
              >
                Reset
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function SimplePage({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="section-header compact">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </div>
  );
}

// buildFilterOptions and applyFilters live in the shared filter engine
// (data/filters/dashboardFilterEngine.ts) — Stage-aware and data-driven.

function formatDisplayDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildDailySeries(records: DprRecord[]) {
  const bucket = new Map<string, { actual: number; target: number; oeeRatios: number[]; rejection: number; availability: number[]; performance: number[]; quality: number[] }>();

  records.forEach((row) => {
    const key = row.date ?? "Unknown";
    const current = bucket.get(key) ?? { actual: 0, target: 0, oeeRatios: [], rejection: 0, availability: [], performance: [], quality: [] };

    current.actual += row.actualProductionQty ?? 0;
    if (typeof row.targetQtyPerHour === "number") {
      const factor = typeof row.productionHour === "number"
        ? row.productionHour
        : typeof row.availableTimeMinutes === "number"
          ? row.availableTimeMinutes / 60
          : 1;
      current.target += row.targetQtyPerHour * factor;
    }
    current.rejection += row.totalRejectionQty ?? 0;

    const availability = (typeof row.availableTimeMinutes === "number" && typeof row.shiftTimeMinutes === "number" && row.shiftTimeMinutes > 0)
      ? row.availableTimeMinutes / row.shiftTimeMinutes
      : row.availabilityRatio;
    const performance = row.performanceRatio ?? (
      typeof row.actualQtyPerHour === "number" && typeof row.targetQtyPerHour === "number" && row.targetQtyPerHour > 0
        ? row.actualQtyPerHour / row.targetQtyPerHour
        : undefined
    );
    const quality = row.qualityRatio ?? (
      typeof row.actualProductionQty === "number" && row.actualProductionQty > 0 && typeof row.totalRejectionQty === "number"
        ? (row.actualProductionQty - row.totalRejectionQty) / row.actualProductionQty
        : undefined
    );

    if (typeof availability === "number" && typeof performance === "number" && typeof quality === "number") {
      current.oeeRatios.push(availability * performance * quality);
    }
    if (typeof availability === "number") current.availability.push(availability);
    if (typeof performance === "number") current.performance.push(performance);
    if (typeof quality === "number") current.quality.push(quality);

    bucket.set(key, current);
  });

  const entries = [...bucket.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({
      date,
      actual: value.actual,
      target: value.target,
      plan: value.target,
      oee: average(value.oeeRatios),
      availability: average(value.availability),
      performance: average(value.performance),
      quality: average(value.quality),
      rejectionRate: value.actual > 0 ? value.rejection / value.actual : null,
    }));

  return entries;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sumValue, item) => sumValue + item, 0) / values.length;
}

function buildInsights(args: {
  productionAchievement: number | null;
  rejectionRate: number | null;
  downtimeTotal: number;
  downtimeTopReason: string | null;
  oee: number | null;
}): { ai: string[]; good: string[]; attention: string[] } {
  const ai: string[] = [];
  const good: string[] = [];
  const attention: string[] = [];

  if (args.productionAchievement !== null && args.productionAchievement < 100) {
    ai.push("Production is below target in the selected scope.");
    attention.push("Production achievement below 100% target");
  } else if (args.productionAchievement !== null) {
    ai.push("Production is currently meeting or exceeding target.");
    good.push("Production achievement is on target");
  }

  if (args.downtimeTotal > 0) {
    ai.push(`Total downtime is ${toPlainNumber(args.downtimeTotal, 0)} minutes.`);
    if (args.downtimeTopReason) {
      ai.push(`Top downtime driver is ${args.downtimeTopReason}.`);
      attention.push(`Downtime concentration in ${args.downtimeTopReason}`);
    }
  }

  if (args.rejectionRate !== null) {
    if (args.rejectionRate > 2) {
      ai.push("Rejection rate is above 2% and requires immediate review.");
      attention.push("Rejection rate above threshold");
    } else {
      good.push("Rejection rate is within expected control range");
    }
  }

  if (args.oee !== null) {
    if (args.oee >= 80) {
      good.push("OEE is within healthy operating range");
    } else {
      attention.push("OEE below expected benchmark");
    }
  }

  if (!good.length) {
    good.push("No strong positive signals detected from current filters");
  }
  if (!attention.length) {
    attention.push("No critical issues detected for current filter combination");
  }

  return { ai, good, attention };
}

function formatDateForDisplay(date: string | undefined): string {
  if (!date) return "N/A";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function UploadValidation({ issues }: { issues: DprValidationIssue[] }) {
  if (!issues.length) {
    return <p className="field__hint">✓ Validation passed</p>;
  }

  return (
    <div>
      {issues.map((issue) => (
        <p key={`${issue.level}-${issue.message}`} className={`field__hint ${issue.level === "error" ? "field__hint--error" : ""}`}>
          {issue.level === "error" ? "✕" : "⚠"} {issue.message}
        </p>
      ))}
    </div>
  );
}

function AnalyticsEmptyState({ title, message }: { title: string; message: string }) {
  return <article className="analytics-empty-state"><strong>{title}</strong><span>{message}</span></article>;
}

const LIVE_FILTER_STORAGE_KEY = "patil_dashboard_live_filters";
const AUTO_DATE_MODE_STORAGE_KEY = "patil_dashboard_auto_date_mode";

/** Restore the automatic latest-source-date mode flag (defaults to ON). */
function getInitialAutoDateMode(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return sessionStorage.getItem(AUTO_DATE_MODE_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function getInitialLiveFilters(): FilterState {
  if (typeof window === "undefined") return defaultFilters;
  try {
    const saved = sessionStorage.getItem(LIVE_FILTER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && "period" in parsed) {
        return {
          ...defaultFilters,
          ...parsed,
        };
      }
    }
  } catch {
    // ignore
  }
  return defaultFilters;
}

function mapRouteToSlideId(route: PageRoute): string {
  switch (route) {
    case "dashboard":
      return "executive";
    case "production":
      return "production";
    case "quality":
      return "quality";
    case "maintenance":
      return "downtime";
    case "kpi":
      return "insights";
    case "oee":
      return "executive";
    default:
      return "executive";
  }
}

const STUB_ROUTES: PageRoute[] = [
  "ppc",
  "scm",
  "store",
  "npd",
  "hr",
  "safety",
  "logistics",
  "5s",
  "google-forms",
  "actions",
  "settings",
];

export function ManufacturingDashboard() {
  const { logout } = useAuth();
  const [activePage, setActivePage] = useState<PageRoute>(resolveHashRoute());
  const [liveActiveSlideId, setLiveActiveSlideId] = useState<string>(() => mapRouteToSlideId(resolveHashRoute()));
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [activeSlide, setActiveSlide] = useState<DashboardSlideKey | null>(() => {
    const hash = typeof window === "undefined" ? "" : window.location.hash;
    if (hash === "#/data-quality") return "data-quality";
    const page = resolveHashRoute();
    return page === "data-import" ? "data-import" : dashboardSlides.find((slide) => slide.page === page)?.key ?? null;
  });
  // ===== STRICT DATA SOURCE SEPARATION =====
  // Imported dataset (Excel/CSV) and Live Google Sheets are COMPLETELY SEPARATE.
  // They never mix, never overwrite each other, and never share state.

  // --- Imported Dataset State (Excel/CSV only) ---
  const [uploadedDataset, setUploadedDataset] = useState<ImportedDatasetState | null>(null);
  const [uploadedDraftFilters, setUploadedDraftFilters] = useState<FilterState>(defaultFilters);
  const [uploadedAppliedFilters, setUploadedAppliedFilters] = useState<FilterState>(defaultFilters);

  // --- Live Google Sheets State (Google Sheets only) ---
  // Filters are loaded from and synced to sessionStorage to persist across view navigation
  const [liveDataset, setLiveDataset] = useState<LiveDatasetState | null>(null);
  /**
   * True while the live Google Sheets dataset is being fetched and is not yet
   * available. While true, the dashboard must NOT present the legacy mock/demo
   * records as if they were live data (data-source honesty requirement): the
   * Operations Control shows a "Loading live Google Sheets data…" state
   * instead of mock-derived date bounds.
   */
  const [liveLoading, setLiveLoading] = useState<boolean>(true);
  /**
   * Reason the initial live connection could not be established, set ONLY when
   * every bootstrap attempt has failed (after retries). While set (and not
   * loading), the dashboard shows an explicit error state with a Retry button
   * instead of a bare "No Live Google Sheets Connection" dead end.
   */
  const [liveLoadError, setLiveLoadError] = useState<string | null>(null);
  const [liveDraftFilters, setLiveDraftFilters] = useState<FilterState>(getInitialLiveFilters);
  const [liveAppliedFilters, setLiveAppliedFilters] = useState<FilterState>(getInitialLiveFilters);

  /**
   * AUTOMATIC vs CUSTOM date range mode.
   *
   * automatic (default): the Date Range end is always synchronized with
   * latestSourceDate = MAX(valid dates in the live backend dataset). When the
   * Google Sheet grows, the dashboard follows automatically — forever dynamic,
   * never hard-coded, and NEVER taken from the system clock.
   *
   * custom: the user explicitly picked a Date Range; it is preserved across
   * refreshes until they click "Latest Available Data" (or Reset).
   */
  const [autoDateMode, setAutoDateMode] = useState<boolean>(getInitialAutoDateMode);

  useEffect(() => {
    try {
      sessionStorage.setItem(AUTO_DATE_MODE_STORAGE_KEY, autoDateMode ? "true" : "false");
    } catch {
      // ignore
    }
  }, [autoDateMode]);

  // Sync applied live filters to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(LIVE_FILTER_STORAGE_KEY, JSON.stringify(liveAppliedFilters));
    } catch {
      // ignore
    }
  }, [liveAppliedFilters]);

  // Synchronize browser URL hash changes with active page and slide
  useEffect(() => {
    const onHashChange = () => {
      const route = resolveHashRoute();
      setActivePage(route);
      setLiveActiveSlideId(mapRouteToSlideId(route));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Legacy dataset state — used only for backward compatibility with file upload
  const [dataset, setDataset] = useState<DashboardDatasetState | null>(null);
  const [, setDatasetPersisted] = useState(true);

  // --- File Upload State ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<"excel" | "csv">("excel");
  const [dataSourceMode, setDataSourceMode] = useState<"excel-csv" | "google-sheets">("excel-csv");
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>("");
  const [googleSheetsLoading, setGoogleSheetsLoading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [previewResult, setPreviewResult] = useState<ParsedDprWorkbook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Legacy googleSheetsStatus — kept for status display only
  const [googleSheetsStatus, setGoogleSheetsStatus] = useState<{ connected: boolean; source: string; worksheet: string; recordCount: number; lastUpdated: string | null; error: string | null } | null>(null);

  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const pollingInterval = 60000; // 60 seconds default
  const [currentTime, setCurrentTime] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [liveStatus, setLiveStatus] = useState<LiveSyncStatus>({
    state: 'idle',
    connected: false,
    lastSync: null,
    lastUpdate: null,
    recordCount: 0,
    recordsChanged: 0,
    error: null,
    updateAvailable: false,
  });
  const [currentSpreadsheetId, setCurrentSpreadsheetId] = useState<string>('');

  /**
   * Guard so only the LATEST bootstrap run may apply state. React StrictMode
   * (dev) mounts effects twice, and a user can hit "Retry Connection" while an
   * earlier run is still awaiting a response — without this guard a stale
   * response could overwrite a newer one (race condition).
   */
  const bootstrapRunRef = useRef(0);

  const bootstrapLiveConnection = useCallback(async () => {
    const runId = bootstrapRunRef.current + 1;
    bootstrapRunRef.current = runId;
    const isLatestRun = () => bootstrapRunRef.current === runId;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    // Backoff between attempts: a momentarily unavailable backend (still
    // starting, network blip, proxy hiccup) must NOT become a permanent
    // "No Live Google Sheets Connection" dead end.
    const retryDelays = [1500, 3000, 6000];

    setLiveLoading(true);
    setLiveLoadError(null);

    // --- STEP 1: backend Google Sheets status (with retry) ---
    let status: ManufacturingConnectionStatus | null = null;
    let lastError = "Unable to reach the backend service.";
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        status = await fetchManufacturingStatus();
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Status request failed.";
        if (attempt < retryDelays.length) await wait(retryDelays[attempt]);
      }
    }
    if (!isLatestRun()) return;
    if (!status) {
      setLiveLoadError(lastError);
      setLiveLoading(false);
      return;
    }

    if (!(status.spreadsheetId && status.connectionStatus === "connected")) {
      setLiveLoadError(
        status.error || "The backend reports Google Sheets is not connected.",
      );
      setLiveLoading(false);
      return;
    }

    // Setting the spreadsheet id also enables the manual Refresh control and
    // the (optional) polling hook, and triggers the dataset load below.
    setCurrentSpreadsheetId(status.spreadsheetId);
  }, []);

  // Fetch backend Google Sheets configuration on mount to enable live polling
  // and auto-load the LIVE dataset so the dashboard shows live data immediately.
  // IMPORTANT: This ONLY updates liveDataset — never touches uploadedDataset.
  useEffect(() => {
    void bootstrapLiveConnection();
  }, [bootstrapLiveConnection]);

  // Fetch (or re-fetch) the live Google Sheets dataset.
  // STRICT SEPARATION: Only updates liveDataset — never touches uploadedDataset.
  // Retries transient failures; the INITIAL load (initial=true) surfaces a
  // final failure through the explicit error state instead of dying silently.
  const reloadLiveDataset = useCallback(async (spreadsheetId: string, options?: { initial?: boolean }) => {
    if (!spreadsheetId) return;
    const initial = options?.initial ?? false;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const retryDelays = [1500, 3000, 6000];
    let data: ManufacturingApiResponse | null = null;
    let lastError = "Unable to load the live dataset.";

    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        data = await fetchManufacturingDataset(spreadsheetId, "Sheet1");
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Dataset request failed.";
        if (attempt < retryDelays.length) await wait(retryDelays[attempt]);
      }
    }

    if (data && data.connectionStatus === "connected" && data.data.length > 0) {
      const records = normalizeGoogleSheetRecords(data.data);
      // STRICT SEPARATION: Only update liveDataset, never uploadedDataset.
      setLiveDataset({
        records,
        spreadsheetId,
        worksheet: data.worksheet || "Sheet1",
        recordCount: records.length,
        lastUpdated: data.lastUpdated,
        connectionStatus: "connected",
        error: null,
      });
      // Also update legacy status for display
      setGoogleSheetsStatus({
        connected: true,
        source: "google-sheets",
        worksheet: data.worksheet || "Sheet1",
        recordCount: records.length,
        lastUpdated: data.lastUpdated,
        error: null,
      });
      if (initial) {
        setLiveLoadError(null);
        setLiveLoading(false);
      }
      return;
    }

    // Final failure (after retries).
    if (initial) {
      // No previous dataset to keep showing: surface the explicit error state.
      setLiveLoadError(data?.error || lastError);
      setLiveLoading(false);
    } else {
      // Background refresh with an existing dataset: keep showing the data
      // but flag the connection state (never silently fake LIVE).
      setLiveDataset((prev) => (prev ? { ...prev, connectionStatus: "error" as const, error: lastError } : prev));
    }
  }, []);

  // Fetch Google Sheets data when currentSpreadsheetId is set. The initial
  // bootstrap path owns the loading/error state until the dataset arrives.
  useEffect(() => {
    if (!currentSpreadsheetId) return;
    void reloadLiveDataset(currentSpreadsheetId, { initial: true });
  }, [currentSpreadsheetId, reloadLiveDataset]);

  useEffect(() => {
    const sync = () => {
      const page = resolveHashRoute();
      setActivePage(page);
      const hash = typeof window === "undefined" ? "" : window.location.hash;
      const nextSlide =
        hash === "#/data-quality"
          ? "data-quality"
          : page === "data-import"
            ? "data-import"
            : dashboardSlides.find((slide) => slide.page === page)?.key ?? null;
      setActiveSlide((current) => {
        // goToSlide sets the hash of the target slide's page, which fires this
        // sync. When the current slide already belongs to that page (e.g.
        // Downtime on the Production page), keep it so dot/keyboard navigation
        // to secondary slides is not overridden by the page's first slide.
        const currentSlide = dashboardSlides.find((slide) => slide.key === current);
        if (currentSlide && currentSlide.page === page && hash !== "#/data-quality") {
          return current;
        }
        return nextSlide;
      });
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // Set up live polling when Google Sheets is connected and auto-refresh is enabled
  const { refresh: refreshData } = useManufacturingLivePolling({
    spreadsheetId: currentSpreadsheetId,
    worksheet: "Sheet1",
    pollingInterval,
    enabled: autoRefreshEnabled && currentSpreadsheetId.length > 0,
    onDataUpdate: (response) => {
      // When data changes (or a manual refresh completes), update BOTH the
      // live dashboard dataset (which renders the analytics) and the legacy
      // dataset. Fresh live API data always replaces stale state — persisted
      // data can never override a successful live refresh.
      if (response.connectionStatus === "connected" && response.data && response.data.length > 0) {
        const records = normalizeGoogleSheetRecords(response.data);
        setLiveDataset({
          records,
          spreadsheetId: response.spreadsheetId || currentSpreadsheetId,
          worksheet: response.worksheet || "Sheet1",
          recordCount: records.length,
          lastUpdated: response.lastUpdated,
          connectionStatus: "connected",
          error: null,
        });
        setGoogleSheetsStatus({
          connected: true,
          source: "google-sheets",
          worksheet: response.worksheet || "Sheet1",
          recordCount: records.length,
          lastUpdated: response.lastUpdated,
          error: null,
        });
      }
      // Legacy dataset (backward compatibility with existing render functions)
      if (response.data && response.data.length > 0) {
        const records = normalizeGoogleSheetRecords(response.data);
        const updatedPayload: DashboardDatasetState = {
          fileName: `Google Sheets (${currentSpreadsheetId})`,
          sheetName: response.worksheet || "Sheet1",
          uploadedAt: response.lastUpdated ? new Date(response.lastUpdated).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
          recordCount: response.recordCount,
          records,
        };
        saveDashboardDataset(updatedPayload);
        setDataset(updatedPayload);
      }
    },
    onStatusChange: (newStatus) => {
      setLiveStatus(newStatus);
    },
  });

  // ===== STRICT DATA SOURCE SEPARATION =====
  // Records are computed separately for each source — never mixed.

  // Imported records (Excel/CSV only)
  const importedRecords = useMemo(() => uploadedDataset?.records ?? [], [uploadedDataset]);

  // Live Google Sheets records (Google Sheets only)
  const liveRecords = useMemo(() => liveDataset?.records ?? [], [liveDataset]);

  // Legacy records — used for backward compatibility with existing render functions
  const records = useMemo(() => (dataset?.records?.length ? dataset.records : mockRecords), [dataset]);

  // Legacy filter options and filtered records
  const filterOptions = useMemo(() => buildFilterOptions(records), [records]);
  const filteredRecords = useMemo(() => applyFilters(records, liveAppliedFilters), [records, liveAppliedFilters]);

  // Filter options for each source
  const importedFilterOptions = useMemo(() => buildFilterOptions(importedRecords), [importedRecords]);
  const liveFilterOptions = useMemo(() => buildFilterOptions(liveRecords), [liveRecords]);
  /**
   * Deliberately EMPTY filter options (no dates, no stages). Used while the
   * live Google Sheets dataset is still loading so Operations Control never
   * presents the legacy mock records' date bounds as if they were live data.
   */
  const emptyFilterOptions = useMemo(() => buildFilterOptions([]), []);

  const displayMaxDate = useMemo(() => {
    const rawMax = liveFilterOptions.maxDate || (liveRecords.length > 0 ? datasetDateBounds(liveRecords).maxDate : "");
    if (rawMax) return formatDisplayDate(rawMax);
    if (uploadedDataset && importedFilterOptions.maxDate) {
      return formatDisplayDate(importedFilterOptions.maxDate);
    }
    return null;
  }, [liveFilterOptions.maxDate, liveRecords, uploadedDataset, importedFilterOptions.maxDate]);

  // Reference to track the previous source max date for intelligent forward-sync
  const previousMaxDateRef = useRef<string>("");
  // Tracks if the user explicitly chose an end date before the latest source date
  const isCustomEndDateRef = useRef<boolean>(false);

  /**
   * Draft filter change handler:
   * - Manual changes to dateFrom (e.g. 2026-01-01) are preserved as custom start dates.
   * - If dateTo is explicitly set to a past date (less than latest source date),
   *   it is flagged as a custom range so future refreshes preserve it.
   * - If dateTo equals or exceeds maxDate (or is cleared), it continues tracking the latest source date.
   */
  const handleLiveDraftChange = useCallback(
    (next: FilterState) => {
      const currentMax = liveFilterOptions.maxDate;
      if (next.dateTo && currentMax && next.dateTo < currentMax) {
        // User explicitly picked a past end date (custom range protection)
        isCustomEndDateRef.current = true;
        setAutoDateMode(false);
      } else if (next.dateTo && currentMax && next.dateTo >= currentMax) {
        // User picked the latest available date
        isCustomEndDateRef.current = false;
      }
      if (next.dateFrom && next.dateFrom !== liveFilterOptions.minDate) {
        setAutoDateMode(false);
      }
      setLiveDraftFilters(next);
    },
    [liveFilterOptions.maxDate, liveFilterOptions.minDate],
  );

  /**
   * "Latest Available Data": return to automatic mode and synchronize the
   * Date Range with the full live source range (min → latest source date).
   */
  const handleLatestAvailableData = useCallback(() => {
    const options = liveDataset ? liveFilterOptions : filterOptions;
    const latestFilters: FilterState = {
      ...liveDraftFilters,
      dateFrom: options.minDate,
      dateTo: options.maxDate,
    };
    isCustomEndDateRef.current = false;
    setAutoDateMode(true);
    setLiveDraftFilters(latestFilters);
    setLiveAppliedFilters(latestFilters);
  }, [liveDataset, liveFilterOptions, filterOptions, liveDraftFilters]);

  /**
   * DYNAMIC DATE RANGE SYNC — the core latest-source-date mechanism.
   *
   * Automatically advances dateTo whenever the Google Sheet grows and exposes a
   * newer maxSourceDate:
   * - If dateTo was tracking the latest date (or equal to previous max date, or
   *   stale 2026-09-03 from sessionStorage, or autoDateMode), advance to new maxDate.
   * - The user's custom dateFrom (e.g. 2026-01-01) is PRESERVED.
   * - If the user deliberately selected a past date range (dateTo < prevMax),
   *   their custom range is PROTECTED and never overwritten.
   * - If dateTo > newMax, it is clamped to newMax.
   */
  useEffect(() => {
    const { minDate, maxDate } = liveFilterOptions;
    if (!maxDate) return;

    const prevMax = previousMaxDateRef.current;
    previousMaxDateRef.current = maxDate;

    setLiveDraftFilters((prev) => {
      let nextDateTo = prev.dateTo;
      let nextDateFrom = prev.dateFrom;

      const shouldAdvanceToMax =
        !prev.dateTo ||
        autoDateMode ||
        !isCustomEndDateRef.current ||
        prev.dateTo === prevMax ||
        prev.dateTo === "2026-09-03" ||
        prev.dateTo > maxDate;

      if (shouldAdvanceToMax) {
        nextDateTo = maxDate;
      }

      if (autoDateMode) {
        nextDateFrom = minDate;
      }

      if (nextDateTo === prev.dateTo && nextDateFrom === prev.dateFrom) {
        return prev;
      }
      return { ...prev, dateFrom: nextDateFrom, dateTo: nextDateTo };
    });

    setLiveAppliedFilters((prev) => {
      let nextDateTo = prev.dateTo;
      let nextDateFrom = prev.dateFrom;

      const shouldAdvanceToMax =
        !prev.dateTo ||
        autoDateMode ||
        !isCustomEndDateRef.current ||
        prev.dateTo === prevMax ||
        prev.dateTo === "2026-09-03" ||
        prev.dateTo > maxDate;

      if (shouldAdvanceToMax) {
        nextDateTo = maxDate;
      }

      if (autoDateMode) {
        nextDateFrom = minDate;
      }

      if (nextDateTo === prev.dateTo && nextDateFrom === prev.dateFrom) {
        return prev;
      }
      return { ...prev, dateFrom: nextDateFrom, dateTo: nextDateTo };
    });
  }, [autoDateMode, liveFilterOptions]);

  // Resolve active period window for live filters
  const livePeriodWindow = useMemo(() => {
    return resolvePeriodWindow(liveAppliedFilters.period, {
      start: liveAppliedFilters.dateFrom,
      end: liveAppliedFilters.dateTo,
    });
  }, [liveAppliedFilters.period, liveAppliedFilters.dateFrom, liveAppliedFilters.dateTo]);

  // Filtered records for each source
  const filteredImportedRecords = useMemo(() => applyFilters(importedRecords, uploadedAppliedFilters), [importedRecords, uploadedAppliedFilters]);
  const filteredLiveRecords = useMemo(() => applyFilters(liveRecords, liveAppliedFilters), [liveRecords, liveAppliedFilters]);

  // Sliced previous period records matching the exact same Line, Shift, Work Center, Material filters
  const filteredPreviousLiveRecords = useMemo(() => {
    if (!livePeriodWindow.previous.start || !livePeriodWindow.previous.end) {
      return [];
    }
    const previousFilters: FilterState = {
      ...liveAppliedFilters,
      dateFrom: livePeriodWindow.previous.start,
      dateTo: livePeriodWindow.previous.end,
    };
    return applyFilters(liveRecords, previousFilters);
  }, [liveRecords, liveAppliedFilters, livePeriodWindow]);

  const productionKpis = useMemo(() => calculateProductionKpis(filteredRecords), [filteredRecords]);
  const oeeSummary = useMemo(() => calculateOeeSummary(filteredRecords), [filteredRecords]);
  const downtime = useMemo(() => calculateDowntimeAnalysis(filteredRecords), [filteredRecords]);
  const quality = useMemo(() => calculateQualityAnalysis(filteredRecords), [filteredRecords]);
  const machineOee = useMemo(() => calculateMachineOee(filteredRecords), [filteredRecords]);
  const shiftOee = useMemo(() => calculateShiftOee(filteredRecords), [filteredRecords]);
  const dailySeries = useMemo(() => buildDailySeries(filteredRecords), [filteredRecords]);
  const importAnalysis = useMemo(
    () => previewResult ? calculateManufacturingAnalysis(previewResult.records) : null,
    [previewResult]
  );
  const filteredAnalysis = useMemo(() => calculateManufacturingAnalysis(filteredRecords), [filteredRecords]);

  // ===== Dashboard analytics carousel =====
  const effectiveLiveForAnalytics = filteredLiveRecords.length > 0 ? filteredLiveRecords : filteredRecords;
  const carouselAnalytics = useDashboardAnalytics(effectiveLiveForAnalytics, filteredPreviousLiveRecords, livePeriodWindow);

  // Data-quality summary for the Insights slide (business-dimension checks).
  const carouselDataQuality = useMemo(() => {
    const q = analyzeBusinessDataQuality(effectiveLiveForAnalytics);
    return {
      totalRecords: q.totalRecords,
      validRecords: Math.max(0, q.totalRecords - q.missingDate - q.invalidDate),
      missingDate: q.missingDate,
      invalidDate: q.invalidDate,
      missingLine: q.missingLine,
      missingShift: q.missingShift,
      missingPart: q.unmappedMaterialPartValues.length,
      missingStage: effectiveLiveForAnalytics.filter((row) => !row.rawStage?.trim()).length,
      missingMachine: effectiveLiveForAnalytics.filter((row) => !row.machineName?.trim() && !row.machineNo?.trim()).length,
      unmappedWorkCenter: q.unmappedWorkCenter,
      duplicateRows: q.duplicateRows,
    };
  }, [filteredLiveRecords]);

  const carouselSlides: CarouselSlide[] = useMemo(
    () => [
      { id: "executive", title: "Executive Overview", icon: "📊", content: <ExecutiveOverviewSlide analytics={carouselAnalytics} activeFilters={liveAppliedFilters} /> },
      { id: "production", title: "Production Performance", icon: "🏭", content: <ProductionSlide analytics={carouselAnalytics} onNavigateSlide={(slideId) => setLiveActiveSlideId(slideId)} /> },
      {
        id: "target-gap",
        title: "Target / Gap Analysis",
        icon: "🎯",
        content: (
          <TargetGapAnalysisSlide
            records={filteredLiveRecords.length > 0 ? filteredLiveRecords : filteredRecords}
            filters={liveAppliedFilters}
            analytics={carouselAnalytics}
            onPeriodChange={(period) => {
              const updated = { ...liveAppliedFilters, period };
              setLiveAppliedFilters(updated);
              setLiveDraftFilters(updated);
            }}
          />
        ),
      },
      { id: "prod-loss", title: "Production Loss", icon: "📉", content: <ProductionLossSlide analytics={carouselAnalytics} /> },
      { id: "downtime", title: "Downtime Command Center", icon: "⏱", content: <DowntimeCommandCenterSlide analytics={carouselAnalytics} /> },
      { id: "downtime-root", title: "Downtime Root Cause", icon: "🔍", content: <DowntimeRootCauseSlide analytics={carouselAnalytics} /> },
      { id: "quality", title: "Quality", icon: "✅", content: <QualitySlide analytics={carouselAnalytics} /> },
      { id: "line-perf", title: "Line Performance", icon: "📈", content: <LinePerformanceSlide analytics={carouselAnalytics} /> },
      { id: "shift-perf", title: "Shift Performance", icon: "🕐", content: <ShiftPerformanceSlide analytics={carouselAnalytics} /> },
      { id: "material", title: "Material / Part", icon: "🧱", content: <MaterialPartSlide analytics={carouselAnalytics} /> },
      { id: "stage", title: "Stage Analytics", icon: "⚙️", content: <StageAnalyticsSlide analytics={carouselAnalytics} /> },
      { id: "workcenter", title: "Work Center Analytics", icon: "🏗️", content: <WorkCenterAnalyticsSlide analytics={carouselAnalytics} /> },
      { id: "machine", title: "Machine Analytics", icon: "🔧", content: <MachineAnalyticsSlide analytics={carouselAnalytics} /> },
      { id: "relationship", title: "Downtime vs Loss", icon: "🔗", content: <RelationshipSlide analytics={carouselAnalytics} /> },
      { id: "insights", title: "Management Insights", icon: "💡", content: <ManagementInsightsSlide analytics={carouselAnalytics} dataQuality={carouselDataQuality} /> },
    ],
    [carouselAnalytics, carouselDataQuality, liveAppliedFilters, filteredLiveRecords]
  );

  const topDowntimeReason = downtime.byReason[0]?.key ?? null;

  const insights = useMemo(
    () => buildInsights({
      productionAchievement: productionKpis.productionAchievementPercent,
      rejectionRate: quality.rejectionRatePercent,
      downtimeTotal: downtime.totalDowntimeMinutes,
      downtimeTopReason: topDowntimeReason,
      oee: oeeSummary.oeePercent,
    }),
    [productionKpis.productionAchievementPercent, quality.rejectionRatePercent, downtime.totalDowntimeMinutes, topDowntimeReason, oeeSummary.oeePercent]
  );

  const headerDateRange = useMemo(() => {
    const dates = filteredRecords
      .map((row) => row.date)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => a.localeCompare(b));
    return {
      start: dates[0],
      end: dates[dates.length - 1],
    };
  }, [filteredRecords]);

  const productionVariance = varianceTrend(productionKpis.productionAchievementPercent, 100);
  const oeeVariance = varianceTrend(oeeSummary.oeePercent, 75);
  const qualityVariance = varianceTrend(oeeSummary.qualityPercent, 98.5);
  const utilizationVariance = varianceTrend(productionKpis.machineUtilizationPercent, 85);
  const rejectionVariance = varianceTrend(quality.rejectionRatePercent, 1.5);

  const overviewKpis: KpiPoint[] = [
    {
      label: "Production Achievement",
      value: toMetricText(productionKpis.productionAchievementPercent),
      target: "Target 100%",
      variance: productionVariance.text,
      trend: productionVariance.trend,
      status: percentileStatus(productionKpis.productionAchievementPercent, 100, 90),
      sparkline: dailySeries.map((item) => (item.target > 0 ? (item.actual / item.target) * 100 : 0)),
    },
    {
      label: "OEE",
      value: toMetricText(oeeSummary.oeePercent),
      target: "Target 75%",
      variance: oeeVariance.text,
      trend: oeeVariance.trend,
      status: percentileStatus(oeeSummary.oeePercent, 80, 70),
      sparkline: dailySeries.map((item) => (item.oee ?? 0) * 100),
    },
    {
      label: "Quality",
      value: toMetricText(oeeSummary.qualityPercent),
      target: "Target 98.5%",
      variance: qualityVariance.text,
      trend: qualityVariance.trend,
      status: percentileStatus(oeeSummary.qualityPercent, 98.5, 97),
      sparkline: dailySeries.map((item) => (item.quality ?? 0) * 100),
    },
    {
      label: "Machine Utilization",
      value: toMetricText(productionKpis.machineUtilizationPercent),
      target: "Target 85%",
      variance: utilizationVariance.text,
      trend: utilizationVariance.trend,
      status: percentileStatus(productionKpis.machineUtilizationPercent, 85, 75),
      sparkline: machineOee.slice(0, 8).map((item) => item.availabilityPercent ?? 0),
    },
    {
      label: "Rejection Rate",
      value: toMetricText(quality.rejectionRatePercent),
      target: "Target 1.5%",
      variance: rejectionVariance.text,
      trend: rejectionVariance.trend,
      status: percentileStatus(quality.rejectionRatePercent === null ? null : 100 - quality.rejectionRatePercent, 98.5, 97),
      sparkline: dailySeries.map((item) => (item.rejectionRate ?? 0) * 100),
    },
    {
      label: "Downtime",
      value: `${toPlainNumber(downtime.totalDowntimeMinutes, 0)} min`,
      target: "Planned + Unplanned",
      variance: "Derived from file",
      trend: "flat",
      status: downtime.totalDowntimeMinutes > 0 ? "Warning" : "Good",
      sparkline: shiftOee.map((item) => item.totalDowntimeMinutes),
    },
  ];

  const handlePreview = async () => {
    if (!selectedFile) {
      setPreviewError("Choose a CSV or Excel file first.");
      return;
    }

    setPreviewError(null);
    setPreviewing(true);

    try {
      const parsed = await parseDprWorkbookFile(selectedFile, selectedSheet || undefined);
      setPreviewResult(parsed);
      setSelectedSheet(parsed.sheetName);
    } catch (error) {
      setPreviewResult(null);
      setPreviewError(error instanceof Error ? error.message : "Unable to process file.");
    } finally {
      setPreviewing(false);
    }
  };

  const selectImportFile = (file: File | null) => {
    if (!file) return;
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const isExcel = /\.(xlsx?|xlsm)$/i.test(file.name);
    if (!isCsv && !isExcel) {
      setPreviewError("Unsupported file type. Choose a CSV, XLS, XLSX, or XLSM file.");
      return;
    }
    setSelectedFile(file);
    setSourceType(isCsv ? "csv" : "excel");
    setPreviewResult(null);
    setSelectedSheet("");
    setPreviewError(null);
  };

  const removeImportFile = () => {
    setSelectedFile(null);
    setPreviewResult(null);
    setSelectedSheet("");
    setPreviewError(null);
  };

  const handleSubmit = () => {
    if (!previewResult) {
      setPreviewError("Preview and validate the file before submitting.");
      return;
    }

    const hardErrors = previewResult.validationIssues.filter((issue) => issue.level === "error");
    if (hardErrors.length > 0) {
      setPreviewError("Fix validation errors before generating dashboard.");
      return;
    }

    setSubmitting(true);

    window.setTimeout(() => {
      const payload: DashboardDatasetState = {
        fileName: previewResult.fileName,
        sheetName: previewResult.sheetName,
        uploadedAt: new Date().toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        recordCount: previewResult.rowCount,
        records: previewResult.records,
        dashboardReference: previewResult.dashboardReference,
      };

      // STRICT SEPARATION: Only update uploadedDataset — never touch liveDataset.
      // The legacy `dataset` state is intentionally NOT updated here so the
      // Overview / live dashboard is never affected by Data Import uploads.
      setUploadedDataset({
        records: previewResult.records,
        fileName: previewResult.fileName,
        sheetName: previewResult.sheetName,
        recordCount: previewResult.rowCount,
        uploadedAt: new Date().toISOString(),
        sourceType: previewResult.sourceType,
      });
      const persisted = saveDashboardDataset(payload);
      setDatasetPersisted(persisted);
      // Reset IMPORTED filters to the newly imported dataset's full available range
      const datedRecords = payload.records
        .map((row) => row.date)
        .filter((value): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)))
        .sort((a, b) => a.localeCompare(b));
      const resetFilters: FilterState = {
        ...defaultFilters,
        dateFrom: datedRecords[0] ?? "",
        dateTo: datedRecords[datedRecords.length - 1] ?? "",
      };
      setUploadedDraftFilters(resetFilters);
      setUploadedAppliedFilters(resetFilters);
      setSubmitting(false);
      // Stay on the Data Import page — the generated dashboard renders below
      // the Data Import Center. Never navigate to Overview from here.
      setActivePage("data-import");
      if (typeof window !== "undefined" && window.location.hash !== "#/data-import") {
        window.location.hash = "#/data-import";
      }
    }, 700);
  };

  // Google Sheets connected THROUGH the Data Import page.
  // STRICT SEPARATION: this creates/updates the IMPORTED dataset context only.
  // It must never overwrite the live Overview dataset (liveDataset /
  // currentSpreadsheetId stay untouched) and never navigates to Overview.
  const handleGoogleSheetsConnect = async () => {
    const rawUrl = googleSheetUrl.trim();
    if (!rawUrl) {
      setGoogleSheetsStatus({
        connected: false,
        source: "google-sheets",
        worksheet: "Sheet1",
        recordCount: 0,
        lastUpdated: null,
        error: "Enter a Google Sheets URL or spreadsheet ID first.",
      });
      return;
    }

    const match = rawUrl.match(/[a-zA-Z0-9-_]{10,}/);
    const spreadsheetId = match ? match[0] : rawUrl;

    setGoogleSheetsLoading(true);
    setPreviewError(null);

    try {
      const response = await fetchManufacturingDataset(spreadsheetId, "Sheet1");
      const connected = response.connectionStatus === "connected" && !response.error;

      setGoogleSheetsStatus({
        connected,
        source: response.source,
        worksheet: response.worksheet || "Sheet1",
        recordCount: response.recordCount,
        lastUpdated: response.lastUpdated,
        error: response.error,
      });

      if (connected && response.data.length > 0) {
        const records = normalizeGoogleSheetRecords(response.data);
        const connectedAt = response.lastUpdated
          ? new Date(response.lastUpdated).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : new Date().toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

        // Imported context ONLY — live dataset is never touched here.
        setUploadedDataset({
          records,
          fileName: spreadsheetId,
          sheetName: response.worksheet || "Sheet1",
          recordCount: records.length,
          uploadedAt: connectedAt,
          sourceType: "google-sheets",
          spreadsheetId,
          worksheet: response.worksheet || "Sheet1",
          lastUpdated: connectedAt,
        });

        // Reset IMPORTED filters to the connected dataset's full date range.
        const datedRecords = records
          .map((row) => row.date)
          .filter((value): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)))
          .sort((a, b) => a.localeCompare(b));
        const resetFilters: FilterState = {
          ...defaultFilters,
          dateFrom: datedRecords[0] ?? "",
          dateTo: datedRecords[datedRecords.length - 1] ?? "",
        };
        setUploadedDraftFilters(resetFilters);
        setUploadedAppliedFilters(resetFilters);
      }
      // Stay on the Data Import page — the generated dashboard renders below.
    } catch (error) {
      setGoogleSheetsStatus({
        connected: false,
        source: "google-sheets",
        worksheet: "Sheet1",
        recordCount: 0,
        lastUpdated: null,
        error: error instanceof Error ? error.message : "Unable to connect to Google Sheets.",
      });
    } finally {
      setGoogleSheetsLoading(false);
    }
  };

  const renderOverview = () => (
    <>
      <div className="top-summary-row">
        <div className="summary-pill"><strong>Date Range</strong> {formatDateForDisplay(headerDateRange.start)} → {formatDateForDisplay(headerDateRange.end)}</div>
        <div className="summary-pill"><strong>Shifts</strong> {filterOptions.shifts.length || "N/A"}</div>
        <div className="summary-pill"><strong>Lines</strong> {filterOptions.lines.length || "N/A"}</div>
        <div className="summary-pill"><strong>Records</strong> {toPlainNumber(filteredRecords.length, 0)}</div>
      </div>

      <div className="kpi-grid">
        {overviewKpis.map((item) => (
          <KpiCard key={item.label} item={item} />
        ))}
      </div>

      <div className="panel-grid two-up">
        <article className="panel panel--chart">
          <div className="section-header compact"><div><p className="eyebrow">Production</p><h2>Plan vs Target vs Actual</h2></div></div>
          <ReactECharts
            option={{
              backgroundColor: "transparent",
              tooltip: { trigger: "axis" },
              legend: { textStyle: { color: "#dfe7f3" } },
              xAxis: { type: "category", data: dailySeries.map((item) => item.date), axisLabel: { color: "#a9bbd3" } },
              yAxis: { type: "value", axisLabel: { color: "#a9bbd3" } },
              series: [
                { name: "Plan", type: "bar", data: dailySeries.map((item) => Number(item.plan.toFixed(2))), itemStyle: { color: "#67e8f9" } },
                { name: "Target", type: "bar", data: dailySeries.map((item) => Number(item.target.toFixed(2))), itemStyle: { color: "#a78bfa" } },
                { name: "Actual", type: "bar", data: dailySeries.map((item) => Number(item.actual.toFixed(2))), itemStyle: { color: "#34d399" } },
              ],
            }}
            style={{ height: 280 }}
          />
        </article>

        <article className="panel panel--chart">
          <div className="section-header compact"><div><p className="eyebrow">OEE</p><h2>Availability / Performance / Quality</h2></div></div>
          <div className="gauge-grid">
            <GaugeCard label="Availability" value={oeeSummary.availabilityPercent} target={90} colorClass="gauge--cyan" />
            <GaugeCard label="Performance" value={oeeSummary.performancePercent} target={90} colorClass="gauge--violet" />
            <GaugeCard label="Quality" value={oeeSummary.qualityPercent} target={100} colorClass="gauge--green" />
            <GaugeCard label="OEE" value={oeeSummary.oeePercent} target={75} colorClass="gauge--amber" />
          </div>
        </article>
      </div>

      <div className="panel-grid two-up">
        <article className="panel panel--chart">
          <div className="section-header compact"><div><p className="eyebrow">Trends</p><h2>Production Trend</h2></div></div>
          <ReactECharts
            option={{
              backgroundColor: "transparent",
              tooltip: { trigger: "axis" },
              xAxis: { type: "category", data: dailySeries.map((item) => item.date), axisLabel: { color: "#a9bbd3" } },
              yAxis: { type: "value", axisLabel: { color: "#a9bbd3" } },
              series: [{ type: "line", smooth: true, data: dailySeries.map((item) => item.actual), lineStyle: { width: 3 }, itemStyle: { color: "#38bdf8" }, areaStyle: { color: "rgba(56,189,248,0.18)" } }],
            }}
            style={{ height: 220 }}
          />
        </article>

        <article className="panel panel--chart">
          <div className="section-header compact"><div><p className="eyebrow">Downtime</p><h2>Downtime Pareto</h2></div></div>
          <ReactECharts
            option={{
              backgroundColor: "transparent",
              tooltip: { trigger: "axis" },
              xAxis: { type: "category", data: downtime.byReason.slice(0, 8).map((item) => item.key), axisLabel: { color: "#a9bbd3", interval: 0, rotate: 20 } },
              yAxis: { type: "value", axisLabel: { color: "#a9bbd3" } },
              series: [{ type: "bar", data: downtime.byReason.slice(0, 8).map((item) => Number(item.minutes.toFixed(2))), itemStyle: { color: "#fbbf24" } }],
            }}
            style={{ height: 220 }}
          />
        </article>
      </div>

      <div className="panel-grid two-up">
        <article className="panel">
          <div className="section-header compact"><div><p className="eyebrow">Insights</p><h2>Manufacturing Insights</h2></div></div>
          <ul className="insight-list">
            {insights.ai.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="section-header compact"><div><p className="eyebrow">Summary</p><h2>Management Summary</h2></div></div>
          <div className="summary-grid">
            <div>
              <h3>What is going well?</h3>
              <ul className="mini-list">
                {insights.good.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>What requires attention?</h3>
              <ul className="mini-list">
                {insights.attention.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </div>

      <article className="panel">
        <div className="section-header compact"><div><p className="eyebrow">Top actions</p><h2>Top 10 Pending Actions</h2></div></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Priority</th><th>Action</th><th>Department</th><th>Owner</th><th>Due Date</th><th>Status</th><th>Days Pending</th></tr>
            </thead>
            <tbody>
              {pendingActions.map((row) => (
                <tr key={row.action}>
                  <td><span className={`priority priority--${row.priority.toLowerCase()}`}>{row.priority}</span></td>
                  <td>{row.action}</td><td>{row.department}</td><td>{row.owner}</td><td>{row.due}</td><td>{row.status}</td><td>{row.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );

  const renderOee = () => (
    <>
      <div className="gauge-grid oversized">
        <GaugeCard label="Availability" value={oeeSummary.availabilityPercent} target={90} colorClass="gauge--cyan" />
        <GaugeCard label="Performance" value={oeeSummary.performancePercent} target={90} colorClass="gauge--violet" />
        <GaugeCard label="Quality" value={oeeSummary.qualityPercent} target={100} colorClass="gauge--green" />
        <GaugeCard label="OEE" value={oeeSummary.oeePercent} target={75} colorClass="gauge--amber" />
      </div>

      {oeeSummary.warnings.length > 0 ? (
        <article className="panel">
          <div className="section-header compact"><div><p className="eyebrow">Validation</p><h2>OEE Source vs Calculated</h2></div></div>
          <p className="field__hint">{oeeSummary.warnings.length} rows differ by more than 2 percentage points; dashboard still uses calculated OEE.</p>
        </article>
      ) : null}
    </>
  );

  const renderQuality = () => (
    <>
      <div className="kpi-grid four-up">
        <KpiCard
          item={{
            label: "Total Rejection",
            value: toPlainNumber(quality.totalRejection, 0),
            target: "Derived from uploaded rows",
            variance: "-",
            trend: "flat",
            status: quality.totalRejection > 0 ? "Warning" : "Good",
            sparkline: quality.byShift.slice(0, 8).map((item) => item.value),
          }}
        />
        <KpiCard
          item={{
            label: "Rejection Rate",
            value: toMetricText(quality.rejectionRatePercent),
            target: "Target 1.5%",
            variance: varianceTrend(quality.rejectionRatePercent, 1.5).text,
            trend: varianceTrend(quality.rejectionRatePercent, 1.5).trend,
            status: percentileStatus(quality.rejectionRatePercent === null ? null : 100 - quality.rejectionRatePercent, 98.5, 97),
            sparkline: dailySeries.map((item) => (item.rejectionRate ?? 0) * 100),
          }}
        />
        <KpiCard
          item={{
            label: "Rejection PPM",
            value: toPlainNumber(quality.rejectionPpmAverage, 0),
            target: "From uploaded data",
            variance: "-",
            trend: "flat",
            status: "Warning",
            sparkline: quality.byMachine.slice(0, 8).map((item) => item.value),
          }}
        />
        <KpiCard
          item={{
            label: "Quality Ratio",
            value: toMetricText(oeeSummary.qualityPercent),
            target: "Target 98.5%",
            variance: varianceTrend(oeeSummary.qualityPercent, 98.5).text,
            trend: varianceTrend(oeeSummary.qualityPercent, 98.5).trend,
            status: percentileStatus(oeeSummary.qualityPercent, 98.5, 97),
            sparkline: dailySeries.map((item) => (item.quality ?? 0) * 100),
          }}
        />
      </div>

      <div className="panel-grid two-up">
        <article className="panel panel--chart">
          <div className="section-header compact"><div><p className="eyebrow">Rejection</p><h2>Rejection Pareto</h2></div></div>
          <ReactECharts
            option={{
              backgroundColor: "transparent",
              tooltip: { trigger: "axis" },
              xAxis: { type: "category", data: quality.byReason.slice(0, 8).map((item) => item.key), axisLabel: { color: "#a9bbd3", interval: 0, rotate: 20 } },
              yAxis: { type: "value", axisLabel: { color: "#a9bbd3" } },
              series: [{ type: "bar", data: quality.byReason.slice(0, 8).map((item) => item.value), itemStyle: { color: "#f87171" } }],
            }}
            style={{ height: 230 }}
          />
        </article>

        <article className="panel panel--chart">
          <div className="section-header compact"><div><p className="eyebrow">Shift</p><h2>Rejection by Shift</h2></div></div>
          <ReactECharts
            option={{
              backgroundColor: "transparent",
              tooltip: { trigger: "axis" },
              xAxis: { type: "category", data: quality.byShift.map((item) => item.key), axisLabel: { color: "#a9bbd3" } },
              yAxis: { type: "value", axisLabel: { color: "#a9bbd3" } },
              series: [{ type: "bar", data: quality.byShift.map((item) => item.value), itemStyle: { color: "#22d3ee" } }],
            }}
            style={{ height: 230 }}
          />
        </article>
      </div>
    </>
  );

  const renderImport = () => {
    const summaryRecords = previewResult?.records ?? [];
    const summaryDates = summaryRecords
      .map((row) => row.date)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => a.localeCompare(b));

    const summaryMachines = [...new Set(summaryRecords.map((row) => row.machineName || row.machineNo).filter(Boolean))].length;
    const summaryLines = [...new Set(summaryRecords.map((row) => row.lineName).filter(Boolean))].length;
    const summaryShifts = [...new Set(summaryRecords.map((row) => row.shift).filter(Boolean))].length;
    const summaryParts = [...new Set(summaryRecords.map((row) => row.partName || row.partNo).filter(Boolean))].length;
    const analysisModeLabel = previewResult?.analysisMode === "oee" ? "OEE Performance" : previewResult?.analysisMode === "manufacturing" ? "Manufacturing Performance" : previewResult?.analysisMode === "production-downtime" ? "Production & Downtime Performance" : previewResult?.analysisMode === "production-quality" ? "Production & Quality Performance" : previewResult?.analysisMode === "downtime" ? "Downtime Analysis" : "Data Overview / Exploratory Analysis";
    const summaryProduction = summaryRecords.reduce((total, row) => total + (row.actualProductionQty ?? 0), 0);
    const summaryTarget = summaryRecords.reduce((total, row) => total + (row.targetProduction ?? 0), 0);
    const summaryDowntime = summaryRecords.reduce((total, row) => total + (row.totalIdleTimeMinutes ?? 0), 0);
    const summaryRejection = summaryRecords.reduce((total, row) => total + (row.totalRejectionQty ?? 0), 0);
    const summaryLoss = summaryRecords.reduce((total, row) => total + (row.productionLoss ?? 0), 0);
    const topReason = [...summaryRecords.reduce((counts, row) => {
      const reason = row.idleReason || "Unspecified";
      counts.set(reason, (counts.get(reason) ?? 0) + (row.totalIdleTimeMinutes ?? 0));
      return counts;
    }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    return (
      <SimplePage title="Data Import Center" subtitle="CSV / Excel Preview">
        {/* Live Status and Data Source Indicators */}
        {currentSpreadsheetId && (
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <DataSourceIndicator source="google-sheets" fileName={currentSpreadsheetId} />
            <LiveStatusIndicator status={liveStatus} onRefresh={refreshData} showDetails={true} />
            <AutoRefreshToggle enabled={autoRefreshEnabled} onChange={setAutoRefreshEnabled} interval={pollingInterval / 1000} />
          </div>
        )}

        <div className="upload-box">
          <div className="import-steps" aria-label="Import workflow">
            <div className={`import-step ${selectedFile ? "import-step--complete" : "import-step--active"}`}><span>01</span><strong>Upload</strong><small>Choose a source file</small></div>
            <div className={`import-step ${previewResult ? "import-step--complete" : selectedFile ? "import-step--active" : ""}`}><span>02</span><strong>Inspect</strong><small>Review detected data</small></div>
            <div className={`import-step ${uploadedDataset?.fileName === selectedFile?.name ? "import-step--complete" : previewResult ? "import-step--active" : ""}`}><span>03</span><strong>Analyse</strong><small>Update dashboard</small></div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">Source Type</span>
              <select value={sourceType} onChange={(event) => setSourceType(event.target.value as "excel" | "csv")}>
                <option value="excel">Excel (.xlsx / .xls)</option>
                <option value="csv">CSV (.csv)</option>
              </select>
            </label>
            <div className="field">
              <span className="field__label">Data Source</span>
              <select value={dataSourceMode} onChange={(event) => setDataSourceMode(event.target.value as "excel-csv" | "google-sheets")}>
                <option value="excel-csv">Local Excel / CSV</option>
                <option value="google-sheets">Google Sheets</option>
              </select>
            </div>
          </div>

          {dataSourceMode === "google-sheets" ? (
            <div className="panel panel--muted" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Google Sheets connection</h3>
              <div className="form-grid">
                <label className="field field--wide">
                  <span className="field__label">Spreadsheet URL or ID</span>
                  <input
                    type="text"
                    value={googleSheetUrl}
                    onChange={(event) => setGoogleSheetUrl(event.target.value)}
                    placeholder="Paste a Google Sheets link or spreadsheet ID"
                  />
                </label>
              </div>
              <div className="button-row">
                <button type="button" className="btn btn--primary" onClick={handleGoogleSheetsConnect} disabled={googleSheetsLoading}>
                  {googleSheetsLoading ? "Connecting..." : "Connect to Google Sheet"}
                </button>
              </div>
              {googleSheetsStatus ? (
                <p className={`field__hint ${googleSheetsStatus.connected ? "field__hint--success" : "field__hint--error"}`}>
                  {googleSheetsStatus.connected
                    ? `Connected to ${googleSheetsStatus.worksheet} • ${googleSheetsStatus.recordCount} records • last sync ${googleSheetsStatus.lastUpdated ?? "n/a"}`
                    : googleSheetsStatus.error ?? "Google Sheets is unavailable."}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="field" style={{ marginTop: 16 }}>
              <span className="field__label">File</span>
              <label className={`upload-box__dropzone ${isDraggingFile ? "upload-box__dropzone--active" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDraggingFile(true); }} onDragLeave={() => setIsDraggingFile(false)} onDrop={(event) => { event.preventDefault(); setIsDraggingFile(false); selectImportFile(event.dataTransfer.files[0] ?? null); }}>
                <strong>{isDraggingFile ? "Drop file to inspect" : "Drop Excel or CSV here"}</strong>
                <span>or choose a file from your device</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.xlsm"
                  onChange={(event) => selectImportFile(event.target.files?.[0] ?? null)}
                />
              </label>
              {selectedFile ? <div className="selected-file"><div><strong>{selectedFile.name}</strong><span>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {sourceType === "csv" ? "CSV" : "Excel workbook"}</span></div><button type="button" className="btn btn--ghost btn--small" onClick={removeImportFile}>Remove</button></div> : null}
            </div>
          )}

          <div className="button-row">
            <button type="button" className="btn btn--primary" onClick={handlePreview} disabled={!selectedFile || previewing}>
              {previewing ? "Inspecting..." : "Preview File"}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSubmit}
              disabled={!previewResult || submitting || previewResult.validationIssues.some((issue) => issue.level === "error")}
            >
              {submitting ? "Analysing manufacturing data..." : "Submit & Generate Dashboard"}
            </button>
          </div>

          {previewError ? <p className="field__hint field__hint--error">{previewError}</p> : null}

          {previewResult ? (
            <>
              {previewResult.dataQuality.sheetNames.length > 1 ? (
                <label className="field field--wide">
                  <span className="field__label">Detected Sheets</span>
                  <select value={previewResult.sheetName} onChange={async (event) => {
                    setSelectedSheet(event.target.value);
                    if (!selectedFile) return;
                    setPreviewing(true);
                    try {
                      setPreviewResult(await parseDprWorkbookFile(selectedFile, event.target.value));
                    } catch (error) {
                      setPreviewError(error instanceof Error ? error.message : "Unable to process selected sheet.");
                    } finally {
                      setPreviewing(false);
                    }
                  }}>
                    {previewResult.dataQuality.sheetNames.map((sheet) => <option key={sheet} value={sheet}>{sheet}{sheet === previewResult.dataQuality.recommendedSheetName ? " (recommended)" : ""}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="upload-summary">
                <div className="summary-block"><span>Dataset</span><strong>{previewResult.sheetName}</strong></div>
                <div className="summary-block"><span>Records</span><strong>{toPlainNumber(previewResult.rowCount, 0)}</strong></div>
                <div className="summary-block"><span>Columns</span><strong>{previewResult.columnCount}</strong></div>
                <div className="summary-block"><span>File</span><strong>{previewResult.fileName}</strong></div>
                <div className="summary-block"><span>Date Range</span><strong>{formatDateForDisplay(summaryDates[0])} → {formatDateForDisplay(summaryDates[summaryDates.length - 1])}</strong></div>
                <div className="summary-block"><span>Machines</span><strong>{summaryMachines}</strong></div>
                <div className="summary-block"><span>Lines</span><strong>{summaryLines || "N/A"}</strong></div>
                <div className="summary-block"><span>Shifts</span><strong>{summaryShifts}</strong></div>
                <div className="summary-block"><span>Parts</span><strong>{summaryParts || "N/A"}</strong></div>
                <div className="summary-block"><span>Header Row</span><strong>{previewResult.headerRowIndex + 1}</strong></div>
              </div>

              <div className="panel panel--success">
                <h3 style={{ marginTop: 0 }}>File analyzed successfully</h3>
                <p className="field__hint"><strong>Analysis mode:</strong> {analysisModeLabel}</p>
                <p className="field__hint">{previewResult.analysisMode === "oee" ? "OEE inputs detected and the existing OEE dashboard remains available." : "OEE metrics are not available in this file. The dashboard is showing alternative performance analysis from detected fields."}</p>
                <div className="upload-summary">
                  <div className="summary-block"><span>Production</span><strong>{toPlainNumber(summaryProduction, 0)}</strong></div>
                  <div className="summary-block"><span>Target Achievement</span><strong>{summaryTarget > 0 ? `${((summaryProduction / summaryTarget) * 100).toFixed(1)}%` : "N/A"}</strong></div>
                  <div className="summary-block"><span>Downtime</span><strong>{toPlainNumber(summaryDowntime, 0)} min</strong></div>
                  <div className="summary-block"><span>Production Loss</span><strong>{toPlainNumber(summaryLoss, 0)}</strong></div>
                  <div className="summary-block"><span>Rejection Rate</span><strong>{summaryProduction > 0 ? `${((summaryRejection / summaryProduction) * 100).toFixed(2)}%` : "N/A"}</strong></div>
                </div>
              </div>

              <div className="panel panel--muted">
                <h3 style={{ marginTop: 0 }}>Available Data</h3>
                <p className="field__hint">{previewResult.availableFields.map((field) => `✓ ${field}`).join("   ") || "No predefined manufacturing fields detected"}</p>
                {previewResult.analysisMode !== "oee" ? <p className="field__hint">⚠ OEE inputs unavailable; this is not an import failure.</p> : null}
                <p className="field__hint">Missing values: {previewResult.dataQuality.missingPercent.toFixed(1)}% · Duplicate rows: {previewResult.dataQuality.duplicateRows}</p>
              </div>

              <div className="panel">
                <h3 style={{ marginTop: 0 }}>Automated Insights</h3>
                <ul className="field__hint">
                  {importAnalysis?.insights.map((insight) => <li key={insight}>{insight}</li>)}
                  {summaryTarget > 0 ? <li>Recorded production is {summaryProduction >= summaryTarget ? "above" : "below"} target by {Math.abs(summaryProduction - summaryTarget).toLocaleString()} units.</li> : null}
                  {summaryProduction > 0 && summaryRejection > 0 ? <li>Rejection rate is {((summaryRejection / summaryProduction) * 100).toFixed(2)}% of recorded production.</li> : null}
                  {!summaryDowntime && !summaryTarget && !summaryRejection ? <li>Insufficient data to determine a manufacturing performance pattern.</li> : null}
                </ul>
              </div>

              {importAnalysis && importAnalysis.daily.length > 0 ? (
                <div className="panel">
                  <h3 style={{ marginTop: 0 }}>Performance Trend</h3>
                  <ReactECharts option={{
                    backgroundColor: "transparent",
                    tooltip: { trigger: "axis" },
                    legend: { textStyle: { color: "#a9bbd3" } },
                    xAxis: { type: "category", data: importAnalysis.daily.map((item) => item.key), axisLabel: { color: "#a9bbd3" } },
                    yAxis: { type: "value", axisLabel: { color: "#a9bbd3" } },
                    series: [
                      { name: "Production", type: "line", data: importAnalysis.daily.map((item) => item.production), itemStyle: { color: "#38bdf8" }, smooth: true },
                      ...(importAnalysis.daily.some((item) => item.target > 0) ? [{ name: "Target", type: "line", data: importAnalysis.daily.map((item) => item.target), itemStyle: { color: "#34d399" }, smooth: true }] : []),
                    ],
                  }} style={{ height: 280 }} />
                </div>
              ) : null}

              {importAnalysis && importAnalysis.productionByMachine.length > 0 ? (
                <div className="panel">
                  <h3 style={{ marginTop: 0 }}>Production by Machine</h3>
                  <ReactECharts option={{
                    backgroundColor: "transparent",
                    tooltip: { trigger: "axis" },
                    grid: { left: 120, right: 20, top: 10, bottom: 30 },
                    xAxis: { type: "value", axisLabel: { color: "#a9bbd3" } },
                    yAxis: { type: "category", data: importAnalysis.productionByMachine.slice(0, 12).map((item) => item.key).reverse(), axisLabel: { color: "#a9bbd3" } },
                    series: [{ type: "bar", data: importAnalysis.productionByMachine.slice(0, 12).map((item) => item.value).reverse(), itemStyle: { color: "#67e8f9" } }],
                  }} style={{ height: 300 }} />
                </div>
              ) : null}

              {topReason.length > 0 && summaryDowntime > 0 ? (
                <div className="panel">
                  <h3 style={{ marginTop: 0 }}>Downtime Analysis</h3>
                  <ReactECharts option={{
                    backgroundColor: "transparent",
                    tooltip: { trigger: "axis" },
                    grid: { left: 140, right: 20, top: 10, bottom: 30 },
                    xAxis: { type: "value", axisLabel: { color: "#a9bbd3" } },
                    yAxis: { type: "category", data: topReason.map(([reason]) => reason).reverse(), axisLabel: { color: "#a9bbd3" } },
                    series: [{ type: "bar", data: topReason.map(([, minutes]) => minutes).reverse(), itemStyle: { color: "#fbbf24" } }],
                  }} style={{ height: 280 }} />
                </div>
              ) : null}

              <div className="panel panel--muted">
                <h3 style={{ marginTop: 0 }}>File Status</h3>
                <p className="field__hint">✓ File loaded</p>
                <UploadValidation issues={previewResult.validationIssues} />
                {submitting ? (
                  <div className="field__hint">
                    <p>✓ Reading file</p>
                    <p>✓ Validating records</p>
                    <p>✓ Mapping columns</p>
                    <p>✓ Calculating production KPIs</p>
                    <p>✓ Calculating OEE</p>
                    <p>✓ Generating charts</p>
                    <p>✓ Updating dashboard</p>
                  </div>
                ) : null}
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {previewResult.headers.slice(0, 10).map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.previewRows.map((row, index) => (
                      <tr key={`preview-${index}`}>
                        {previewResult.headers.slice(0, 10).map((header) => (
                          <td key={`${header}-${index}`}>{String(row[header] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {uploadedDataset && uploadedDataset.fileName === previewResult.fileName ? (
                <div className="panel panel--success">
                  <h3 style={{ marginTop: 0 }}>Dashboard Updated Successfully</h3>
                  <p className="field__hint">File: {previewResult.fileName}</p>
                  <p className="field__hint">Records: {previewResult.rowCount}</p>
                  <p className="field__hint">Data Source: {previewResult.sheetName}</p>
                  <p className="field__hint">Status: Processed</p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </SimplePage>
    );
  };

  const renderAnalyticsSlide = (slide: DashboardSlideKey) => {
    if (slide === "executive") return renderOverview();
    if (slide === "production") return <><div className="kpi-grid four-up">{overviewKpis.slice(0, 4).map((item) => <KpiCard key={item.label} item={item} />)}</div><article className="panel panel--chart"><div className="section-header compact"><div><p className="eyebrow">Output trend</p><h2>Production Trend</h2></div></div><ReactECharts option={{ backgroundColor: "transparent", tooltip: { trigger: "axis" }, xAxis: { type: "category", data: dailySeries.map((item) => item.date), axisLabel: { color: "#a9bbd3" } }, yAxis: { type: "value", axisLabel: { color: "#a9bbd3" } }, series: [{ type: "line", smooth: true, data: dailySeries.map((item) => item.actual), lineStyle: { width: 3, color: "#38bdf8" }, areaStyle: { color: "rgba(56,189,248,0.16)" } }] }} style={{ height: 300 }} /></article></>;
    if (slide === "quality") return renderQuality();
    if (slide === "oee") return renderOee();
    if (slide === "downtime") {
      return downtime.byReason.length ? (
        <div className="analytics-slide-grid">
          <div className="kpi-grid four-up">
            <KpiCard item={{ label: "Total Downtime", value: `${toPlainNumber(downtime.totalDowntimeMinutes, 0)} min`, target: "Recorded downtime", variance: "Derived", trend: "flat", status: "Warning", sparkline: downtime.byReason.map((item) => item.minutes) }} />
            <KpiCard item={{ label: "Downtime Reasons", value: toPlainNumber(downtime.byReason.length, 0), target: "Detected categories", variance: "Derived", trend: "flat", status: "Good", sparkline: downtime.byReason.map((item) => item.minutes) }} />
          </div>
          <article className="panel panel--chart"><div className="section-header compact"><div><p className="eyebrow">Loss time</p><h2>Downtime by Reason</h2></div></div><ReactECharts option={{ backgroundColor: "transparent", tooltip: { trigger: "axis" }, xAxis: { type: "category", data: downtime.byReason.slice(0, 10).map((item) => item.key), axisLabel: { color: "#a9bbd3", interval: 0, rotate: 24 } }, yAxis: { type: "value", axisLabel: { color: "#a9bbd3" } }, series: [{ type: "bar", data: downtime.byReason.slice(0, 10).map((item) => item.minutes), itemStyle: { color: "#fbbf24" } }] }} style={{ height: 340 }} /></article>
        </div>
      ) : <AnalyticsEmptyState title="Downtime analysis unavailable" message="No downtime values were detected in the active dataset or filters." />;
    }
    if (slide === "machine-line") {
      return filteredAnalysis.productionByMachine.length || filteredAnalysis.productionByLine.length ? (
        <div className="panel-grid two-up">
          {filteredAnalysis.productionByMachine.length ? <article className="panel panel--chart"><div className="section-header compact"><div><p className="eyebrow">Dimension comparison</p><h2>Production by Machine</h2></div></div><ReactECharts option={{ backgroundColor: "transparent", tooltip: { trigger: "axis" }, xAxis: { type: "category", data: filteredAnalysis.productionByMachine.slice(0, 10).map((item) => item.key), axisLabel: { color: "#a9bbd3", rotate: 20 } }, yAxis: { type: "value", axisLabel: { color: "#a9bbd3" } }, series: [{ type: "bar", data: filteredAnalysis.productionByMachine.slice(0, 10).map((item) => item.value), itemStyle: { color: "#67e8f9" } }] }} style={{ height: 300 }} /></article> : null}
          {filteredAnalysis.productionByLine.length ? <article className="panel panel--chart"><div className="section-header compact"><div><p className="eyebrow">Dimension comparison</p><h2>Production by Line</h2></div></div><ReactECharts option={{ backgroundColor: "transparent", tooltip: { trigger: "axis" }, xAxis: { type: "category", data: filteredAnalysis.productionByLine.map((item) => item.key), axisLabel: { color: "#a9bbd3", rotate: 20 } }, yAxis: { type: "value", axisLabel: { color: "#a9bbd3" } }, series: [{ type: "bar", data: filteredAnalysis.productionByLine.map((item) => item.value), itemStyle: { color: "#34d399" } }] }} style={{ height: 300 }} /></article> : null}
        </div>
      ) : <AnalyticsEmptyState title="Machine and line analysis unavailable" message="The uploaded data does not include machine or line production values." />;
    }
    if (slide === "insights") return <div className="panel-grid two-up"><article className="panel"><div className="section-header compact"><div><p className="eyebrow">Signal review</p><h2>Automated Insights</h2></div></div><ul className="insight-list">{insights.ai.map((line) => <li key={line}>{line}</li>)}</ul></article><article className="panel"><div className="section-header compact"><div><p className="eyebrow">Uploaded data</p><h2>Analysis Signals</h2></div></div><ul className="mini-list">{filteredAnalysis.insights.map((line) => <li key={line}>{line}</li>)}</ul></article></div>;
    if (slide === "data-import") return renderImport();
    {
      const businessQuality = analyzeBusinessDataQuality(records);
      return (
        <div className="panel-grid two-up">
          {previewResult ? (
            <>
              <article className="panel">
                <div className="section-header compact"><div><p className="eyebrow">Source integrity</p><h2>Data Quality</h2></div></div>
                <div className="summary-grid"><div><span className="field__label">Records</span><strong>{toPlainNumber(previewResult.rowCount, 0)}</strong></div><div><span className="field__label">Columns</span><strong>{previewResult.columnCount}</strong></div><div><span className="field__label">Missing cells</span><strong>{previewResult.dataQuality.missingPercent.toFixed(1)}%</strong></div><div><span className="field__label">Duplicate rows</span><strong>{previewResult.dataQuality.duplicateRows}</strong></div></div>
              </article>
              <article className="panel panel--muted">
                <div className="section-header compact"><div><p className="eyebrow">Detected capabilities</p><h2>Available Data</h2></div></div>
                <p className="field__hint">{previewResult.availableFields.map((field) => `✓ ${field}`).join("   ")}</p>
                <p className="field__hint">{previewResult.analysisMode === "oee" ? "✓ OEE inputs available" : "⚠ OEE unavailable for this dataset"}</p>
              </article>
            </>
          ) : (
            <article className="panel panel--muted">
              <div className="section-header compact"><div><p className="eyebrow">Source integrity</p><h2>Data Quality</h2></div></div>
              <p className="field__hint">Preview a CSV or Excel file to inspect records, fields, and completeness. The checks below cover the active dataset.</p>
            </article>
          )}
          <article className="panel">
            <div className="section-header compact"><div><p className="eyebrow">Business dimensions</p><h2>Line / Shift / Work Center / Material</h2></div></div>
            <div className="summary-grid">
              <div><span className="field__label">Records checked</span><strong>{toPlainNumber(businessQuality.totalRecords, 0)}</strong></div>
              <div><span className="field__label">Missing Date</span><strong>{toPlainNumber(businessQuality.missingDate, 0)}</strong></div>
              <div><span className="field__label">Invalid Date</span><strong>{toPlainNumber(businessQuality.invalidDate, 0)}</strong></div>
              <div><span className="field__label">Missing Line</span><strong>{toPlainNumber(businessQuality.missingLine, 0)}</strong></div>
              <div><span className="field__label">Unknown Line Values</span><strong>{toPlainNumber(businessQuality.unknownLineValues.length, 0)}</strong></div>
              <div><span className="field__label">Missing Shift</span><strong>{toPlainNumber(businessQuality.missingShift, 0)}</strong></div>
              <div><span className="field__label">Unexpected Shift Values</span><strong>{toPlainNumber(businessQuality.unexpectedShiftValues.length, 0)}</strong></div>
              <div><span className="field__label">Unmapped Work Center rows</span><strong>{toPlainNumber(businessQuality.unmappedWorkCenter, 0)}</strong></div>
              <div><span className="field__label">Part values without Material</span><strong>{toPlainNumber(businessQuality.unmappedMaterialPartValues.length, 0)}</strong></div>
              <div><span className="field__label">Duplicate rows</span><strong>{toPlainNumber(businessQuality.duplicateRows, 0)}</strong></div>
            </div>
            {businessQuality.unknownLineValues.length ? (
              <p className="field__hint">Unknown lines requiring review: {businessQuality.unknownLineValues.join(", ")}</p>
            ) : null}
            {businessQuality.unexpectedShiftValues.length ? (
              <p className="field__hint">Unexpected shifts (only Day (A) / Night (B) are recognized): {businessQuality.unexpectedShiftValues.join(", ")}</p>
            ) : null}
            {businessQuality.unmappedWorkCenterMachines.length ? (
              <p className="field__hint">Machines without a confirmed Work Center mapping: {businessQuality.unmappedWorkCenterMachines.slice(0, 12).join(", ")}{businessQuality.unmappedWorkCenterMachines.length > 12 ? "…" : ""}</p>
            ) : null}
            {businessQuality.unmappedMaterialPartValues.length ? (
              <p className="field__hint">Part values without a confirmed Material mapping: {businessQuality.unmappedMaterialPartValues.slice(0, 12).join(", ")}{businessQuality.unmappedMaterialPartValues.length > 12 ? "…" : ""}</p>
            ) : null}
          </article>
        </div>
      );
    }
  };

  return (
    <div className={`factory-layout ${sidebarCollapsed ? "factory-layout--sidebar-collapsed" : ""}`}>
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${sidebarCollapsed ? "sidebar--collapsed" : ""} ${mobileMenuOpen ? "sidebar--mobile-open" : ""}`}>
        <div className="sidebar__brand">
          <img src="/patil-logo.png" alt="Patil Group" className="brand-mark" />
          {!sidebarCollapsed && (
            <div className="sidebar__brand-text">
              <div className="brand-name">Patil Group</div>
              <small>Manufacturing Dashboard</small>
            </div>
          )}
          <button
            type="button"
            className="sidebar__collapse-btn"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Sidebar navigation">
          {navItems.map((item) => (
            <motion.button
              key={item.key}
              type="button"
              className={`nav-item ${activePage === item.key ? "nav-item--active" : ""}`}
              title={item.label}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              transition={springMicro}
              onClick={() => {
                window.location.hash = `#/${item.key}`;
                setActivePage(item.key);
                setActiveSlide(item.key === "data-import" ? "data-import" : dashboardSlides.find((slide) => slide.page === item.key)?.key ?? null);
                setLiveActiveSlideId(mapRouteToSlideId(item.key));
                setMobileMenuOpen(false);
              }}
            >
              <span className="nav-item__icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="nav-item__label">{item.label}</span>}
            </motion.button>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <span className="sidebar__user-avatar">PL</span>
            {!sidebarCollapsed && (
              <div className="sidebar__user-details">
                <span className="sidebar__user-name">Plant Lead</span>
                <span className="sidebar__user-shift">{liveAppliedFilters.shift === "All Shifts" ? "All Shifts" : liveAppliedFilters.shift}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="sidebar__signout-btn"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      <main className="dashboard-shell">
        {/* ===================================================================
            1. EXECUTIVE DASHBOARD HEADER (Top of Dashboard)
            Compact Light SaaS Executive Theme with Patil Branding & Live Status
            =================================================================== */}
        <header className="exec-header">
          <div className="exec-header__left">
            <button
              type="button"
              className="sidebar-mobile-toggle"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
            >
              ☰
            </button>
            <img
              src="/patil-logo.png"
              alt="Patil Group"
              className="exec-header__logo"
            />
            <div className="exec-header__branding">
              <span className="exec-header__eyebrow">PATIL GROUP</span>
              <h1 className="exec-header__title">Manufacturing Performance Dashboard</h1>
              <p className="exec-header__subtitle">
                Live manufacturing performance, production, quality and downtime analytics
              </p>
            </div>
          </div>

          <div className="exec-header__right">
            {/* Compact Live Status Badge */}
            {liveDataset?.connectionStatus === "connected" ? (
              <div className="exec-header__status-badge exec-header__status-badge--live">
                <span className="exec-header__dot exec-header__dot--live" aria-hidden="true" />
                <span>● LIVE GOOGLE SHEETS</span>
              </div>
            ) : liveDataset?.connectionStatus === "error" || liveStatus.state === "error" ? (
              <div className="exec-header__status-badge exec-header__status-badge--error">
                <span className="exec-header__dot exec-header__dot--error" aria-hidden="true" />
                <span>● DATA CONNECTION ISSUE</span>
              </div>
            ) : (
              <div className="exec-header__status-badge exec-header__status-badge--syncing">
                <span className="exec-header__dot exec-header__dot--syncing" aria-hidden="true" />
                <span>↻ SYNCING DATA</span>
              </div>
            )}

            {/* Compact User Profile Pill with Sign Out */}
            <div className="exec-header__user-pill" title="Plant Lead session">
              <span className="exec-user-avatar">PL</span>
              <div className="exec-user-info">
                <strong className="exec-user-name">Plant Lead</strong>
                <span className="exec-user-shift">{liveAppliedFilters.shift === "All Shifts" ? "All Shifts" : liveAppliedFilters.shift}</span>
              </div>
              <button
                type="button"
                className="exec-user-signout"
                onClick={logout}
                title="Sign out"
                aria-label="Sign out"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* ===================================================================
            2. COMPACT LIVE STATUS STRIP (Directly Below Header)
            =================================================================== */}
        {liveDataset && (
          <div className="live-status-strip" role="status" aria-label="Live dataset synchronization status">
            <div className="live-status-strip__item">
              <span className="live-status-strip__dot">●</span>
              <strong className="live-status-strip__live-text">LIVE</strong>
            </div>
            <span className="live-status-strip__sep">•</span>
            <div className="live-status-strip__item">
              <span className="live-status-strip__label">Source:</span>
              <span className="live-status-strip__val">Google Sheets</span>
            </div>
            <span className="live-status-strip__sep">•</span>
            <div className="live-status-strip__item">
              <span className="live-status-strip__label">Records:</span>
              <strong className="live-status-strip__val">{liveDataset.recordCount.toLocaleString()}</strong>
            </div>
            {displayMaxDate && (
              <>
                <span className="live-status-strip__sep">•</span>
                <div className="live-status-strip__item">
                  <span className="live-status-strip__label">Data through:</span>
                  <strong className="live-status-strip__val">{displayMaxDate}</strong>
                </div>
              </>
            )}
            <span className="live-status-strip__sep">•</span>
            <div className="live-status-strip__item">
              <span className="live-status-strip__label">Updated:</span>
              <span className="live-status-strip__val">
                {liveDataset.lastUpdated
                  ? `${new Date(liveDataset.lastUpdated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${new Date(liveDataset.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} IST`
                  : `${currentTime} IST`}
              </span>
            </div>
            <div className="live-status-strip__action">
              <motion.button
                type="button"
                className="live-status-strip__refresh-btn"
                onClick={() => void refreshData()}
                disabled={liveStatus.state === "syncing" || googleSheetsLoading}
                title="Refresh live Google Sheets data"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={springMicro}
              >
                <span className={liveStatus.state === "syncing" || googleSheetsLoading ? "exec-spin" : ""} aria-hidden="true">↻</span>
                <span>{liveStatus.state === "syncing" || googleSheetsLoading ? "Refreshing..." : "Refresh"}</span>
              </motion.button>
            </div>
          </div>
        )}

        {activePage === "data-import" ? (
          <>
            {/* ===== DATA IMPORT PAGE — owned container for imported analysis ===== */}
            {renderImport()}

            {/* ===== GENERATED DATASET ANALYSIS (below Data Import Center) ===== */}
            {uploadedDataset ? (
              <ImportedDatasetSection
                records={filteredImportedRecords}
                fileName={uploadedDataset.fileName}
                recordCount={uploadedDataset.recordCount}
                dateMin={importedFilterOptions.minDate}
                dateMax={importedFilterOptions.maxDate}
                sourceType={uploadedDataset.sourceType}
                worksheet={uploadedDataset.worksheet}
                lastUpdated={uploadedDataset.lastUpdated}
                filters={uploadedDraftFilters}
                onFiltersChange={setUploadedDraftFilters}
                onApplyFilters={() => setUploadedAppliedFilters(uploadedDraftFilters)}
                onResetFilters={() => {
                  const resetFilters: FilterState = {
                    ...defaultFilters,
                    dateFrom: importedFilterOptions.minDate,
                    dateTo: importedFilterOptions.maxDate,
                  };
                  setUploadedDraftFilters(resetFilters);
                  setUploadedAppliedFilters(resetFilters);
                }}
              />
            ) : (
              <div className="imported-empty-state" role="status">
                <div className="imported-empty-state__icon">📊</div>
                <h3>No Dataset Yet</h3>
                <p>Upload or connect a dataset above to generate analysis.</p>
              </div>
            )}
          </>
        ) : STUB_ROUTES.includes(activePage) ? (
          <div className="module-stub-panel" role="status">
            <div className="module-stub-card">
              <span className="module-stub-badge">MODULE STATUS: PENDING ERP INTEGRATION</span>
              <h2>{routeToTitle[activePage]}</h2>
              <p>
                This module is documented in <code>docs/NAVIGATION_STATUS.md</code> as pending department ERP / Google Form integration.
              </p>
              <p>
                Live production, downtime, loss, quality, line, and work center analytics from the Medchal plant are active in the operations dashboard.
              </p>
              <div style={{ marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    window.location.hash = "#/dashboard";
                    setActivePage("dashboard");
                    setLiveActiveSlideId("executive");
                  }}
                >
                  Return to Live Operations Overview
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ===================================================================
                2. OPERATIONS CONTROL (FILTERS) — DIRECTLY BELOW EXECUTIVE HEADER
                =================================================================== */}
            <div className="dashboard-filters-wrapper">
              <FilterBar
                filters={liveDraftFilters}
                onChange={handleLiveDraftChange}
                onApply={() => setLiveAppliedFilters(liveDraftFilters)}
                onLatestData={handleLatestAvailableData}
                autoDateMode={autoDateMode}
                onReset={() => {
                  const options = liveDataset ? liveFilterOptions : filterOptions;
                  const resetFilters: FilterState = {
                    ...defaultFilters,
                    period: "monthly",
                    dateFrom: options.minDate,
                    dateTo: options.maxDate,
                  };
                  isCustomEndDateRef.current = false;
                  setAutoDateMode(true);
                  setLiveDraftFilters(resetFilters);
                  setLiveAppliedFilters(resetFilters);
                  try {
                    sessionStorage.setItem(LIVE_FILTER_STORAGE_KEY, JSON.stringify(resetFilters));
                  } catch {
                    // ignore
                  }
                }}
                options={liveDataset ? liveFilterOptions : liveLoading ? emptyFilterOptions : filterOptions}
                loadingLive={liveLoading && !liveDataset}
              />
              {liveRecords.length > 0 && filteredLiveRecords.length === 0 ? (
                <div className="filter-empty-banner" role="status">
                  No records match the active filters. Adjust the Date Range, Line, Shift, Stage, Machine, or Material filters, or press Reset.
                </div>
              ) : null}
            </div>

            {/* ===================================================================
                3. DASHBOARD CHARTS — LIVE GOOGLE SHEETS SECTION
                =================================================================== */}
            {liveDataset ? (
              <LiveGoogleSheetsSection
                records={filteredLiveRecords}
                previousRecords={filteredPreviousLiveRecords}
                periodWindow={livePeriodWindow}
                spreadsheetId={liveDataset.spreadsheetId}
                worksheet={liveDataset.worksheet}
                recordCount={liveDataset.recordCount}
                lastUpdated={liveDataset.lastUpdated}
                connectionStatus={liveDataset.connectionStatus}
                error={liveDataset.error}
                filters={liveDraftFilters}
                onFiltersChange={handleLiveDraftChange}
                hideTopBanners={true}
                onApplyFilters={() => setLiveAppliedFilters(liveDraftFilters)}
                onResetFilters={() => {
                  const resetFilters: FilterState = {
                    ...defaultFilters,
                    period: "monthly",
                    dateFrom: liveFilterOptions.minDate,
                    dateTo: liveFilterOptions.maxDate,
                  };
                  isCustomEndDateRef.current = false;
                  setAutoDateMode(true);
                  setLiveDraftFilters(resetFilters);
                  setLiveAppliedFilters(resetFilters);
                  try {
                    sessionStorage.setItem(LIVE_FILTER_STORAGE_KEY, JSON.stringify(resetFilters));
                  } catch {
                    // ignore
                  }
                }}
                onRefresh={() => {
                  void refreshData();
                }}
                isRefreshing={liveStatus.state === "syncing" || googleSheetsLoading}
                activeSlideId={liveActiveSlideId}
                onSlideChange={setLiveActiveSlideId}
              />
            ) : liveLoading ? (
              <DashboardLoadingSkeleton />
            ) : (
              <div className="live-empty-state" role="alert">
                <div className="live-empty-state__icon">⚠</div>
                <h3>No Live Google Sheets Connection</h3>
                <p>
                  {liveLoadError
                    ? `The live dataset could not be loaded after several attempts. Reason: ${liveLoadError}`
                    : "Connect to Google Sheets to see live manufacturing analytics."}
                </p>
                <button
                  type="button"
                  className="btn btn--primary live-empty-state__retry"
                  onClick={() => void bootstrapLiveConnection()}
                >
                  Retry Connection
                </button>
              </div>
            )}

            {/* Legacy carousel — kept for backward compatibility when no live dataset */}
            {!liveDataset && !liveLoading && activeSlide !== "data-quality" && activeSlide && (
              <DashboardCarousel slides={carouselSlides} />
            )}

            {/* Data Quality slide (live context) */}
            {activeSlide === "data-quality" ? renderAnalyticsSlide(activeSlide) : null}
          </>
        )}
      </main>
    </div>
  );
}
