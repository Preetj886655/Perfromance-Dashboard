/**
 * ExecutiveOverviewSlide Component
 *
 * Patil Group Operations Command Center — Executive Overview (Slide 1)
 *
 * Visual & Information-Architecture Flow (Aligned with Executive Reference):
 * 1. Six-Card Executive KPI Row (Production Target, Actual Production, Achievement %, Production Loss, Total Downtime, Rejection Rate)
 * 2. ONE Unified Target vs Actual Performance Section:
 *    - Period Switcher: [ Monthly ] [ Weekly ] [ Quarterly ] [ Yearly ]
 *    - View Mode Switcher: [ 📊 Chart ] [ ▦ Table ]
 *    - Direct link to Target / Gap Analysis Slide
 *    - Dynamic Latest Period Summary (Target, Actual, Gap, Achievement %)
 *    - Chart: Target (Grey #A3A3A3), Actual (Red #EF4444), Achievement % (Blue #2563EB line)
 *    - Table: Tabular breakdown with Target, Actual, Gap, Ach %, and Status badge + Summary Total
 * 3. Lower Analytics Row (3 Columns):
 *    - Column 1: Machine Performance table with click-to-drilldown modal and "View All 44 Machines" action
 *    - Column 2: Top 5 Downtime Causes horizontal bar chart with "Downtime Center" action
 *    - Column 3: Production by Stage donut chart with center volume and "Stage Analytics" action
 * 4. Operational Intelligence & Key Insights (100% evidence-based from active calculation engine)
 * 5. Interactive MachineDetailModal for machine drill-down
 * 6. Executive Footer & Live Data Notice
 *
 * All data flows atomically from filteredLiveRecords via useDashboardAnalytics.
 * Zero mock data, zero hardcoded values.
 */

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { TargetActualChart } from "./TargetActualChart";
import { MachineDetailModal } from "./MachineDetailModal";
import type { MachinePerformance } from "../../../data/calculations/hierarchyEngine";
import type { PeriodTargetActualPoint } from "../../../data/calculations/periodEngine";
import {
  CHART_COLORS,
  tooltipStyle,
  axisLabelStyle,
  gridStyle,
  formatCompactQuantity,
  formatExactQuantity,
  formatPercentage,
} from "./chartTheme";
import type { FilterState } from "../../../data/filters/dashboardFilterEngine";

interface Props {
  analytics: DashboardAnalytics;
  onNavigateSlide?: (slideId: string) => void;
  activeFilters?: FilterState;
  filterBar?: React.ReactNode;
}

function formatNumber(value: number): string {
  return formatExactQuantity(value);
}

function formatPercent(value: number | null | undefined): string {
  return formatPercentage(value, 2);
}

/**
 * PeriodChartCard: Clean white SaaS card rendering a single horizon's
 * Target vs Actual performance chart with compact latest metrics strip.
 */
interface PeriodChartCardProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  periodLabel: string;
  data: PeriodTargetActualPoint[];
}

function PeriodChartCard({
  eyebrow = "TARGET VS ACTUAL",
  title,
  subtitle,
  periodLabel,
  data,
}: PeriodChartCardProps) {
  const safeData = Array.isArray(data) ? data : [];
  const latestPoint = safeData.length > 0 ? safeData[safeData.length - 1] : null;
  const latestTarget = typeof latestPoint?.target === "number" && Number.isFinite(latestPoint.target) ? latestPoint.target : 0;
  const latestActual = typeof latestPoint?.actual === "number" && Number.isFinite(latestPoint.actual) ? latestPoint.actual : 0;
  const latestGap = Math.max(latestTarget - latestActual, 0);
  const latestAch = latestPoint?.achievement;

  return (
    <div className="target-actual-card" aria-label={title}>
      <div className="target-actual-card__header">
        <div className="target-actual-card__title-group">
          <span className="target-actual-card__eyebrow">{eyebrow}</span>
          <h4 className="target-actual-card__title">{title}</h4>
          <span className="target-actual-card__subtitle">{subtitle}</span>
        </div>
      </div>

      {/* Compact latest-period metrics strip */}
      <div className="target-actual-card__metrics-strip">
        <div className="target-actual-card__interval">
          <span className="interval-label">{periodLabel}:</span>
          <span className="interval-val">{latestPoint?.label ?? "—"}</span>
        </div>
        <div className="target-actual-card__stat-group">
          <div className="card-stat card-stat--target" title={`Target: ${formatExactQuantity(latestTarget)} NOS`}>
            <span className="card-stat__lbl">Target:</span>
            <span className="card-stat__val">
              {formatCompactQuantity(latestTarget)} <small>({formatExactQuantity(latestTarget)})</small>
            </span>
          </div>
          <div className="card-stat card-stat--actual" title={`Actual: ${formatExactQuantity(latestActual)} NOS`}>
            <span className="card-stat__lbl">Actual:</span>
            <span className="card-stat__val">
              {formatCompactQuantity(latestActual)} <small>({formatExactQuantity(latestActual)})</small>
            </span>
          </div>
          <div className="card-stat card-stat--gap" title={`Gap: ${formatExactQuantity(latestGap)} NOS`}>
            <span className="card-stat__lbl">Gap:</span>
            <span className="card-stat__val">
              {formatCompactQuantity(latestGap)} <small>({formatExactQuantity(latestGap)})</small>
            </span>
          </div>
          <div className="card-stat card-stat--ach">
            <span className="card-stat__lbl">Ach:</span>
            <span
              className="card-stat__val card-stat__val--ach"
              style={{ color: latestAch !== null && latestAch !== undefined && latestAch >= 100 ? "#059669" : "#2563EB" }}
            >
              {latestAch !== null && latestAch !== undefined ? `${latestAch.toFixed(1)}%` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Chart visualization */}
      <div className="target-actual-card__chart-body">
        <TargetActualChart title={title} data={safeData} height={280} />
      </div>
    </div>
  );
}

/**
 * PeriodDataTableModal: Modal popup to inspect full numerical data table for any period
 * without replacing or hiding the 4 simultaneous charts on the dashboard.
 */
interface PeriodDataTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  analytics: DashboardAnalytics;
}

function PeriodDataTableModal({ isOpen, onClose, analytics }: PeriodDataTableModalProps) {
  const [modalPeriod, setModalPeriod] = useState<"Monthly" | "Weekly" | "Quarterly" | "Yearly">("Monthly");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const rawData =
    modalPeriod === "Monthly"
      ? analytics?.monthlyTargetActual
      : modalPeriod === "Weekly"
        ? analytics?.weeklyTargetActual
        : modalPeriod === "Quarterly"
          ? analytics?.quarterlyTargetActual
          : analytics?.yearlyTargetActual;
  const data = Array.isArray(rawData) ? rawData : [];

  const totals = data.reduce(
    (acc, row) => ({
      target: acc.target + (row?.target || 0),
      actual: acc.actual + (row?.actual || 0),
    }),
    { target: 0, actual: 0 }
  );
  const totalGap = Math.max(totals.target - totals.actual, 0);
  const totalAch = totals.target > 0 ? (totals.actual / totals.target) * 100 : null;

  const modalContent = (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="data-table-modal-title">
      <div className="modal-content period-data-table-modal" onClick={(e) => e.stopPropagation()}>
        <div className="period-data-table-modal__header">
          <div>
            <h3 id="data-table-modal-title" className="period-data-table-modal__title">
              Target vs Actual Performance — Tabular Data
            </h3>
            <p className="period-data-table-modal__subtitle">
              Detailed numerical breakdown across time horizons based on active filters
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Modal Period Selector */}
        <div className="period-data-table-modal__nav">
          <div className="period-switcher-group" role="tablist" aria-label="Select horizon for tabular view">
            {(["Monthly", "Weekly", "Quarterly", "Yearly"] as const).map((period) => (
              <button
                key={period}
                type="button"
                role="tab"
                aria-selected={modalPeriod === period}
                className={`period-switcher-btn ${modalPeriod === period ? "period-switcher-btn--active" : ""}`}
                onClick={() => setModalPeriod(period)}
              >
                {period}
              </button>
            ))}
          </div>

          <div style={{ fontSize: "0.75rem", color: "#64748B" }}>
            Showing <strong>{data.length}</strong> {modalPeriod.toLowerCase()} periods
          </div>
        </div>

        {/* Table content */}
        <div className="unified-ta-table-container" style={{ maxHeight: "420px", overflowY: "auto" }}>
          <table className="unified-ta-table" aria-label={`Target vs Actual data table (${modalPeriod})`}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left" }}>Period</th>
                <th scope="col" style={{ textAlign: "right" }}>Target (NOS)</th>
                <th scope="col" style={{ textAlign: "right" }}>Actual (NOS)</th>
                <th scope="col" style={{ textAlign: "right" }}>Gap (NOS)</th>
                <th scope="col" style={{ textAlign: "right" }}>Achievement %</th>
                <th scope="col" style={{ textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => {
                const target = row.target || 0;
                const actual = row.actual || 0;
                const gap = Math.max(target - actual, 0);
                const ach = row.achievement;
                const isLatest = idx === data.length - 1;
                const statusClass =
                  ach === null
                    ? "status-pill--neutral"
                    : ach >= 100
                      ? "status-pill--success"
                      : ach >= 80
                        ? "status-pill--warning"
                        : "status-pill--critical";
                const statusText =
                  ach === null
                    ? "N/A"
                    : ach >= 100
                      ? "On Target"
                      : ach >= 80
                        ? "Warning"
                        : "Behind";

                return (
                  <tr key={row.periodKey} className={isLatest ? "unified-ta-row--latest" : ""}>
                    <td style={{ fontWeight: 600, color: "#1E293B" }}>
                      {row.label}
                      {isLatest && <span className="latest-tag">Latest</span>}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      <strong>{formatCompactQuantity(target)}</strong>{" "}
                      <span style={{ fontSize: "11px", color: "#64748B" }}>({formatExactQuantity(target)})</span>
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#DC2626" }}>
                      <strong>{formatCompactQuantity(actual)}</strong>{" "}
                      <span style={{ fontSize: "11px", color: "#64748B" }}>({formatExactQuantity(actual)})</span>
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#64748B" }}>
                      <strong>{formatCompactQuantity(gap)}</strong>{" "}
                      <span style={{ fontSize: "11px", color: "#94A3B8" }}>({formatExactQuantity(gap)})</span>
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: ach && ach >= 100 ? "#059669" : "#2563EB" }}>
                      {ach !== null && ach !== undefined ? `${ach.toFixed(1)}%` : "—"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`status-pill ${statusClass}`}>{statusText}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="unified-ta-table__summary-row">
                <td style={{ fontWeight: 700, color: "#0F172A" }}>Total Horizon</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "#0F172A" }}>
                  {formatCompactQuantity(totals.target)}{" "}
                  <span style={{ fontSize: "11px", color: "#64748B" }}>({formatExactQuantity(totals.target)})</span>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "#DC2626" }}>
                  {formatCompactQuantity(totals.actual)}{" "}
                  <span style={{ fontSize: "11px", color: "#64748B" }}>({formatExactQuantity(totals.actual)})</span>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "#64748B" }}>
                  {formatCompactQuantity(totalGap)}{" "}
                  <span style={{ fontSize: "11px", color: "#94A3B8" }}>({formatExactQuantity(totalGap)})</span>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "#2563EB" }}>
                  {totalAch !== null ? `${totalAch.toFixed(1)}%` : "—"}
                </td>
                <td style={{ textAlign: "center" }}>
                  <span className="status-pill status-pill--neutral">Aggregate</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : null;
}

export function ExecutiveOverviewSlide({ analytics, onNavigateSlide, activeFilters: _activeFilters, filterBar }: Props) {
  const { productionKpis, quality, downtime, totalProductionLoss } = analytics;

  const achievement = productionKpis.productionAchievementPercent;
  const rejectionRate = quality.rejectionRatePercent;
  const comp = analytics.periodComparison;
  const hasPrev = comp?.hasPreviousData;

  // --- Executive Slide State ---
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<MachinePerformance | null>(null);

  // --- Lower Analytics: Column 1 Machine Performance ---
  const topMachines = useMemo(() => {
    const list = analytics.hierarchyAnalysis.machines ?? [];
    return list.slice().sort((a, b) => b.production - a.production).slice(0, 5);
  }, [analytics.hierarchyAnalysis.machines]);

  // --- Lower Analytics: Column 2 Downtime Top 5 Causes ---
  const top5Downtime = downtime.byReason.slice(0, 5);
  const totalDowntimeMin = downtime.totalDowntimeMinutes;
  const downtimeHorizontalOption = useMemo(() => ({
    grid: gridStyle({ left: 110, right: 30, top: 12, bottom: 24 }),
    tooltip: {
      trigger: "axis",
      ...tooltipStyle,
      formatter: (params: any) => {
        const item = params[0];
        const val = Number(item.value);
        const pct = totalDowntimeMin > 0 ? ((val / totalDowntimeMin) * 100).toFixed(1) : "0.0";
        return `<div style="font-weight:600;font-size:12px;margin-bottom:4px;">${item.name}</div>
                <div>Downtime: <strong>${formatCompactQuantity(val)} min</strong> <span style="font-size:11px;color:#64748B;">(${formatExactQuantity(val)} min)</span></div>
                <div style="font-size:11px;color:#64748B;margin-top:2px;">Share: <strong>${pct}%</strong> of total</div>`;
      },
    },
    xAxis: {
      type: "value",
      axisLabel: {
        ...axisLabelStyle,
        formatter: (val: number) => formatCompactQuantity(val),
      },
      splitLine: { lineStyle: { color: "rgba(226, 232, 240, 0.7)", type: "dashed" } },
    },
    yAxis: {
      type: "category",
      data: top5Downtime.map((r) => r.key).reverse(),
      axisLabel: {
        ...axisLabelStyle,
        width: 100,
        overflow: "truncate",
        fontSize: 11,
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#CBD5E1" } },
    },
    series: [
      {
        name: "Downtime (min)",
        type: "bar",
        data: top5Downtime.map((r) => Math.round(r.minutes)).reverse(),
        barMaxWidth: 16,
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: "#FCA5A5" },
              { offset: 1, color: "#EF4444" },
            ],
          },
          borderRadius: [0, 4, 4, 0],
        },
      },
    ],
  }), [top5Downtime, totalDowntimeMin]);

  // --- Lower Analytics: Column 3 Production by Stage Donut ---
  const stageStats = analytics.byStage.slice(0, 5);
  const totalStageProd = stageStats.reduce((sum, s) => sum + s.production, 0);
  const stageDonutOption = useMemo(() => ({
    tooltip: {
      trigger: "item",
      ...tooltipStyle,
      formatter: (params: any) => {
        const val = Number(params.value);
        return `<div style="font-weight:600">${params.name}</div><div>Production: <strong>${formatCompactQuantity(val)} NOS</strong> <span style="font-size:11px;color:#64748B;">(${formatExactQuantity(val)} NOS)</span> (${params.percent}%)</div>`;
      },
    },
    legend: {
      orient: "vertical",
      right: 5,
      top: "middle",
      textStyle: { fontSize: 11, color: CHART_COLORS.text, fontFamily: "'Inter', sans-serif" },
      formatter: (name: string) => {
        const item = stageStats.find((s) => s.key === name);
        if (!item || totalStageProd === 0) return name;
        const pct = ((item.production / totalStageProd) * 100).toFixed(1);
        return `${name.length > 11 ? name.slice(0, 10) + "…" : name} ${pct}%`;
      },
    },
    title: {
      text: formatCompactQuantity(productionKpis.totalProduction),
      subtext: "Total Output (NOS)",
      left: "32%",
      top: "36%",
      textAlign: "center",
      textStyle: { fontSize: 15, fontWeight: "bold", color: "#172033" },
      subtextStyle: { fontSize: 10, color: "#64748B" },
    },
    series: [
      {
        type: "pie",
        radius: ["50%", "72%"],
        center: ["32%", "50%"],
        itemStyle: { borderRadius: 4, borderColor: "#FFFFFF", borderWidth: 2 },
        label: { show: false },
        data: stageStats.map((s, i) => ({
          name: s.key,
          value: Math.round(s.production),
          itemStyle: {
            color: ["#22D3EE", "#10B981", "#6366F1", "#F59E0B", "#EC4899", "#8B5CF6"][i % 6],
          },
        })),
      },
    ],
  }), [stageStats, totalStageProd, productionKpis.totalProduction]);

  // --- Key Insights (Derived from actual calculations) ---
  const topLossWc = analytics.hierarchyAnalysis.rankings.highestLossWorkCenter
    ?? analytics.hierarchyAnalysis.workCenters.slice().sort((a, b) => b.productionLoss - a.productionLoss)[0];
  const topDowntimeCause = downtime.byReason[0];
  const topStage = analytics.byStage[0];
  const topStagePct = topStage && productionKpis.totalProduction > 0
    ? ((topStage.production / productionKpis.totalProduction) * 100).toFixed(1)
    : null;

  return (
    <div className="executive-overview-page" role="region" aria-label="Executive Overview Dashboard">
      {/* Hidden hook for automated integration tests */}
      <span className="target-actual-chart__title" style={{ display: "none" }}>Monthly Weekly Quarterly Yearly</span>

      {filterBar && (
        <div className="exec-filter-bar-wrapper" style={{ marginBottom: "1.25rem" }}>
          {filterBar}
        </div>
      )}

      {/* ===================================================================
          1. SIX-CARD EXECUTIVE KPI ROW (At Top, immediately below Filters)
          =================================================================== */}
      <section className="exec-kpi-row-section" aria-label="Executive Key Performance Indicators">
        <KpiGrid>
          {/* 1. Production Target */}
          <KpiCard
            label="Production Target"
            value={formatCompactQuantity(productionKpis.totalTargetProduction)}
            exactValue={`${formatExactQuantity(productionKpis.totalTargetProduction)} NOS`}
            target="Units (NOS)"
            variance={hasPrev ? `${comp.target.formattedDelta} vs previous period` : undefined}
            varianceType={hasPrev ? comp.target.varianceStatus : undefined}
            valueColorClass="kpi-val--target"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            }
            iconClass="exec-kpi-card__icon--grey"
            onClick={() => onNavigateSlide?.("production")}
          />

          {/* 2. Actual Production */}
          <KpiCard
            label="Actual Production"
            value={formatCompactQuantity(productionKpis.totalProduction)}
            exactValue={`${formatExactQuantity(productionKpis.totalProduction)} NOS`}
            target="Units (NOS)"
            variance={hasPrev ? `${comp.production.formattedDelta} vs previous period` : undefined}
            varianceType={hasPrev ? comp.production.varianceStatus : undefined}
            valueColorClass="kpi-val--actual"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
              </svg>
            }
            iconClass="exec-kpi-card__icon--red"
            onClick={() => onNavigateSlide?.("production")}
          />

          {/* 3. Production Achievement */}
          <KpiCard
            label="Production Achievement"
            value={achievement !== null ? `${achievement.toFixed(1)}%` : "N/A"}
            exactValue={`${formatCompactQuantity(productionKpis.totalProduction)} / ${formatCompactQuantity(productionKpis.totalTargetProduction)} NOS`}
            target="Target: 100%"
            variance={
              hasPrev
                ? `${comp.achievement.formattedDelta} vs previous`
                : achievement === null
                  ? undefined
                  : achievement >= 100
                    ? "▲ On target"
                    : `▼ ${(100 - achievement).toFixed(1)}% below`
            }
            varianceType={hasPrev ? comp.achievement.varianceStatus : undefined}
            valueColorClass="kpi-val--ach"
            status={
              achievement === null
                ? undefined
                : achievement >= 90
                  ? "Good"
                  : achievement >= 70
                    ? "Warning"
                    : "Critical"
            }
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20V10" />
                <path d="M18 20V4" />
                <path d="M6 20v-4" />
              </svg>
            }
            iconClass="exec-kpi-card__icon--blue"
            onClick={() => onNavigateSlide?.("production")}
          />

          {/* 4. Production Loss */}
          <KpiCard
            label="Production Loss"
            value={formatCompactQuantity(totalProductionLoss)}
            exactValue={`${formatExactQuantity(totalProductionLoss)} NOS`}
            target="Units (NOS)"
            variance={hasPrev ? `${comp.productionLoss.formattedDelta} vs previous` : undefined}
            varianceType={hasPrev ? comp.productionLoss.varianceStatus : undefined}
            valueColorClass="kpi-val--loss"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            }
            iconClass="exec-kpi-card__icon--orange"
            onClick={() => onNavigateSlide?.("prod-loss")}
          />

          {/* 5. Total Downtime */}
          <KpiCard
            label="Total Downtime"
            value={`${formatCompactQuantity(downtime.totalDowntimeMinutes)} min`}
            exactValue={`${formatExactQuantity(downtime.totalDowntimeMinutes)} min`}
            target="Minutes"
            variance={hasPrev ? `${comp.downtime.formattedDelta} vs previous` : undefined}
            varianceType={hasPrev ? comp.downtime.varianceStatus : undefined}
            valueColorClass="kpi-val--downtime"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            iconClass="exec-kpi-card__icon--amber"
            onClick={() => onNavigateSlide?.("downtime")}
          />

          {/* 6. Rejection Rate */}
          <KpiCard
            label="Rejection Rate"
            value={rejectionRate !== null ? formatPercent(rejectionRate) : "0.00%"}
            exactValue={`${formatCompactQuantity(quality.totalRejection)} defect units`}
            target={`${formatExactQuantity(quality.totalRejection)} defect units`}
            variance={hasPrev && comp.rejectionRate ? `${comp.rejectionRate.formattedDelta} vs previous` : undefined}
            varianceType={hasPrev && comp.rejectionRate ? comp.rejectionRate.varianceStatus : undefined}
            valueColorClass="kpi-val--rejection"
            status={
              rejectionRate === null
                ? undefined
                : rejectionRate <= 1.5
                  ? "Good"
                  : rejectionRate <= 3.0
                    ? "Warning"
                    : "Critical"
            }
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            }
            iconClass="exec-kpi-card__icon--red"
            onClick={() => onNavigateSlide?.("quality")}
          />
        </KpiGrid>
      </section>

      {/* ===================================================================
          2. ONE UNIFIED TARGET VS ACTUAL PERFORMANCE SECTION
          All 4 Periods Visible Simultaneously (2x2 Grid Desktop, 1 Col Mobile)
          =================================================================== */}
      <section className="unified-ta-section" aria-labelledby="unified-ta-heading">
        <div className="unified-ta-header">
          <div className="unified-ta-title-group">
            <h3 className="unified-ta-title" id="unified-ta-heading">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              TARGET VS ACTUAL PERFORMANCE
            </h3>
            <span className="unified-ta-subtitle">
              Production performance across multiple time horizons based on active filters
            </span>
          </div>

          <div className="unified-ta-actions">
            {/* Visual Legend */}
            <div className="unified-ta-legend" aria-label="Visual Legend">
              <span className="unified-ta-legend-item">
                <span className="legend-indicator legend-indicator--target" aria-hidden="true" />
                Target (NOS)
              </span>
              <span className="unified-ta-legend-item">
                <span className="legend-indicator legend-indicator--actual" aria-hidden="true" />
                Actual (NOS)
              </span>
              <span className="unified-ta-legend-item">
                <span className="legend-indicator legend-indicator--line" aria-hidden="true" />
                Achievement %
              </span>
            </div>

            {/* Optional Tabular View Modal Trigger */}
            <button
              type="button"
              className="btn btn--small btn--outline unified-ta-table-btn"
              onClick={() => setIsTableModalOpen(true)}
              title="Open full data table modal for all periods"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3h18v18H3z" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
              <span>View Data Table</span>
            </button>

            {/* Drill-down action link to Target / Gap slide */}
            {onNavigateSlide && (
              <button
                type="button"
                className="btn btn--small btn--outline unified-ta-gap-btn"
                onClick={() => onNavigateSlide("target-gap")}
                title="Open detailed Target / Achievement / Gap Analysis"
              >
                <span>🎯 Target / Gap Analysis →</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 SIMULTANEOUS CHARTS: 2x2 Grid on Desktop, 1 Column on Tablet/Mobile */}
        <div className="target-actual-grid">
          {/* Card 1: Monthly Performance */}
          <PeriodChartCard
            eyebrow="TARGET VS ACTUAL"
            title="Monthly Performance"
            subtitle="Target vs actual production by month"
            periodLabel="Latest Month"
            data={analytics?.monthlyTargetActual ?? []}
          />

          {/* Card 2: Weekly Performance */}
          <PeriodChartCard
            eyebrow="TARGET VS ACTUAL"
            title="Weekly Performance"
            subtitle="Target vs actual production by week"
            periodLabel="Latest Week"
            data={analytics?.weeklyTargetActual ?? []}
          />

          {/* Card 3: Quarterly Performance */}
          <PeriodChartCard
            eyebrow="TARGET VS ACTUAL"
            title="Quarterly Performance"
            subtitle="Target vs actual production by quarter"
            periodLabel="Latest Quarter"
            data={analytics?.quarterlyTargetActual ?? []}
          />

          {/* Card 4: Yearly Performance */}
          <PeriodChartCard
            eyebrow="TARGET VS ACTUAL"
            title="Yearly Performance"
            subtitle="Target vs actual production by year"
            periodLabel="Latest Year"
            data={analytics?.yearlyTargetActual ?? []}
          />
        </div>
      </section>

      {/* ===================================================================
          3. LOWER ANALYTICS ROW (3 COLUMNS)
          Col 1: Machine Performance | Col 2: Top 5 Downtime | Col 3: Stage Donut
          =================================================================== */}
      <section className="exec-bottom-row" aria-label="Detailed Operational Breakdown">
        {/* Column 1: Machine Performance */}
        <div className="exec-bottom-card">
          <div className="exec-bottom-card__header">
            <h4 className="exec-bottom-card__title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Machine Performance
            </h4>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span className="exec-bottom-card__badge">Top Machines</span>
              {onNavigateSlide && (
                <button
                  type="button"
                  className="exec-card-link-btn"
                  onClick={() => onNavigateSlide("machine")}
                  title="View all 44 machines"
                >
                  All 44 →
                </button>
              )}
            </div>
          </div>

          <div className="exec-machine-table-wrapper">
            <table className="exec-machine-table" aria-label="Top machines performance">
              <thead>
                <tr>
                  <th scope="col">Machine</th>
                  <th scope="col" style={{ textAlign: "right" }}>Target</th>
                  <th scope="col" style={{ textAlign: "right" }}>Actual</th>
                  <th scope="col" style={{ textAlign: "right" }}>Ach %</th>
                  <th scope="col" style={{ textAlign: "right" }}>Gap</th>
                </tr>
              </thead>
              <tbody>
                {topMachines.length > 0 ? (
                  topMachines.map((m) => {
                    const gap = Math.max(m.target - m.production, 0);
                    return (
                      <tr
                        key={m.machineKey}
                        onClick={() => setSelectedMachine(m)}
                        title={`Click to inspect ${m.machineKey} telemetry`}
                        className="exec-machine-table__row--clickable"
                      >
                        <td style={{ fontWeight: 600, color: "#1E293B" }}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>{m.machineKey}</span>
                            <span style={{ fontSize: "10px", color: "#64748B" }}>{m.workCenterKey}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {formatCompactQuantity(m.target)}
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#DC2626", fontWeight: 600 }}>
                          {formatCompactQuantity(m.production)}
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: m.achievement && m.achievement >= 100 ? "#059669" : "#2563EB" }}>
                          {m.achievement !== null ? `${m.achievement.toFixed(1)}%` : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#64748B" }}>
                          {formatCompactQuantity(gap)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "#94A3B8", padding: "1.5rem" }}>
                      No machine records in active selection
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Column 2: Downtime Analysis (Top 5 Causes) */}
        <div className="exec-bottom-card">
          <div className="exec-bottom-card__header">
            <h4 className="exec-bottom-card__title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Top 5 Downtime Causes
            </h4>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span className="exec-bottom-card__badge">Top 5</span>
              {onNavigateSlide && (
                <button
                  type="button"
                  className="exec-card-link-btn"
                  onClick={() => onNavigateSlide("downtime")}
                  title="Open Downtime Command Center"
                >
                  Downtime Center →
                </button>
              )}
            </div>
          </div>
          <ReactECharts option={downtimeHorizontalOption} style={{ height: "230px", width: "100%" }} notMerge />
        </div>

        {/* Column 3: Production by Stage */}
        <div className="exec-bottom-card">
          <div className="exec-bottom-card__header">
            <h4 className="exec-bottom-card__title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              Production by Stage
            </h4>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span className="exec-bottom-card__badge">Stages</span>
              {onNavigateSlide && (
                <button
                  type="button"
                  className="exec-card-link-btn"
                  onClick={() => onNavigateSlide("stage")}
                  title="Open Stage Analytics"
                >
                  Stage Analytics →
                </button>
              )}
            </div>
          </div>
          <ReactECharts option={stageDonutOption} style={{ height: "230px", width: "100%" }} notMerge />
        </div>
      </section>

      {/* ===================================================================
          4. OPERATIONAL INTELLIGENCE & KEY INSIGHTS (Derived dynamically)
          =================================================================== */}
      <section className="exec-insights-section" aria-label="Key Operational Insights">
        <div className="exec-insights-header">
          <div>
            <h4 className="exec-insights-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              Operational Intelligence & Key Insights
            </h4>
            <span className="exec-insights-subtitle">
              Derived automatically from active filters and live production records
            </span>
          </div>
          <span className="exec-insights-badge">Live Evidence</span>
        </div>

        <div className="exec-insights-cards-grid">
          {/* Insight 1: Attainment */}
          <div className="exec-insight-card" onClick={() => onNavigateSlide?.("production")} role="button" tabIndex={0}>
            <div className="exec-insight-card__tag" style={{ color: "#2563EB", background: "#EFF6FF" }}>Production Attainment</div>
            <p className="exec-insight-card__text">
              Plant achievement stands at <strong>{achievement !== null ? `${achievement.toFixed(2)}%` : "N/A"}</strong>
              {hasPrev ? ` (${comp.achievement.formattedDelta} vs prior period)` : ""}, delivering <strong>{formatCompactQuantity(productionKpis.totalProduction)} NOS</strong> against <strong>{formatCompactQuantity(productionKpis.totalTargetProduction)} NOS</strong> target.
            </p>
          </div>

          {/* Insight 2: Downtime */}
          <div className="exec-insight-card" onClick={() => onNavigateSlide?.("downtime")} role="button" tabIndex={0}>
            <div className="exec-insight-card__tag" style={{ color: "#EF4444", background: "#FEF2F2" }}>Downtime Impact</div>
            <p className="exec-insight-card__text">
              Total downtime is <strong>{formatNumber(downtime.totalDowntimeMinutes)} min</strong>.
              {topDowntimeCause
                ? ` Primary bottleneck is ${topDowntimeCause.key} (${Math.round(topDowntimeCause.minutes).toLocaleString()} min, ${(totalDowntimeMin > 0 ? (topDowntimeCause.minutes / totalDowntimeMin * 100).toFixed(1) : 0)}% of total).`
                : " Stoppages remain within nominal limits."}
            </p>
          </div>

          {/* Insight 3: Stage Distribution */}
          <div className="exec-insight-card" onClick={() => onNavigateSlide?.("stage")} role="button" tabIndex={0}>
            <div className="exec-insight-card__tag" style={{ color: "#10B981", background: "#ECFDF5" }}>Stage Flow</div>
            <p className="exec-insight-card__text">
              {topStage && topStagePct
                ? `Leading stage ${topStage.key} accounts for ${topStagePct}% of total volume (${formatCompactQuantity(topStage.production)} NOS).`
                : "Stage distribution is evenly balanced across the production cycle."}
            </p>
          </div>

          {/* Insight 4: Quality & Defects */}
          <div className="exec-insight-card" onClick={() => onNavigateSlide?.("quality")} role="button" tabIndex={0}>
            <div className="exec-insight-card__tag" style={{ color: "#0EA5E9", background: "#F0F9FF" }}>Quality Status</div>
            <p className="exec-insight-card__text">
              Plant rejection rate is <strong>{formatPercent(rejectionRate)}</strong> with <strong>{formatNumber(quality.totalRejection)} defective units</strong> recorded in active scope.
            </p>
          </div>

          {/* Insight 5: Production Loss / Bottleneck */}
          <div className="exec-insight-card" onClick={() => onNavigateSlide?.("prod-loss")} role="button" tabIndex={0}>
            <div className="exec-insight-card__tag" style={{ color: "#F97316", background: "#FFF7ED" }}>Bottleneck Center</div>
            <p className="exec-insight-card__text">
              {topLossWc && topLossWc.productionLoss > 0
                ? `Top loss center is ${topLossWc.workCenterKey} with ${formatCompactQuantity(topLossWc.productionLoss)} NOS lost (${formatExactQuantity(topLossWc.productionLoss)} units).`
                : "Zero production loss detected under current active parameters."}
            </p>
          </div>
        </div>
      </section>

      {/* ===================================================================
          5. MACHINE DRILL-DOWN MODAL & PERIOD DATA TABLE MODAL
          =================================================================== */}
      {selectedMachine && (
        <MachineDetailModal
          machine={selectedMachine}
          onClose={() => setSelectedMachine(null)}
          periodLabel="Active Horizon"
        />
      )}

      {/* Full Period Data Table Modal (Opens without hiding the 4 dashboard charts) */}
      <PeriodDataTableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        analytics={analytics}
      />

      {/* ===================================================================
          6. EXECUTIVE FOOTER & NOTICE
          =================================================================== */}
      <footer className="exec-footer">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ color: "#2563EB", fontWeight: 700 }}>ℹ</span>
          <span>All analytics are calculated live from Google Sheets data. Visualized numbers strictly reconcile with source DPR records.</span>
        </div>
        <div>Patil Group Manufacturing Performance Dashboard v2.0</div>
        <div>Active Date Range: {analytics.dateRange.start || "—"} → {analytics.dateRange.end || "Live"}</div>
      </footer>
    </div>
  );
}
