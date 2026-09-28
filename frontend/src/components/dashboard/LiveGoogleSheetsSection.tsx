/**
 * LiveGoogleSheetsSection Component
 *
 * Renders the LIVE Google Sheets dashboard with 14-slide carousel.
 * Supports operational hierarchy drill-downs (Line -> Work Center -> Machine Modal)
 * while preserving active Date, Period, Shift, and Material filters.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardCarousel, type CarouselSlide } from "./DashboardCarousel";
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
  MachineDetailModal,
  useDashboardAnalytics,
} from "./slides";
import { analyzeBusinessDataQuality } from "../../data/analysis/businessDataQuality";
import type { PeriodWindow } from "../../data/calculations/periodEngine";
import type { DprRecord } from "../../data/normalization/normalizeDprData";
import type { FilterState } from "../../pages/ManufacturingDashboard";
import type { MachinePerformance } from "../../data/calculations/hierarchyEngine";
import { datasetDateBounds } from "../../data/filters/dashboardFilterEngine";

type Props = {
  records: DprRecord[];
  previousRecords?: DprRecord[];
  periodWindow?: PeriodWindow;
  spreadsheetId: string;
  worksheet: string;
  recordCount: number;
  lastUpdated: string | null;
  connectionStatus: "connected" | "offline" | "error";
  error: string | null;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  activeSlideId?: string;
  onSlideChange?: (slideId: string) => void;
  /** Optional filter bar element to render at the bottom */
  filterBar?: React.ReactNode;
  /** When true, omits the redundant top source-badge and live-meta strip */
  hideTopBanners?: boolean;
};

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatDisplayDate(iso: string): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function LiveGoogleSheetsSection({
  records,
  previousRecords = [],
  periodWindow,
  spreadsheetId,
  worksheet,
  recordCount,
  lastUpdated,
  connectionStatus,
  error,
  filters,
  onFiltersChange,
  onRefresh,
  isRefreshing,
  activeSlideId,
  onSlideChange,
  filterBar,
  hideTopBanners = false,
}: Props) {
  const [selectedMachine, setSelectedMachine] = useState<MachinePerformance | null>(null);
  const [currentSlideId, setCurrentSlideId] = useState<string>(activeSlideId ?? "executive");

  useEffect(() => {
    if (activeSlideId && activeSlideId !== currentSlideId) {
      setCurrentSlideId(activeSlideId);
    }
  }, [activeSlideId, currentSlideId]);

  const handleSlideChange = useCallback((id: string) => {
    setCurrentSlideId(id);
    onSlideChange?.(id);
  }, [onSlideChange]);

  const carouselAnalytics = useDashboardAnalytics(records, previousRecords, periodWindow);

  const carouselDataQuality = useMemo(() => {
    const q = analyzeBusinessDataQuality(records);
    return {
      totalRecords: q.totalRecords,
      validRecords: Math.max(0, q.totalRecords - q.missingDate - q.invalidDate),
      missingDate: q.missingDate,
      invalidDate: q.invalidDate,
      missingLine: q.missingLine,
      missingShift: q.missingShift,
      missingPart: q.unmappedMaterialPartValues.length,
      missingStage: records.filter((row) => !row.rawStage?.trim()).length,
      missingMachine: records.filter((row) => !row.machineName?.trim() && !row.machineNo?.trim()).length,
      unmappedWorkCenter: q.unmappedWorkCenter,
      duplicateRows: q.duplicateRows,
    };
  }, [records]);

  const carouselSlides: CarouselSlide[] = useMemo(
    () => [
      {
        id: "executive",
        title: "Executive Overview",
        icon: "📊",
        content: (
          <ExecutiveOverviewSlide
            analytics={carouselAnalytics}
            onNavigateSlide={handleSlideChange}
            activeFilters={filters}
            filterBar={filterBar}
          />
        ),
      },
      { id: "production", title: "Production Performance", icon: "🏭", content: <ProductionSlide analytics={carouselAnalytics} onNavigateSlide={handleSlideChange} /> },
      {
        id: "target-gap",
        title: "Target / Gap Analysis",
        icon: "🎯",
        content: (
          <TargetGapAnalysisSlide
            records={records}
            filters={filters}
            analytics={carouselAnalytics}
            onPeriodChange={(period) => onFiltersChange({ ...filters, period })}
          />
        ),
      },
      { id: "prod-loss", title: "Production Loss", icon: "📉", content: <ProductionLossSlide analytics={carouselAnalytics} /> },
      { id: "downtime", title: "Downtime Command Center", icon: "⏱", content: <DowntimeCommandCenterSlide analytics={carouselAnalytics} /> },
      { id: "downtime-root", title: "Downtime Root Cause", icon: "🔍", content: <DowntimeRootCauseSlide analytics={carouselAnalytics} /> },
      { id: "quality", title: "Quality", icon: "✅", content: <QualitySlide analytics={carouselAnalytics} /> },
      {
        id: "line-perf",
        title: "Line Performance",
        icon: "📈",
        content: (
          <LinePerformanceSlide
            analytics={carouselAnalytics}
            onSelectLine={(line) => onFiltersChange({ ...filters, line })}
            selectedLine={filters.line}
          />
        ),
      },
      { id: "shift-perf", title: "Shift Performance", icon: "🕐", content: <ShiftPerformanceSlide analytics={carouselAnalytics} /> },
      { id: "material", title: "Material / Part", icon: "🧱", content: <MaterialPartSlide analytics={carouselAnalytics} /> },
      { id: "stage", title: "Stage Analytics", icon: "⚙️", content: <StageAnalyticsSlide analytics={carouselAnalytics} /> },
      {
        id: "workcenter",
        title: "Work Center Analytics",
        icon: "🏗️",
        content: (
          <WorkCenterAnalyticsSlide
            analytics={carouselAnalytics}
            onSelectWorkCenter={(workCenter) => onFiltersChange({ ...filters, workCenter })}
            selectedWorkCenter={filters.workCenter}
          />
        ),
      },
      {
        id: "machine",
        title: "Machine Analytics",
        icon: "🔧",
        content: (
          <MachineAnalyticsSlide
            analytics={carouselAnalytics}
            onSelectMachine={(m) => setSelectedMachine(m)}
            selectedWorkCenter={filters.workCenter}
            onResetWorkCenter={() => onFiltersChange({ ...filters, workCenter: "All Work Centers" })}
          />
        ),
      },
      { id: "relationship", title: "Downtime vs Loss", icon: "🔗", content: <RelationshipSlide analytics={carouselAnalytics} /> },
      {
        id: "insights",
        title: "Management Insights",
        icon: "💡",
        content: (
          <ManagementInsightsSlide
            analytics={carouselAnalytics}
            dataQuality={carouselDataQuality}
            activeFilters={filters}
          />
        ),
      },
    ],
    [carouselAnalytics, carouselDataQuality, filters, onFiltersChange, handleSlideChange, filterBar, records]
  );

  const isLive = connectionStatus === "connected";
  const statusLabel = isLive ? "LIVE" : connectionStatus === "error" ? "ERROR" : "OFFLINE";
  const statusClass = isLive ? "live" : connectionStatus === "error" ? "error" : "offline";

  const sourceBounds = useMemo(() => datasetDateBounds(records), [records]);
  const sourceRangeText = sourceBounds.minDate && sourceBounds.maxDate
    ? `${formatDisplayDate(sourceBounds.minDate)} → ${formatDisplayDate(sourceBounds.maxDate)}`
    : "Detecting…";

  return (
    <section className="live-google-sheets-section" aria-label="Live Google Sheets Manufacturing Dashboard">
      {!hideTopBanners && (
        <>
          <div className={`source-badge source-badge--${statusClass}`}>
            <span className="source-badge__icon">{isLive ? "●" : "⚠"}</span>
            <div>
              <span className="source-badge__label">{statusLabel} — GOOGLE SHEETS</span>
              <span className="source-badge__detail">{worksheet} • {spreadsheetId}</span>
            </div>
          </div>

          <div className="live-meta">
            <div className="live-meta__item">
              <span className="live-meta__label">Records</span>
              <strong>{formatNumber(recordCount)}</strong>
            </div>
            <div className="live-meta__item">
              <span className="live-meta__label">Source Range</span>
              <strong>{sourceRangeText}</strong>
            </div>
            <div className="live-meta__item">
              <span className="live-meta__label">Last Updated</span>
              <strong>{lastUpdated ? new Date(lastUpdated).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not synced"}</strong>
            </div>
            <div className="live-meta__item">
              <span className="live-meta__label">Source</span>
              <strong>Google Sheets (Live)</strong>
            </div>
            <div className="live-meta__item">
              <button type="button" className="btn btn--primary btn--small" onClick={onRefresh} disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh Data"}
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="live-error-banner" role="alert">
          <span>⚠</span> {error}
        </div>
      )}

      <DashboardCarousel
        slides={carouselSlides}
        activeSlideId={currentSlideId}
        onSlideChange={handleSlideChange}
      />

      {currentSlideId !== "executive" && filterBar && (
        <div style={{ marginTop: "1.5rem" }}>
          {filterBar}
        </div>
      )}

      {/* Dedicated Machine Drill-Down Modal */}
      {selectedMachine && (
        <MachineDetailModal
          machine={selectedMachine}
          onClose={() => setSelectedMachine(null)}
          periodLabel={periodWindow?.label}
        />
      )}
    </section>
  );
}
