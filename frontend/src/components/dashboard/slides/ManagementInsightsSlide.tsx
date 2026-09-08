/**
 * ManagementInsightsSlide — SLIDE 14: MANAGEMENT INSIGHTS
 *
 * Premium "What's happening?" screen with 5-7 dynamically generated insights,
 * each with metric, value, context, and severity. Plus data quality summary.
 */

import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { abbreviateNumber, formatPercent } from "./chartTheme";

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
}

type Severity = "critical" | "warning" | "info" | "positive";

interface Insight {
  metric: string;
  value: string;
  context: string;
  severity: Severity;
}

function buildInsights(analytics: DashboardAnalytics): Insight[] {
  const { productionKpis, downtime, byLine, byShift, byWorkCenter } = analytics;
  const insights: Insight[] = [];

  if (downtime.byReason[0]) {
    const total = downtime.totalDowntimeMinutes;
    const pct = total > 0 ? ((downtime.byReason[0].minutes / total) * 100).toFixed(0) : "0";
    insights.push({
      metric: "Highest Downtime Contributor",
      value: `${downtime.byReason[0].key} (${abbreviateNumber(downtime.byReason[0].minutes)} min)`,
      context: `${pct}% of total downtime`,
      severity: Number(pct) > 30 ? "critical" : "warning",
    });
  }

  const topLossWc = byWorkCenter.length > 0 ? [...byWorkCenter].sort((a, b) => b.productionLoss - a.productionLoss)[0] : null;
  if (topLossWc && topLossWc.productionLoss > 0) {
    insights.push({
      metric: "Highest Production Loss",
      value: `${topLossWc.key} (${abbreviateNumber(topLossWc.productionLoss)} NOS)`,
      context: "Largest loss by work center",
      severity: "critical",
    });
  }

  const rankedLines = [...byLine].filter((l) => l.achievement !== null).sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0));
  if (rankedLines.length > 0 && rankedLines[0].achievement !== null) {
    insights.push({
      metric: "Lowest Achieving Line",
      value: `${rankedLines[0].key} (${formatPercent(rankedLines[0].achievement, 1)})`,
      context: "Below target attainment",
      severity: (rankedLines[0].achievement ?? 100) < 70 ? "critical" : "warning",
    });
  }

  if (byShift.length >= 2) {
    const sorted = [...byShift].sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0));
    if (sorted[0].achievement !== null) {
      insights.push({
        metric: "Worst-Performing Shift",
        value: `${sorted[0].key} (${formatPercent(sorted[0].achievement, 1)})`,
        context: "Lowest shift achievement",
        severity: (sorted[0].achievement ?? 100) < 70 ? "critical" : "warning",
      });
    }
  }

  if (downtime.byMachine.length > 0) {
    insights.push({
      metric: "Highest-Impact Machine",
      value: `${downtime.byMachine[0].key} (${abbreviateNumber(downtime.byMachine[0].minutes)} min)`,
      context: "Most downtime by raw machine",
      severity: "warning",
    });
  }

  const achievement = productionKpis.productionAchievementPercent;
  if (achievement !== null) {
    insights.push({
      metric: "Production Achievement",
      value: formatPercent(achievement, 1),
      context: achievement >= 90 ? "On or near target" : `${(100 - achievement).toFixed(1)}% below target`,
      severity: achievement >= 90 ? "positive" : achievement >= 70 ? "warning" : "critical",
    });
  }

  return insights;
}

const severityClass: Record<Severity, string> = {
  critical: "insight-card--critical",
  warning: "insight-card--warning",
  info: "insight-card--info",
  positive: "insight-card--positive",
};

const severityLabel: Record<Severity, string> = {
  critical: "CRITICAL",
  warning: "WARNING",
  info: "INFO",
  positive: "GOOD",
};

export function ManagementInsightsSlide({ analytics, dataQuality }: Props) {
  const insights = buildInsights(analytics);

  return (
    <div>
      <div className="insights-grid">
        {insights.map((insight, i) => (
          <div key={i} className={`insight-card ${severityClass[insight.severity]}`}>
            <div className="insight-card__header">
              <span className="insight-card__severity">{severityLabel[insight.severity]}</span>
              <span className="insight-card__metric">{insight.metric}</span>
            </div>
            <div className="insight-card__value">{insight.value}</div>
            <div className="insight-card__context">{insight.context}</div>
          </div>
        ))}
      </div>

      {dataQuality && (
        <div className="chart-card" style={{ marginTop: "1rem" }}>
          <div className="chart-card__head">
            <h3 className="chart-card__title">Data Quality Summary</h3>
          </div>
          <div className="chart-card__body">
            <div className="dq-grid">
              <div className="dq-item"><span className="dq-item__label">Total</span><strong>{abbreviateNumber(dataQuality.totalRecords)}</strong></div>
              <div className="dq-item"><span className="dq-item__label">Valid</span><strong>{abbreviateNumber(dataQuality.validRecords)}</strong></div>
              <div className="dq-item"><span className="dq-item__label">Missing Date</span><strong>{abbreviateNumber(dataQuality.missingDate)}</strong></div>
              <div className="dq-item"><span className="dq-item__label">Invalid Date</span><strong>{abbreviateNumber(dataQuality.invalidDate)}</strong></div>
              <div className="dq-item"><span className="dq-item__label">Missing Line</span><strong>{abbreviateNumber(dataQuality.missingLine)}</strong></div>
              <div className="dq-item"><span className="dq-item__label">Missing Shift</span><strong>{abbreviateNumber(dataQuality.missingShift)}</strong></div>
              <div className="dq-item"><span className="dq-item__label">Unmapped Part→Material</span><strong>{abbreviateNumber(dataQuality.missingPart)}</strong></div>
              <div className="dq-item"><span className="dq-item__label">Missing Stage</span><strong>{abbreviateNumber(dataQuality.missingStage)}</strong></div>
              <div className="dq-item"><span className="dq-item__label">Missing Machine</span><strong>{abbreviateNumber(dataQuality.missingMachine)}</strong></div>
              <div className="dq-item"><span className="dq-item__label">Unmapped Work Center</span><strong>{abbreviateNumber(dataQuality.unmappedWorkCenter)}</strong></div>
              <div className="dq-item"><span className="dq-item__label">Duplicates</span><strong>{abbreviateNumber(dataQuality.duplicateRows)}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
