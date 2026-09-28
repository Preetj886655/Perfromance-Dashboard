/**
 * DowntimeRootCauseSlide — SLIDE 5: DOWNTIME ROOT CAUSE
 *
 * Drill-down mental model: Cause → Work Center → Machine.
 * Shows where downtime is happening across business dimensions.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import {
  CHART_COLORS,
  tooltipStyle,
  truncateLabel,
  xAxisCategoryStyle,
  yAxisStyle,
  gridStyle,
  axisLabelStyle,
  formatCompactQuantity,
  formatExactQuantity,
} from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
}

function buildBarOption(
  data: Array<{ key: string; minutes: number }>,
  title: string,
  color: string,
  labelTruncate = 14,
) {
  return {
    grid: gridStyle({ left: 90, bottom: 50 }),
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0];
        const val = Number(p.value);
        return `<div style="font-weight: 600;">${p.axisValueLabel || p.name}</div><div>${title}: <strong>${formatCompactQuantity(val)} min</strong> <span style="font-size: 11px; color: #64748B;">(${formatExactQuantity(val)} min)</span></div>`;
      },
    },
    xAxis: {
      ...xAxisCategoryStyle,
      data: data.map((d) => truncateLabel(d.key, labelTruncate)),
      axisLabel: { ...axisLabelStyle, rotate: 25 },
    },
    yAxis: yAxisStyle,
    series: [
      {
        name: title,
        type: "bar",
        data: data.map((d) => Math.round(d.minutes)),
        itemStyle: { color },
        label: { show: false },
      },
    ],
  };
}

export function DowntimeRootCauseSlide({ analytics }: Props) {
  const { downtime, downtimeByWorkCenter, downtimeByStage, downtimeByShift } = analytics;

  const topWc = downtimeByWorkCenter.slice(0, 10);
  const topStage = downtimeByStage.slice(0, 10);
  const topMachine = downtime.byMachine.slice(0, 10);

  const rootCause = downtime.byReason[0]?.key ?? null;
  const rootCauseMinutes = downtime.byReason[0]?.minutes ?? 0;

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Root Cause"
          value={rootCause ? truncateLabel(rootCause, 16) : "N/A"}
          exactValue={rootCause ? `${formatCompactQuantity(rootCauseMinutes)} min` : undefined}
          target={rootCause ? `${formatExactQuantity(rootCauseMinutes)} min` : ""}
          status="Critical"
        />
        <KpiCard
          label="Work Centers w/ Downtime"
          value={String(downtimeByWorkCenter.length)}
          target="Distinct business units"
          status={downtimeByWorkCenter.length > 0 ? "Warning" : "Good"}
        />
        <KpiCard
          label="Stages w/ Downtime"
          value={String(downtimeByStage.length)}
          target="Process stages"
        />
        <KpiCard
          label="Shifts Impacted"
          value={String(downtimeByShift.length)}
          target="Of selected shifts"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {topStage.length > 0 && (
          <ChartCard title="Downtime by Stage" eyebrow="Process">
            <ReactECharts option={buildBarOption(topStage, "Stage", CHART_COLORS.downtime)} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {topWc.length > 0 && (
          <ChartCard title="Downtime by Work Center" eyebrow="Business unit">
            <ReactECharts option={buildBarOption(topWc, "Work Center", CHART_COLORS.workcenter, 16)} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {topMachine.length > 0 && (
          <ChartCard title="Downtime by Machine (raw)" eyebrow="Equipment">
            <ReactECharts option={buildBarOption(topMachine, "Machine", CHART_COLORS.machine)} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
      </div>
    </div>
  );
}
