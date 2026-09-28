/**
 * PeriodComparisonChart Component
 *
 * Visualizes current vs previous period metrics:
 * - Volume metrics (Production, Target, Loss, Downtime, Rejection) with percentage growth (%)
 * - Rate metrics (Achievement, Rejection Rate, Machine Utilization) with percentage points (p.p.)
 */

import ReactECharts from "echarts-for-react";
import type { PeriodComparison, PeriodWindow } from "../../../data/calculations/periodEngine";
import {
  CHART_COLORS,
  tooltipStyle,
  axisLabelStyle,
  yAxisStyle,
  xAxisCategoryStyle,
  gridStyle,
  abbreviateNumber,
  formatCompactQuantity,
  formatExactQuantity,
} from "./chartTheme";

interface Props {
  comparison: PeriodComparison;
  periodWindow?: PeriodWindow;
}

export function PeriodComparisonChart({ comparison, periodWindow }: Props) {
  if (!comparison.hasPreviousData) {
    return (
      <div className="period-comparison-empty">
        <span className="period-comparison-empty__icon">ℹ</span>
        <div>
          <h4>Prior Period Comparison Inactive</h4>
          <p>
            {periodWindow?.preset === "all-time"
              ? "All-time dataset is selected. Choose a specific period preset (e.g. Current Month, Previous Month, Current Quarter) or Custom Range to compare against preceding data."
              : "No records found in the preceding period window for comparison."}
          </p>
        </div>
      </div>
    );
  }

  const {
    achievement,
    rejectionRate,
    machineUtilization,
    production,
    target,
    productionLoss,
    downtime,
    rejection,
  } = comparison;

  const volumeCategories = [
    "Production",
    "Target",
    "Loss (NOS)",
    "Downtime (min)",
    "Rejection",
  ];

  const currentValues = [
    production.current,
    target.current,
    productionLoss.current,
    downtime.current,
    rejection.current,
  ];

  const previousValues = [
    production.previous,
    target.previous,
    productionLoss.previous,
    downtime.previous,
    rejection.previous,
  ];

  const deltas = [
    production,
    target,
    productionLoss,
    downtime,
    rejection,
  ];

  const chartOption = {
    grid: gridStyle({ left: 75, right: 30, top: 35, bottom: 40 }),
    tooltip: {
      trigger: "axis",
      ...tooltipStyle,
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const dataIndex = params[0].dataIndex;
        const metricName = volumeCategories[dataIndex];
        const delta = deltas[dataIndex];
        const prevCompact = formatCompactQuantity(delta.previous);
        const prevExact = formatExactQuantity(delta.previous);
        const currCompact = formatCompactQuantity(delta.current);
        const currExact = formatExactQuantity(delta.current);
        const deltaText = delta.formattedDelta;
        return `
          <div style="font-weight: 600; margin-bottom: 4px;">${metricName}</div>
          <div style="color: #64748B;">Previous: <span style="color: #0F172A; font-weight: 500;"><strong>${prevCompact}</strong> (${prevExact})</span></div>
          <div style="color: #2563EB;">Current: <span style="color: #0F172A; font-weight: 500;"><strong>${currCompact}</strong> (${currExact})</span></div>
          <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #E2E8F0; font-weight: 600; color: ${delta.varianceStatus === "good" ? "#16A34A" : delta.varianceStatus === "critical" ? "#DC2626" : "#D97706"};">
            Delta: ${deltaText} (${delta.deltaAbs >= 0 ? "+" : ""}${formatCompactQuantity(delta.deltaAbs)} / ${delta.deltaAbs >= 0 ? "+" : ""}${formatExactQuantity(delta.deltaAbs)})
          </div>
        `;
      },
    },
    legend: {
      data: ["Previous Period", "Current Period"],
      top: 0,
      textStyle: { color: CHART_COLORS.text, fontFamily: "'Inter', sans-serif" },
    },
    xAxis: {
      ...xAxisCategoryStyle,
      data: volumeCategories,
      axisLabel: axisLabelStyle,
    },
    yAxis: {
      ...yAxisStyle,
      axisLabel: {
        ...axisLabelStyle,
        formatter: (val: number) => abbreviateNumber(val),
      },
    },
    series: [
      {
        name: "Previous Period",
        type: "bar",
        data: previousValues,
        itemStyle: {
          color: "#64748B",
          borderRadius: [3, 3, 0, 0],
        },
      },
      {
        name: "Current Period",
        type: "bar",
        data: currentValues,
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#22D3EE" },
              { offset: 1, color: "rgba(34, 211, 238, 0.4)" },
            ],
          },
          borderRadius: [3, 3, 0, 0],
        },
      },
    ],
  };

  return (
    <div className="period-comparison-container">
      <div className="period-comparison-badges">
        <div className={`period-badge period-badge--${achievement.varianceStatus}`}>
          <span className="period-badge__title">Achievement Movement</span>
          <div className="period-badge__values">
            <span className="period-badge__current">{achievement.formattedCurrent}</span>
            <span className="period-badge__prev">was {achievement.formattedPrevious}</span>
          </div>
          <span className="period-badge__delta">{achievement.formattedDelta}</span>
        </div>

        <div className={`period-badge period-badge--${rejectionRate.varianceStatus}`}>
          <span className="period-badge__title">Rejection Rate Movement</span>
          <div className="period-badge__values">
            <span className="period-badge__current">{rejectionRate.formattedCurrent}</span>
            <span className="period-badge__prev">was {rejectionRate.formattedPrevious}</span>
          </div>
          <span className="period-badge__delta">{rejectionRate.formattedDelta}</span>
        </div>

        <div className={`period-badge period-badge--${machineUtilization.varianceStatus}`}>
          <span className="period-badge__title">Utilization Movement</span>
          <div className="period-badge__values">
            <span className="period-badge__current">{machineUtilization.formattedCurrent}</span>
            <span className="period-badge__prev">was {machineUtilization.formattedPrevious}</span>
          </div>
          <span className="period-badge__delta">{machineUtilization.formattedDelta}</span>
        </div>
      </div>

      <div className="period-comparison-chart-wrapper">
        <ReactECharts
          option={chartOption}
          style={{ height: "240px", width: "100%" }}
          opts={{ renderer: "canvas" }}
        />
      </div>
    </div>
  );
}

