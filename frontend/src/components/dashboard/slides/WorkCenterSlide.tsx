/**
 * WorkCenterSlide Component
 * Work center and machine performance.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";

interface Props {
  analytics: DashboardAnalytics;
}

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
}

export function WorkCenterSlide({ analytics }: Props) {
  const { byWorkCenter, downtimeByWorkCenter, downtime } = analytics;

  // Work Center is the normalized business dimension; Machine stays a separate raw dimension.
  const topWorkCenters = downtimeByWorkCenter.slice(0, 6);

  const wcOption = {
    grid: { left: 80, right: 20, top: 20, bottom: 40 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: topWorkCenters.map((w) => (w.key.length > 15 ? `${w.key.slice(0, 13)}...` : w.key)),
      axisLabel: { fontSize: 9 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: [
      {
        type: "bar",
        data: topWorkCenters.map((w) => w.minutes),
        itemStyle: { color: "#7c3aed" },
      },
    ],
  };

  const topMachines = downtime.byMachine.slice(0, 6);

  const machineOption = {
    grid: { left: 80, right: 20, top: 20, bottom: 60 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: topMachines.map((m) => (m.key.length > 15 ? `${m.key.slice(0, 13)}...` : m.key)),
      axisLabel: { fontSize: 9, rotate: 24 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: [
      {
        type: "bar",
        data: topMachines.map((m) => m.minutes),
        itemStyle: { color: "#f97316" },
      },
    ],
  };

  const wcProduction = byWorkCenter.slice(0, 6);

  const wcProductionOption = {
    grid: { left: 80, right: 20, top: 20, bottom: 40 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: wcProduction.map((w) => (w.key.length > 15 ? `${w.key.slice(0, 13)}...` : w.key)),
      axisLabel: { fontSize: 9 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: [
      {
        type: "bar",
        data: wcProduction.map((w) => w.production),
        itemStyle: { color: "#10b981" },
      },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Top Work Center (downtime)"
          value={topWorkCenters[0]?.key.slice(0, 12) || "N/A"}
          target={topWorkCenters[0] ? `${formatNumber(topWorkCenters[0].minutes)} min` : ""}
        />
        <KpiCard
          label="Work Centers"
          value={String(byWorkCenter.length)}
          target="Mapped work centers with data"
        />
        <KpiCard
          label="Machines (raw)"
          value={String(downtime.byMachine.length)}
          target="Unique machines"
        />
        <KpiCard
          label="Top Machine (downtime)"
          value={downtime.byMachine[0]?.key.slice(0, 12) || "N/A"}
          target={downtime.byMachine[0] ? `${formatNumber(downtime.byMachine[0].minutes)} min` : ""}
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {wcProduction.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Production by Work Center</div>
            <ReactECharts option={wcProductionOption} style={{ height: "230px" }} notMerge />
          </div>
        )}

        {topWorkCenters.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Downtime by Work Center</div>
            <ReactECharts option={wcOption} style={{ height: "230px" }} notMerge />
          </div>
        )}

        {topMachines.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Downtime by Machine (raw dimension)</div>
            <ReactECharts option={machineOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
      </div>
    </div>
  );
}
