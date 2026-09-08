/**
 * InsightsSlide Component
 * Live generated insights and data quality summary.
 */

import type { DashboardAnalytics } from "./useDashboardAnalytics";

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

function formatNumber(value: number): string {
  return value.toLocaleString();
}

export function InsightsSlide({ analytics, dataQuality }: Props) {
  const { productionKpis, quality, downtime, byLine, byShift, byStage, totalProductionLoss } = analytics;
  const achievement = productionKpis.productionAchievementPercent;
  const rejectionRate = quality.rejectionRatePercent;

  const insights: string[] = [];

  if (achievement !== null && achievement < 90) {
    insights.push(`Production achievement is ${achievement.toFixed(1)}%, below the 100% target.`);
  } else if (achievement === null) {
    insights.push("Production achievement cannot be calculated — no valid target values in the current selection.");
  }
  if (rejectionRate !== null && rejectionRate > 1.5) {
    insights.push(`Rejection rate (${rejectionRate.toFixed(2)}%) exceeds the 1.5% target.`);
  }
  if (downtime.byReason[0]) {
    insights.push(`Largest downtime driver: "${downtime.byReason[0].key}" (${formatNumber(downtime.byReason[0].minutes)} min).`);
  }

  // Lowest-performing line by achievement (dynamically calculated).
  const rankedLines = [...byLine].filter((l) => l.achievement !== null).sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0));
  if (rankedLines.length > 0 && rankedLines[0].achievement !== null) {
    insights.push(`Lowest-performing line: "${rankedLines[0].key}" at ${rankedLines[0].achievement?.toFixed(1)}% achievement.`);
  }

  // Shift comparison (dynamically calculated from the two shifts present in the data).
  if (byShift.length >= 2) {
    const [a, b] = [...byShift].sort((x, y) => y.production - x.production);
    insights.push(`"${a.key}" produced ${formatNumber(a.production)} units vs "${b.key}" at ${formatNumber(b.production)} units.`);
  }

  // Highest production-loss area (by stage, a raw source dimension).
  const topLossStage = [...byStage].sort((a, b) => b.production - a.production)[0];
  if (topLossStage && totalProductionLoss > 0) {
    insights.push(`Total production loss (Prod Loss NOS) is ${formatNumber(totalProductionLoss)} units; "${topLossStage.key}" is the highest-producing stage in the selection.`);
  }

  if (dataQuality && dataQuality.unmappedWorkCenter > 0) {
    insights.push(`${formatNumber(dataQuality.unmappedWorkCenter)} rows have machines without a confirmed Work Center mapping — review the mapping configuration.`);
  }

  if (insights.length === 0) {
    insights.push("All key metrics are within expected ranges.");
  }

  return (
    <div>
      <div className="carousel-chart-container" style={{ marginBottom: "1rem" }}>
        <div className="carousel-chart-container__title">Key Insights</div>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", lineHeight: 1.6 }}>
          {insights.map((insight, i) => (
            <li key={i}>{insight}</li>
          ))}
        </ul>
      </div>

      {dataQuality && (
        <div className="carousel-chart-container">
          <div className="carousel-chart-container__title">Data Quality Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", fontSize: "0.8rem" }}>
            <div><strong>Total:</strong> {formatNumber(dataQuality.totalRecords)}</div>
            <div><strong>Valid:</strong> {formatNumber(dataQuality.validRecords)}</div>
            <div><strong>Missing Date:</strong> {formatNumber(dataQuality.missingDate)}</div>
            <div><strong>Invalid Date:</strong> {formatNumber(dataQuality.invalidDate)}</div>
            <div><strong>Missing Line:</strong> {formatNumber(dataQuality.missingLine)}</div>
            <div><strong>Missing Shift:</strong> {formatNumber(dataQuality.missingShift)}</div>
            <div><strong>Unmapped Part→Material:</strong> {formatNumber(dataQuality.missingPart)}</div>
            <div><strong>Missing Stage:</strong> {formatNumber(dataQuality.missingStage)}</div>
            <div><strong>Missing Machine:</strong> {formatNumber(dataQuality.missingMachine)}</div>
            <div><strong>Unmapped Work Center:</strong> {formatNumber(dataQuality.unmappedWorkCenter)}</div>
            <div><strong>Duplicates:</strong> {formatNumber(dataQuality.duplicateRows)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
