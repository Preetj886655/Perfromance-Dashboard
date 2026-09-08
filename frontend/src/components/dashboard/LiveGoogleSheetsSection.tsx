/**
 * LiveGoogleSheetsSection Component
 *
 * Renders the LIVE Google Sheets dashboard with 14-slide carousel.
 * This component uses liveDataset ONLY — never reads uploadedDataset.
 */

import { useMemo } from "react";
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
  useDashboardAnalytics,
} from "./slides";
import { analyzeBusinessDataQuality } from "../../data/analysis/businessDataQuality";
import type { DprRecord } from "../../data/normalization/normalizeDprData";
import type { FilterState } from "../../pages/ManufacturingDashboard";

type Props = {
  records: DprRecord[];
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
};

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function LiveGoogleSheetsSection({
  records,
  spreadsheetId,
  worksheet,
  recordCount,
  lastUpdated,
  connectionStatus,
  error,
  onRefresh,
  isRefreshing,
}: Props) {
  const carouselAnalytics = useDashboardAnalytics(records);

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
      { id: "executive", title: "Executive Overview", icon: "📊", content: <ExecutiveOverviewSlide analytics={carouselAnalytics} /> },
      { id: "production", title: "Production Performance", icon: "🏭", content: <ProductionSlide analytics={carouselAnalytics} /> },
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
    [carouselAnalytics, carouselDataQuality]
  );

  const isLive = connectionStatus === "connected";
  const statusLabel = isLive ? "LIVE" : connectionStatus === "error" ? "ERROR" : "OFFLINE";
  const statusClass = isLive ? "live" : connectionStatus === "error" ? "error" : "offline";

  return (
    <section className="live-google-sheets-section" aria-label="Live Google Sheets Manufacturing Dashboard">
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

      {error && (
        <div className="live-error-banner" role="alert">
          <span>⚠</span> {error}
        </div>
      )}

      <DashboardCarousel slides={carouselSlides} />
    </section>
  );
}
