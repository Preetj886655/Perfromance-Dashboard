/**
 * MachineAnalyticsSlide — SLIDE 12: MACHINE ANALYTICS
 *
 * Raw machine dimension (not Work Center). Top machines by downtime,
 * top machines by production loss, and machine production output.
 */

import ReactECharts from "echarts-for-react";
import type { DashboardAnalytics } from "./useDashboardAnalytics";
import { KpiCard, KpiGrid } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS, abbreviateNumber, truncateLabel, xAxisCategoryStyle, yAxisStyle, gridStyle, axisLabelStyle } from "./chartTheme";

interface Props {
  analytics: DashboardAnalytics;
}

export function MachineAnalyticsSlide({ analytics }: Props) {
  const { downtime, lossByMachine, productionByMachine } = analytics;

  const topDowntimeMachines = downtime.byMachine.slice(0, 10);
  const topLossMachines = lossByMachine.slice(0, 10);
  const topProdMachines = productionByMachine.slice(0, 10);

  const topMachineDown = downtime.byMachine[0];
  const topMachineLoss = lossByMachine[0];

  const downtimeOption = {
    grid: gridStyle({ left: 90, bottom: 50 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${Math.round(v)} min` },
    xAxis: { ...xAxisCategoryStyle, data: topDowntimeMachines.map((m) => truncateLabel(m.key, 14)), axisLabel: { ...axisLabelStyle, rotate: 25 } },
    yAxis: yAxisStyle,
    series: [
      { name: "Downtime (min)", type: "bar" as const, data: topDowntimeMachines.map((m) => Math.round(m.minutes)), itemStyle: { color: CHART_COLORS.machine } },
    ],
  };

  const lossOption = {
    grid: gridStyle({ left: 90, bottom: 50 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => abbreviateNumber(v) },
    xAxis: { ...xAxisCategoryStyle, data: topLossMachines.map((m) => truncateLabel(m.key, 14)), axisLabel: { ...axisLabelStyle, rotate: 25 } },
    yAxis: yAxisStyle,
    series: [
      { name: "Prod Loss (NOS)", type: "bar" as const, data: topLossMachines.map((m) => Math.round(m.minutes)), itemStyle: { color: CHART_COLORS.loss } },
    ],
  };

  const productionOption = {
    grid: gridStyle({ left: 90, bottom: 50 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => abbreviateNumber(v) },
    xAxis: { ...xAxisCategoryStyle, data: topProdMachines.map((m) => truncateLabel(m.key, 14)), axisLabel: { ...axisLabelStyle, rotate: 25 } },
    yAxis: yAxisStyle,
    series: [
      { name: "Production", type: "bar" as const, data: topProdMachines.map((m) => Math.round(m.value)), itemStyle: { color: CHART_COLORS.prod } },
    ],
  };

  return (
    <div>
      <KpiGrid>
        <KpiCard
          label="Top Machine (Downtime)"
          value={topMachineDown ? truncateLabel(topMachineDown.key, 14) : "N/A"}
          target={topMachineDown ? `${abbreviateNumber(topMachineDown.minutes)} min` : ""}
          status="Critical"
        />
        <KpiCard
          label="Top Machine (Loss)"
          value={topMachineLoss ? truncateLabel(topMachineLoss.key, 14) : "N/A"}
          target={topMachineLoss ? `${abbreviateNumber(topMachineLoss.minutes)} NOS` : ""}
          status="Warning"
        />
        <KpiCard
          label="Machines (raw)"
          value={String(downtime.byMachine.length)}
          target="Unique machines"
        />
        <KpiCard
          label="Machines w/ Production"
          value={String(productionByMachine.length)}
          target="With output data"
        />
      </KpiGrid>

      <div className="carousel-chart-row">
        {topDowntimeMachines.length > 0 && (
          <ChartCard title="Top Machines by Downtime" eyebrow="Equipment">
            <ReactECharts option={downtimeOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
        {topLossMachines.length > 0 && (
          <ChartCard title="Top Machines by Production Loss" eyebrow="Loss">
            <ReactECharts option={lossOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
          </ChartCard>
        )}
      </div>

      {topProdMachines.length > 0 && (
        <ChartCard title="Machine Production Output" eyebrow="Output">
          <ReactECharts option={productionOption} style={{ height: 230 }} notMerge opts={{ renderer: "canvas" }} />
        </ChartCard>
      )}
    </div>
  );
}
