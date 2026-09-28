/**
 * ManagementInsightsSlide — SLIDE 14: EVIDENCE-BASED MANUFACTURING INSIGHTS (PHASE 7)
 *
 * Displays the 10 mathematically derived manufacturing insights:
 * 1. Best Line
 * 2. Worst Line
 * 3. Best Work Center
 * 4. Worst Work Center
 * 5. Highest Downtime Contributor
 * 6. Highest Production Loss Contributor
 * 7. Highest Rejection Contributor
 * 8. Significant Period Change
 * 9. Abnormal Trend
 * 10. Priority Improvement Area
 *
 * Every insight contains: INSIGHT, EVIDENCE, WHERE, WHY, PRIORITY, ACTION
 * Filter-aware: Only reflects the active filtered dataset.
 * Sample-size protected: Explicit warnings for entities with < 10 records.
 */

import { useMemo, useState } from "react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import type { FilterState } from "../../../pages/ManufacturingDashboard";
import {
  generateEvidenceBasedInsights,
  type EvidenceInsight,
  type InsightPriority,
  type InsightThresholds,
} from "../../../data/calculations/evidenceBasedInsights";
import { formatCompactWithExact } from "../../../utils/format";

interface Props {
  analytics: DashboardAnalytics;
  dataQuality: {
    totalRecords: number;
    validRecords: number;
    missingDate: number;
    invalidDate: number;
    missingLine: number;
    missingShift: number;
    missingPart: number;
    missingStage: number;
    missingMachine: number;
    unmappedWorkCenter: number;
    duplicateRows: number;
  } | null;
  activeFilters?: FilterState;
  customThresholds?: Partial<InsightThresholds>;
}

type FilterPriorityTab = "ALL" | InsightPriority;

const priorityClassMap: Record<InsightPriority, string> = {
  CRITICAL: "evidence-card--critical",
  HIGH: "evidence-card--high",
  MEDIUM: "evidence-card--medium",
  POSITIVE: "evidence-card--positive",
};

const priorityPillClass: Record<InsightPriority, string> = {
  CRITICAL: "priority-pill priority-pill--critical",
  HIGH: "priority-pill priority-pill--high",
  MEDIUM: "priority-pill priority-pill--medium",
  POSITIVE: "priority-pill priority-pill--positive",
};

export function ManagementInsightsSlide({
  analytics,
  dataQuality,
  activeFilters,
  customThresholds,
}: Props) {
  const [selectedPriority, setSelectedPriority] = useState<FilterPriorityTab>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const { insights, filterScope, summary } = useMemo(
    () => generateEvidenceBasedInsights(analytics, activeFilters, customThresholds),
    [analytics, activeFilters, customThresholds]
  );

  const filteredInsights = useMemo(() => {
    return insights.filter((item: EvidenceInsight) => {
      if (selectedPriority !== "ALL" && item.priority !== selectedPriority) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          item.category.toLowerCase().includes(query) ||
          item.insight.toLowerCase().includes(query) ||
          item.where.toLowerCase().includes(query) ||
          item.why.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [insights, selectedPriority, searchQuery]);

  return (
    <div className="evidence-insights-slide">
      {/* Scope and Control Bar */}
      <div className="insights-control-bar">
        <div className="insights-scope-wrap">
          <span className="insights-scope-badge">ACTIVE DATA SCOPE</span>
          <span className="insights-scope-text" title={filterScope}>
            {filterScope}
          </span>
        </div>

        {/* Priority Filter Chips */}
        <div className="insights-filter-chips" role="tablist" aria-label="Filter insights by priority">
          <button
            type="button"
            className={`insights-chip ${selectedPriority === "ALL" ? "insights-chip--active" : ""}`}
            onClick={() => setSelectedPriority("ALL")}
            role="tab"
            aria-selected={selectedPriority === "ALL"}
          >
            All ({insights.length})
          </button>
          {summary.criticalCount > 0 && (
            <button
              type="button"
              className={`insights-chip insights-chip--critical ${selectedPriority === "CRITICAL" ? "insights-chip--active" : ""}`}
              onClick={() => setSelectedPriority("CRITICAL")}
              role="tab"
              aria-selected={selectedPriority === "CRITICAL"}
            >
              Critical ({summary.criticalCount})
            </button>
          )}
          {summary.highCount > 0 && (
            <button
              type="button"
              className={`insights-chip insights-chip--high ${selectedPriority === "HIGH" ? "insights-chip--active" : ""}`}
              onClick={() => setSelectedPriority("HIGH")}
              role="tab"
              aria-selected={selectedPriority === "HIGH"}
            >
              High ({summary.highCount})
            </button>
          )}
          {summary.mediumCount > 0 && (
            <button
              type="button"
              className={`insights-chip insights-chip--medium ${selectedPriority === "MEDIUM" ? "insights-chip--active" : ""}`}
              onClick={() => setSelectedPriority("MEDIUM")}
              role="tab"
              aria-selected={selectedPriority === "MEDIUM"}
            >
              Medium ({summary.mediumCount})
            </button>
          )}
          {summary.positiveCount > 0 && (
            <button
              type="button"
              className={`insights-chip insights-chip--positive ${selectedPriority === "POSITIVE" ? "insights-chip--active" : ""}`}
              onClick={() => setSelectedPriority("POSITIVE")}
              role="tab"
              aria-selected={selectedPriority === "POSITIVE"}
            >
              Positive ({summary.positiveCount})
            </button>
          )}
        </div>
      </div>

      {/* Grid of Evidence-Based Insight Cards */}
      <div className="evidence-grid">
        {filteredInsights.map((item: EvidenceInsight) => (
          <article
            key={item.id}
            className={`evidence-card ${priorityClassMap[item.priority]}`}
            aria-label={`${item.category}: ${item.insight}`}
          >
            {/* Header: Category + Priority + Sample Size Warning */}
            <header className="evidence-card__header">
              <div className="evidence-card__tags">
                <span className="evidence-card__category">{item.category}</span>
                {item.sampleSizeWarning && (
                  <span className="evidence-card__sample-warning" title="Sample size is below statistical threshold">
                    ⚠ Low Sample
                  </span>
                )}
              </div>
              <span className={priorityPillClass[item.priority]}>
                {item.priority}
              </span>
            </header>

            {/* 1. INSIGHT (Headline) */}
            <div className="evidence-card__section evidence-card__section--insight">
              <span className="evidence-card__field-label">INSIGHT</span>
              <h4 className="evidence-card__insight-title">{item.insight}</h4>
            </div>

            {/* 2. EVIDENCE (Calculation Proof) */}
            <div className="evidence-card__section evidence-card__section--evidence">
              <span className="evidence-card__field-label">EVIDENCE</span>
              <p className="evidence-card__evidence-text">{item.evidence}</p>
            </div>

            {/* 3. WHERE & 4. WHY */}
            <div className="evidence-card__context-grid">
              <div className="evidence-card__context-block">
                <span className="evidence-card__field-label">WHERE</span>
                <span className="evidence-card__where-val">{item.where}</span>
              </div>
              <div className="evidence-card__context-block">
                <span className="evidence-card__field-label">WHY</span>
                <span className="evidence-card__why-val">{item.why}</span>
              </div>
            </div>

            {/* 5. ACTION (Operational Next Step) */}
            <div className="evidence-card__section evidence-card__section--action">
              <span className="evidence-card__field-label">ACTION</span>
              <p className="evidence-card__action-text">{item.action}</p>
            </div>
          </article>
        ))}
      </div>

      {filteredInsights.length === 0 && (
        <div className="evidence-empty-state" role="status">
          <p>No insights match the selected filter criteria.</p>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              setSelectedPriority("ALL");
              setSearchQuery("");
            }}
          >
            Reset Insight Filters
          </button>
        </div>
      )}

      {/* Data Quality Summary */}
      {dataQuality && (
        <div className="chart-card" style={{ marginTop: "1.5rem" }}>
          <div className="chart-card__head">
            <h3 className="chart-card__title">Dataset Health & Integrity Audit</h3>
          </div>
          <div className="chart-card__body">
            <div className="dq-grid">
              {(() => {
                const renderDq = (val: number) => {
                  const { compact, exact } = formatCompactWithExact(val);
                  if (Math.abs(val) < 1_000) return exact;
                  return (
                    <>
                      {compact} <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>({exact})</span>
                    </>
                  );
                };
                return (
                  <>
                    <div className="dq-item">
                      <span className="dq-item__label">Total Records</span>
                      <strong>{renderDq(dataQuality.totalRecords)}</strong>
                    </div>
                    <div className="dq-item">
                      <span className="dq-item__label">Valid Records</span>
                      <strong>{renderDq(dataQuality.validRecords)}</strong>
                    </div>
                    <div className="dq-item">
                      <span className="dq-item__label">Missing Date</span>
                      <strong>{renderDq(dataQuality.missingDate)}</strong>
                    </div>
                    <div className="dq-item">
                      <span className="dq-item__label">Invalid Date</span>
                      <strong>{renderDq(dataQuality.invalidDate)}</strong>
                    </div>
                    <div className="dq-item">
                      <span className="dq-item__label">Missing Line</span>
                      <strong>{renderDq(dataQuality.missingLine)}</strong>
                    </div>
                    <div className="dq-item">
                      <span className="dq-item__label">Missing Shift</span>
                      <strong>{renderDq(dataQuality.missingShift)}</strong>
                    </div>
                    <div className="dq-item">
                      <span className="dq-item__label">Unmapped Part→Material</span>
                      <strong>{renderDq(dataQuality.missingPart)}</strong>
                    </div>
                    <div className="dq-item">
                      <span className="dq-item__label">Missing Stage</span>
                      <strong>{renderDq(dataQuality.missingStage)}</strong>
                    </div>
                    <div className="dq-item">
                      <span className="dq-item__label">Missing Machine</span>
                      <strong>{renderDq(dataQuality.missingMachine)}</strong>
                    </div>
                    <div className="dq-item">
                      <span className="dq-item__label">Unmapped Work Center</span>
                      <strong>{renderDq(dataQuality.unmappedWorkCenter)}</strong>
                    </div>
                    <div className="dq-item">
                      <span className="dq-item__label">Duplicate Rows</span>
                      <strong>{renderDq(dataQuality.duplicateRows)}</strong>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
