/**
 * TargetGapAnalysisSlide Component
 *
 * "Target / Achievement / Gap Analysis" analytics section for Patil Group Manufacturing Dashboard.
 * Combines:
 * - 4 Top KPI Cards (Total Target, Total Achieved, Yet to Achieve, Average Achievement)
 * - Period Switcher (Monthly, Weekly, Quarterly, Yearly) synchronized with global filters
 * - Combined ECharts Chart:
 *     Group 1: Target (neutral gray bar)
 *     Group 2: Actual (red bar, side-by-side, NOT stacked)
 *     Overlay: Achievement % (blue line with circular nodes and data labels)
 * - Interactive multi-metric tooltip showing Target, Actual, Achievement %, and informational Gap.
 * - Info alert footer.
 */

import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { DprRecord } from "../../../data/normalization/normalizeDprData";
import type { FilterState } from "../../../pages/ManufacturingDashboard";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { calculateTargetAchievementGap } from "../../../data/calculations/targetAchievementGap";
import {
  formatCompactQuantity,
  formatExactQuantity,
  formatPercentage,
  axisLabelStyle,
  yAxisStyle,
  xAxisCategoryStyle,
  gridStyle,
  tooltipStyle,
} from "./chartTheme";

type PeriodOption = "monthly" | "weekly" | "quarterly" | "yearly";

interface Props {
  records?: DprRecord[];
  dateRange?: { start: string; end: string };
  period?: string;
  filters?: FilterState;
  analytics?: DashboardAnalytics;
  onPeriodChange?: (period: PeriodOption) => void;
}

export function TargetGapAnalysisSlide({
  records = [],
  dateRange,
  period,
  filters,
  analytics,
  onPeriodChange,
}: Props) {
  // Determine effective date range
  const effectiveDateRange = useMemo(() => {
    if (dateRange?.start && dateRange?.end) return dateRange;
    if (analytics?.dateRange?.start && analytics?.dateRange?.end) return analytics.dateRange;
    if (filters?.dateFrom && filters?.dateTo) {
      return { start: filters.dateFrom, end: filters.dateTo };
    }
    return { start: "1900-01-01", end: "2099-12-31" };
  }, [dateRange, analytics?.dateRange, filters?.dateFrom, filters?.dateTo]);

  // Determine effective records
  const effectiveRecords = useMemo(() => {
    if (records && records.length > 0) return records;
    return [];
  }, [records]);

  // Synchronize local period state with incoming prop
  const currentPeriod = (period || filters?.period || "monthly").toLowerCase() as PeriodOption;
  const [localPeriod, setLocalPeriod] = useState<PeriodOption>(currentPeriod);

  const activePeriod: PeriodOption =
    currentPeriod === "weekly" ||
    currentPeriod === "quarterly" ||
    currentPeriod === "yearly" ||
    currentPeriod === "monthly"
      ? currentPeriod
      : localPeriod;

  const handlePeriodSwitch = (newPeriod: PeriodOption) => {
    setLocalPeriod(newPeriod);
    onPeriodChange?.(newPeriod);
  };

  // Compute Target / Achievement / Gap summary & series
  const summary = useMemo(() => {
    return calculateTargetAchievementGap(
      effectiveRecords,
      effectiveDateRange,
      activePeriod
    );
  }, [effectiveRecords, effectiveDateRange, activePeriod]);

  const {
    totalTarget,
    totalAchieved,
    yetToAchieve,
    achievementPct,
    remainingPct,
    averageAchievement,
    series,
  } = summary;

  // Chart configuration
  const chartOption = useMemo(() => {
    if (!series || series.length === 0) {
      return {
        title: {
          text: "No manufacturing records found for the selected filters",
          left: "center",
          top: "middle",
          textStyle: { color: "#64748B", fontSize: 14, fontWeight: "normal" },
        },
      };
    }

    const categories = series.map((s) => s.label);
    const targetData = series.map((s) => s.target);
    const achievedData = series.map((s) => s.achieved);
    const lineData = series.map((s) => Number(s.achievementPct.toFixed(1)));

    return {
      grid: gridStyle({
        top: 45,
        bottom: 50,
        left: 65,
        right: 65,
      }),
      tooltip: {
        trigger: "axis",
        ...tooltipStyle,
        axisPointer: {
          type: "shadow",
          shadowStyle: { color: "rgba(148, 163, 184, 0.12)" },
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const dataIndex = params[0].dataIndex;
          const item = series[dataIndex];
          if (!item) return "";

          const formattedTargetCompact = formatCompactQuantity(item.target);
          const formattedTargetExact = formatExactQuantity(item.target);
          const formattedAchievedCompact = formatCompactQuantity(item.achieved);
          const formattedAchievedExact = formatExactQuantity(item.achieved);
          const formattedGapCompact = formatCompactQuantity(item.gap);
          const formattedGapExact = formatExactQuantity(item.gap);
          const formattedAchPct = formatPercentage(item.achievementPct, 2);

          return `
            <div style="font-family: Inter, sans-serif; min-width: 220px; padding: 4px 2px;">
              <div style="font-weight: 700; color: #0F172A; font-size: 13px; margin-bottom: 8px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px;">
                ${item.label}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 12px;">
                <span style="display: flex; align-items: center; gap: 6px; color: #64748B;">
                  <span style="width: 10px; height: 10px; background-color: #A3A3A3; border-radius: 2px; display: inline-block;"></span>
                  Target:
                </span>
                <span style="font-weight: 600; color: #1E293B; font-variant-numeric: tabular-nums;">
                  ${formattedTargetCompact} <span style="font-size: 11px; color: #64748B; font-weight: normal;">(${formattedTargetExact} NOS)</span>
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 12px;">
                <span style="display: flex; align-items: center; gap: 6px; color: #64748B;">
                  <span style="width: 10px; height: 10px; background-color: #EF4444; border-radius: 2px; display: inline-block;"></span>
                  Actual:
                </span>
                <span style="font-weight: 600; color: #DC2626; font-variant-numeric: tabular-nums;">
                  ${formattedAchievedCompact} <span style="font-size: 11px; color: #64748B; font-weight: normal;">(${formattedAchievedExact} NOS)</span>
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; pt: 4px; border-top: 1px dashed #E2E8F0; padding-top: 5px; font-size: 12px;">
                <span style="display: flex; align-items: center; gap: 6px; color: #2563EB; font-weight: 600;">
                  <span style="width: 10px; height: 3px; background-color: #2563EB; display: inline-block;"></span>
                  Achievement %:
                </span>
                <span style="font-weight: 700; color: #2563EB; font-size: 13px; font-variant-numeric: tabular-nums;">
                  ${formattedAchPct}
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 3px; font-size: 11px; color: #64748B;">
                <span>Gap:</span>
                <span style="font-weight: 600; color: #475569;">${formattedGapCompact} (${formattedGapExact} NOS)</span>
              </div>
            </div>
          `;
        },
      },
      legend: {
        show: false, // Custom styled legend rendered in header
      },
      xAxis: {
        ...xAxisCategoryStyle,
        data: categories,
        axisLabel: {
          ...axisLabelStyle,
          color: "#475569",
          fontSize: 12,
        },
        axisTick: { alignWithLabel: true },
      },
      yAxis: [
        {
          ...yAxisStyle,
          type: "value",
          name: "Production (NOS)",
          nameTextStyle: {
            color: "#64748B",
            fontSize: 12,
            align: "right",
            padding: [0, 8, 4, 0],
          },
          axisLabel: {
            ...axisLabelStyle,
            formatter: (val: number) => formatCompactQuantity(val),
          },
          splitLine: {
            show: true,
            lineStyle: { color: "#F1F5F9", type: "solid" },
          },
        },
        {
          ...yAxisStyle,
          type: "value",
          name: "Achievement %",
          nameTextStyle: {
            color: "#64748B",
            fontSize: 12,
            align: "left",
            padding: [0, 0, 4, 8],
          },
          min: 0,
          axisLabel: {
            ...axisLabelStyle,
            formatter: "{value}%",
          },
          splitLine: { show: false },
        },
      ],
      series: [
        // Group 1: Target Bar (Gray)
        {
          name: "Target",
          type: "bar",
          yAxisIndex: 0,
          data: targetData,
          itemStyle: {
            color: "#A3A3A3",
            borderRadius: [4, 4, 0, 0],
          },
          barGap: "15%",
          barCategoryGap: "35%",
          label: {
            show: true,
            position: "top",
            formatter: (p: any) => {
              const val = Number(p.value || 0);
              return val > 0 ? formatCompactQuantity(val) : "";
            },
            color: "#475569",
            fontSize: 10,
            fontWeight: 600,
          },
        },
        // Group 2: Actual Bar (Red, side-by-side, NOT stacked)
        {
          name: "Actual",
          type: "bar",
          yAxisIndex: 0,
          data: achievedData,
          itemStyle: {
            color: "#EF4444",
            borderRadius: [4, 4, 0, 0],
          },
          label: {
            show: true,
            position: "top",
            formatter: (p: any) => {
              const val = Number(p.value || 0);
              return val > 0 ? formatCompactQuantity(val) : "";
            },
            color: "#DC2626",
            fontSize: 10,
            fontWeight: 600,
          },
        },
        // Overlay Line: Achievement % (Blue)
        {
          name: "Achievement %",
          type: "line",
          yAxisIndex: 1,
          data: lineData,
          lineStyle: {
            width: 3,
            color: "#2563EB",
          },
          itemStyle: {
            color: "#2563EB",
            borderColor: "#FFFFFF",
            borderWidth: 2,
          },
          symbol: "circle",
          symbolSize: 8,
          label: {
            show: true,
            position: "top",
            formatter: (p: any) => `${p.value}%`,
            color: "#1D4ED8",
            fontWeight: 700,
            fontSize: 11,
            backgroundColor: "#FFFFFF",
            padding: [2, 5],
            borderRadius: 4,
            borderColor: "#BFDBFE",
            borderWidth: 1,
            shadowColor: "rgba(0,0,0,0.06)",
            shadowBlur: 3,
          },
          z: 10,
        },
      ],
    };
  }, [series]);

  return (
    <div className="target-gap-section" role="region" aria-label="Target / Achievement / Gap Analysis">
      <div className="target-gap-card">
        {/* Section Header */}
        <div className="target-gap-header">
          <div className="target-gap-header__title-group">
            <div className="target-gap-header__icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M18 17V9" />
                <path d="M13 17V5" />
                <path d="M8 17v-3" />
                <circle cx="8" cy="14" r="1" fill="#2563EB" />
                <circle cx="13" cy="5" r="1" fill="#2563EB" />
                <circle cx="18" cy="9" r="1" fill="#2563EB" />
                <path d="M8 14l5-9 5 4" stroke="#2563EB" strokeWidth="1.5" strokeDasharray="2 2" />
              </svg>
            </div>
            <div>
              <h2 className="target-gap-header__title">Target / Achievement / Gap Analysis</h2>
              <p className="target-gap-header__subtitle">
                Production performance with target and actual output (based on selected filters)
              </p>
            </div>
          </div>

          {/* Period Switcher Segmented Buttons */}
          <div className="target-gap-period-pills" role="radiogroup" aria-label="Period Granularity">
            {(["monthly", "weekly", "quarterly", "yearly"] as PeriodOption[]).map((p) => {
              const isActive = activePeriod === p;
              const label = p.charAt(0).toUpperCase() + p.slice(1);
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  className={`target-gap-pill ${isActive ? "target-gap-pill--active" : ""}`}
                  onClick={() => handlePeriodSwitch(p)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Top 4 KPI Cards */}
        <div className="target-gap-kpi-grid">
          {/* Card 1: Total Target */}
          <div className="target-gap-kpi-card">
            <div className="target-gap-kpi-card__header">
              <div className="target-gap-kpi-card__icon-box target-gap-kpi-card__icon-box--blue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                  <path d="m3.3 7 8.7 5 8.7-5" />
                  <path d="M12 22V12" />
                </svg>
              </div>
              <span className="target-gap-kpi-card__label">Total Target</span>
            </div>
            <div className="target-gap-kpi-card__value-group">
              <div className="target-gap-kpi-card__primary-value">
                {formatCompactQuantity(totalTarget)}
              </div>
              <div className="target-gap-kpi-card__exact-value">
                ({formatExactQuantity(totalTarget)} NOS)
              </div>
            </div>
            <div className="target-gap-kpi-card__unit">(NOS)</div>
          </div>

          {/* Card 2: Total Achieved */}
          <div className="target-gap-kpi-card">
            <div className="target-gap-kpi-card__header">
              <div className="target-gap-kpi-card__icon-box target-gap-kpi-card__icon-box--green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20V10" />
                  <path d="M18 20V4" />
                  <path d="M6 20v-4" />
                </svg>
              </div>
              <span className="target-gap-kpi-card__label">Total Achieved</span>
            </div>
            <div className="target-gap-kpi-card__value-group">
              <div className="target-gap-kpi-card__primary-value target-gap-kpi-card__primary-value--green">
                {formatCompactQuantity(totalAchieved)}
              </div>
              <div className="target-gap-kpi-card__exact-value">
                ({formatExactQuantity(totalAchieved)} NOS)
              </div>
            </div>
            <div className="target-gap-kpi-card__sub-row">
              <span className="target-gap-kpi-card__unit">(NOS)</span>
              <span className="target-gap-badge target-gap-badge--green">
                {achievementPct.toFixed(1)}% of target
              </span>
            </div>
          </div>

          {/* Card 3: Yet to Achieve */}
          <div className="target-gap-kpi-card">
            <div className="target-gap-kpi-card__header">
              <div className="target-gap-kpi-card__icon-box target-gap-kpi-card__icon-box--red">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
              </div>
              <span className="target-gap-kpi-card__label">Yet to Achieve</span>
            </div>
            <div className="target-gap-kpi-card__value-group">
              <div className="target-gap-kpi-card__primary-value target-gap-kpi-card__primary-value--red">
                {formatCompactQuantity(yetToAchieve)}
              </div>
              <div className="target-gap-kpi-card__exact-value">
                ({formatExactQuantity(yetToAchieve)} NOS)
              </div>
            </div>
            <div className="target-gap-kpi-card__sub-row">
              <span className="target-gap-kpi-card__unit">(NOS)</span>
              <span className="target-gap-badge target-gap-badge--red">
                {remainingPct.toFixed(1)}% of target
              </span>
            </div>
          </div>

          {/* Card 4: Average Achievement */}
          <div className="target-gap-kpi-card">
            <div className="target-gap-kpi-card__header">
              <div className="target-gap-kpi-card__icon-box target-gap-kpi-card__icon-box--purple">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                  <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                  <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                  <path d="M10 6h4" />
                  <path d="M10 10h4" />
                  <path d="M10 14h4" />
                  <path d="M10 18h4" />
                </svg>
              </div>
              <span className="target-gap-kpi-card__label">Average Achievement</span>
            </div>
            <div className="target-gap-kpi-card__value-group">
              <div className="target-gap-kpi-card__primary-value">
                {formatCompactQuantity(averageAchievement)}
              </div>
              <div className="target-gap-kpi-card__exact-value">
                ({formatExactQuantity(Math.round(averageAchievement))} NOS per period)
              </div>
            </div>
            <div className="target-gap-kpi-card__unit">(NOS per period)</div>
          </div>
        </div>

        {/* Custom Legend */}
        <div className="target-gap-legend">
          <div className="target-gap-legend__item">
            <span className="target-gap-legend__box target-gap-legend__box--gray"></span>
            <span>Target</span>
          </div>
          <div className="target-gap-legend__item">
            <span className="target-gap-legend__box target-gap-legend__box--red"></span>
            <span>Actual</span>
          </div>
          <div className="target-gap-legend__item">
            <span className="target-gap-legend__line-indicator">
              <span className="target-gap-legend__line"></span>
              <span className="target-gap-legend__dot"></span>
            </span>
            <span>Achievement %</span>
          </div>
        </div>

        {/* Combined Chart */}
        <div className="target-gap-chart-wrapper">
          <ReactECharts
            option={chartOption}
            style={{ width: "100%", height: "450px" }}
            notMerge
            lazyUpdate
          />
        </div>

        {/* Informational Callout Footer */}
        <div className="target-gap-info-alert">
          <div className="target-gap-info-alert__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>
          <div className="target-gap-info-alert__text">
            The bar chart shows Target and Actual for the selected period. The line represents Achievement % (Actual / Target).
          </div>
        </div>
      </div>
    </div>
  );
}
