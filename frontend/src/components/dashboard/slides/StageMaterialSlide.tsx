/**
 * StageMaterialSlide Component — SLIDE 6: STAGE & MATERIAL
 * Production and downtime by Stage, plus the material mix.
 * Stage and Material are separate source dimensions — never merged.
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

export function StageMaterialSlide({ analytics }: Props) {
  const { byStage, byMaterial, downtimeByStage } = analytics;

  const topStages = byStage.slice(0, 8);
  const topDowntimeStages = downtimeByStage.slice(0, 8);
  const materials = byMaterial.slice(0, 8);

  const stageOption = {
    grid: { left: 70, right: 20, top: 20, bottom: 50 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: topStages.map((s) => (s.key.length > 12 ? `${s.key.slice(0, 10)}…` : s.key)),
      axisLabel: { fontSize: 9, rotate: 20 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 9 } },
    series: [
      {
        name: "Production",
        type: "bar",
        data: topStages.map((s) => Math.round(s.production)),
        itemStyle: { color: "#0ea5e9" },
      },
    ],
  };

  const stageDowntimeOption = {
    grid: { left: 70, right: 20, top: 20, bottom: 50 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: topDowntimeStages.map((s) => (s.key.length > 12 ? `${s.key.slice(0, 10)}…` : s.key)),
      axisLabel: { fontSize: 9, rotate: 20 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 9 } },
    series: [
      {
        name: "Downtime (min)",
        type: "bar",
        data: topDowntimeStages.map((s) => Math.round(s.minutes)),
        itemStyle: { color: "#ef4444" },
      },
    ],
  };

  const materialOption = {
    tooltip: { trigger: "item" },
    legend: { orient: "vertical", right: 0, top: "middle", textStyle: { fontSize: 10 } },
    series: [
      {
        type: "pie",
        radius: ["45%", "70%"],
        center: ["38%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: "#fff", borderWidth: 2 },
        label: { show: false },
        data: materials.map((m, i) => ({
          name: m.key,
          value: Math.round(m.production),
          itemStyle: { color: ["#4f46e5", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#64748b", "#ec4899"][i % 8] },
        })),
      },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Top Stage (production)"
          value={byStage[0]?.key.slice(0, 14) || "N/A"}
          target={byStage[0] ? `${formatNumber(byStage[0].production)} units` : ""}
        />
        <KpiCard
          label="Top Stage (downtime)"
          value={downtimeByStage[0]?.key.slice(0, 14) || "N/A"}
          target={downtimeByStage[0] ? `${formatNumber(downtimeByStage[0].minutes)} min` : ""}
        />
        <KpiCard
          label="Top Material"
          value={byMaterial[0]?.key.slice(0, 14) || "N/A"}
          target={byMaterial[0] ? `${formatNumber(byMaterial[0].production)} units` : "No mapped material"}
        />
        <KpiCard
          label="Stages / Materials"
          value={`${byStage.length} / ${byMaterial.length}`}
          target="Distinct values in selection"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {materials.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Production by Material</div>
            <ReactECharts option={materialOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
        {topStages.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Production by Stage</div>
            <ReactECharts option={stageOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
        {topDowntimeStages.length > 0 && (
          <div className="carousel-chart-container">
            <div className="carousel-chart-container__title">Downtime by Stage</div>
            <ReactECharts option={stageDowntimeOption} style={{ height: "230px" }} notMerge />
          </div>
        )}
      </div>
    </div>
  );
}
