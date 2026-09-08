/**
 * ImportedDatasetSection Component
 *
 * Renders analytics for UPLOADED Excel/CSV data ONLY.
 * This component never reads liveDataset — strict separation.
 */

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { DprRecord } from "../../data/normalization/normalizeDprData";
import { calculateProductionKpis } from "../../data/calculations/productionKpis";
import { calculateDowntimeAnalysis } from "../../data/calculations/downtimeAnalysis";
import { calculateQualityAnalysis } from "../../data/calculations/qualityAnalysis";
import { calculateOeeSummary } from "../../data/calculations/oeeCalculator";
import { calculateManufacturingAnalysis } from "../../data/calculations/manufacturingAnalysis";
import { BUSINESS_LINES, BUSINESS_MATERIALS, BUSINESS_SHIFTS, normalizeLine, normalizeShift } from "../../data/normalization/lineShiftMaterial";
import { BUSINESS_WORK_CENTERS } from "../../data/normalization/workCenterMapping";
import type { FilterState } from "../../pages/ManufacturingDashboard";

type Props = {
  records: DprRecord[];
  fileName: string;
  recordCount: number;
  dateMin: string;
  dateMax: string;
  sourceType: "excel" | "csv" | "google-sheets";
  /** Source meta for connected Google Sheets (optional for uploaded files). */
  worksheet?: string;
  lastUpdated?: string | null;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
};

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatDate(isoDate: string): string {
  if (!isoDate) return "N/A";
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function ImportedDatasetSection({
  records,
  fileName,
  recordCount,
  dateMin,
  dateMax,
  sourceType,
  worksheet,
  lastUpdated,
  filters,
  onFiltersChange,
  onApplyFilters,
  onResetFilters,
}: Props) {
  const productionKpis = useMemo(() => calculateProductionKpis(records), [records]);
  const downtime = useMemo(() => calculateDowntimeAnalysis(records), [records]);
  const quality = useMemo(() => calculateQualityAnalysis(records), [records]);
  const oeeSummary = useMemo(() => calculateOeeSummary(records), [records]);
  const manufacturing = useMemo(() => calculateManufacturingAnalysis(records), [records]);

  // Calculate total production loss from records directly
  const totalProductionLoss = useMemo(() =>
    records.reduce((sum, row) => (typeof row.productionLoss === "number" && Number.isFinite(row.productionLoss) ? sum + row.productionLoss : sum), 0),
    [records]
  );

  const filterOptions = useMemo(() => {
    const lineSet = new Set<string>();
    records.forEach((row) => {
      const line = normalizeLine(row.lineName);
      if (line) lineSet.add(line);
    });
    const lines = [...BUSINESS_LINES, ...[...lineSet].filter((l) => !BUSINESS_LINES.includes(l)).sort()];

    const materialSet = new Set<string>();
    records.forEach((row) => { if (row.material) materialSet.add(row.material); });
    const materials = [...BUSINESS_MATERIALS.filter((m) => materialSet.has(m)), ...[...materialSet].filter((m) => !BUSINESS_MATERIALS.includes(m)).sort()];

    const shiftSet = new Set<string>();
    records.forEach((row) => { if (row.shift) shiftSet.add(normalizeShift(row.shift) || row.shift); });
    const shifts = [...BUSINESS_SHIFTS.filter((s) => shiftSet.has(s)), ...[...shiftSet].filter((s) => !BUSINESS_SHIFTS.includes(s)).sort()];

    return {
      minDate: dateMin,
      maxDate: dateMax,
      lines,
      materials,
      shifts,
      allWorkCenters: [...BUSINESS_WORK_CENTERS],
      workCentersByLine: {} as Record<string, string[]>,
    };
  }, [records, dateMin, dateMax]);

  const isGoogleSheet = sourceType === "google-sheets";
  const sourceBadgeLabel = isGoogleSheet
    ? "CONNECTED GOOGLE SHEET"
    : sourceType === "csv"
      ? "IMPORTED CSV"
      : "IMPORTED EXCEL";
  const sourceDetail = isGoogleSheet
    ? `${fileName}${worksheet ? ` • ${worksheet}` : ""}`
    : fileName;

  return (
    <section className="imported-dataset-section" aria-label="Generated Dataset Analysis">
      <div className="imported-section-header">
        <p className="eyebrow">GENERATED DATASET ANALYSIS</p>
        <h2>Imported Dataset Dashboard</h2>
        <p className="field__hint">
          This analysis is generated from the dataset connected or uploaded through the Data Import
          Center above. It never affects the Overview / live dashboard.
        </p>
      </div>

      <div className="source-badge source-badge--imported">
        <span className="source-badge__icon">{isGoogleSheet ? "🔗" : "📊"}</span>
        <div>
          <span className="source-badge__label">{sourceBadgeLabel}</span>
          <span className="source-badge__detail">{sourceDetail}</span>
        </div>
        <span className={`source-pill ${isGoogleSheet ? "source-pill--connected" : "source-pill--imported"}`}>
          {isGoogleSheet ? "CONNECTED" : "IMPORTED"}
        </span>
      </div>

      <div className="imported-meta">
        <div className="imported-meta__item">
          <span className="imported-meta__label">Source</span>
          <strong>{isGoogleSheet ? "Google Sheets" : `Uploaded ${sourceType.toUpperCase()}`}</strong>
        </div>
        <div className="imported-meta__item">
          <span className="imported-meta__label">{isGoogleSheet ? "Spreadsheet" : "File Name"}</span>
          <strong>{fileName}</strong>
        </div>
        {isGoogleSheet && worksheet ? (
          <div className="imported-meta__item">
            <span className="imported-meta__label">Worksheet</span>
            <strong>{worksheet}</strong>
          </div>
        ) : null}
        <div className="imported-meta__item">
          <span className="imported-meta__label">Record Count</span>
          <strong>{formatNumber(recordCount)}</strong>
        </div>
        <div className="imported-meta__item">
          <span className="imported-meta__label">Date Range</span>
          <strong>{formatDate(dateMin)} → {formatDate(dateMax)}</strong>
        </div>
        <div className="imported-meta__item">
          <span className="imported-meta__label">Status</span>
          <strong>{isGoogleSheet ? "Connected" : "Processed"}</strong>
        </div>
        {lastUpdated ? (
          <div className="imported-meta__item">
            <span className="imported-meta__label">Last Updated</span>
            <strong>{lastUpdated}</strong>
          </div>
        ) : null}
      </div>

      {/* Compact Filters for Imported Data */}
      <div className="imported-filters">
        <div className="imported-filters__grid">
          <label className="field">
            <span>Date Range</span>
            <div className="date-range">
              <input
                type="date"
                value={filters.dateFrom}
                min={filterOptions.minDate || undefined}
                max={filters.dateTo || filterOptions.maxDate || undefined}
                onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
                aria-label="Start date"
              />
              <span className="date-range__separator">→</span>
              <input
                type="date"
                value={filters.dateTo}
                min={filters.dateFrom || filterOptions.minDate || undefined}
                max={filterOptions.maxDate || undefined}
                onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
                aria-label="End date"
              />
            </div>
          </label>
          <label className="field">
            <span>Line</span>
            <select value={filters.line} onChange={(e) => onFiltersChange({ ...filters, line: e.target.value })}>
              <option value="All Lines">All Lines</option>
              {filterOptions.lines.map((line) => <option key={line} value={line}>{line}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Shift</span>
            <select value={filters.shift} onChange={(e) => onFiltersChange({ ...filters, shift: e.target.value })}>
              <option value="All Shifts">All Shifts</option>
              {filterOptions.shifts.map((shift) => <option key={shift} value={shift}>{shift}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Material</span>
            <select value={filters.material} onChange={(e) => onFiltersChange({ ...filters, material: e.target.value })}>
              <option value="All Materials">All Materials</option>
              {filterOptions.materials.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>
        <div className="imported-filters__actions">
          <button type="button" className="btn btn--primary btn--small" onClick={onApplyFilters}>Apply</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={onResetFilters}>Reset</button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="imported-kpi-grid">
        <div className="imported-kpi-card">
          <span className="imported-kpi-card__label">Production Achievement</span>
          <strong className="imported-kpi-card__value">{productionKpis.productionAchievementPercent?.toFixed(1) ?? "N/A"}%</strong>
          <span className="imported-kpi-card__target">Target: 100%</span>
        </div>
        <div className="imported-kpi-card">
          <span className="imported-kpi-card__label">Actual Production</span>
          <strong className="imported-kpi-card__value">{formatNumber(productionKpis.totalProduction)}</strong>
        </div>
        <div className="imported-kpi-card">
          <span className="imported-kpi-card__label">Total Downtime</span>
          <strong className="imported-kpi-card__value">{formatNumber(downtime.totalDowntimeMinutes)} min</strong>
        </div>
        <div className="imported-kpi-card">
          <span className="imported-kpi-card__label">Rejection Rate</span>
          <strong className="imported-kpi-card__value">{quality.rejectionRatePercent?.toFixed(2) ?? "N/A"}%</strong>
        </div>
        <div className="imported-kpi-card">
          <span className="imported-kpi-card__label">OEE</span>
          <strong className="imported-kpi-card__value">{oeeSummary.oeePercent?.toFixed(1) ?? "N/A"}%</strong>
        </div>
        <div className="imported-kpi-card">
          <span className="imported-kpi-card__label">Production Loss</span>
          <strong className="imported-kpi-card__value">{formatNumber(totalProductionLoss)}</strong>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="imported-charts-grid">
        <article className="panel panel--chart">
          <div className="section-header compact"><div><p className="eyebrow">Production</p><h2>Production by Line</h2></div></div>
          <ReactECharts
            option={{
              backgroundColor: "transparent",
              tooltip: { trigger: "axis" },
              xAxis: { type: "category", data: manufacturing.productionByLine.map((item) => item.key), axisLabel: { interval: 0, rotate: 20 } },
              yAxis: { type: "value" },
              series: [{ type: "bar", data: manufacturing.productionByLine.map((item) => item.value), itemStyle: { color: "#4f46e5" } }],
            }}
            style={{ height: 220 }}
          />
        </article>

        <article className="panel panel--chart">
          <div className="section-header compact"><div><p className="eyebrow">Downtime</p><h2>Top Downtime Causes</h2></div></div>
          <ReactECharts
            option={{
              backgroundColor: "transparent",
              tooltip: { trigger: "axis" },
              xAxis: { type: "category", data: downtime.byReason.slice(0, 6).map((item) => item.key), axisLabel: { interval: 0, rotate: 20 } },
              yAxis: { type: "value" },
              series: [{ type: "bar", data: downtime.byReason.slice(0, 6).map((item) => item.minutes), itemStyle: { color: "#dc2626" } }],
            }}
            style={{ height: 220 }}
          />
        </article>

        <article className="panel panel--chart">
          <div className="section-header compact"><div><p className="eyebrow">Quality</p><h2>Rejection by Part</h2></div></div>
          <ReactECharts
            option={{
              backgroundColor: "transparent",
              tooltip: { trigger: "item" },
              series: [{
                type: "pie",
                radius: ["40%", "70%"],
                data: quality.byPart.slice(0, 6).map((item) => ({ name: item.key, value: item.value })),
                label: { show: true, fontSize: 10 },
              }],
            }}
            style={{ height: 220 }}
          />
        </article>

        <article className="panel panel--chart">
          <div className="section-header compact"><div><p className="eyebrow">Work Center</p><h2>Production by Machine</h2></div></div>
          <ReactECharts
            option={{
              backgroundColor: "transparent",
              tooltip: { trigger: "axis" },
              xAxis: { type: "category", data: manufacturing.productionByMachine.slice(0, 8).map((item) => item.key), axisLabel: { interval: 0, rotate: 30 } },
              yAxis: { type: "value" },
              series: [{ type: "bar", data: manufacturing.productionByMachine.slice(0, 8).map((item) => item.value), itemStyle: { color: "#0ea5e9" } }],
            }}
            style={{ height: 220 }}
          />
        </article>
      </div>
    </section>
  );
}
