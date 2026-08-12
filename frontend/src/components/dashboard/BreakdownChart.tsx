import ReactECharts from "echarts-for-react";
import type { OeeBreakdown } from "../../types/dashboard";
import { formatRatioAsPercent } from "../../utils/format";
import { StatusBanner } from "./StatusBanner";

type Props = {
  breakdown: OeeBreakdown | null;
  loading: boolean;
  error: string | null;
};

export function BreakdownChart({ breakdown, loading, error }: Props) {
  return (
    <section className="panel chart-panel">
      <div className="panel__head">
        <h2>A / P / Q / OEE breakdown</h2>
        <p className="panel__desc">Values from GET /oee/breakdown (stored ratios only).</p>
      </div>
      <StatusBanner
        loading={loading}
        error={error}
        empty={!breakdown}
        emptyMessage="No breakdown snapshot for this scope × period."
      >
        {breakdown ? (
          <>
            <ReactECharts
              style={{ height: 280 }}
              opts={{ renderer: "canvas" }}
              option={{
                color: ["#8c1c28", "#c45c26", "#2f5d50", "#1f2430"],
                tooltip: {
                  trigger: "axis",
                  valueFormatter: (v: number) => formatRatioAsPercent(Number(v)),
                },
                grid: { left: 48, right: 16, top: 24, bottom: 40 },
                xAxis: {
                  type: "category",
                  data: ["Availability", "Performance", "Quality", "OEE"],
                  axisLabel: { color: "#5a6170" },
                },
                yAxis: {
                  type: "value",
                  min: 0,
                  max: 1,
                  axisLabel: {
                    formatter: (v: number) => `${Math.round(v * 100)}%`,
                    color: "#5a6170",
                  },
                  splitLine: { lineStyle: { color: "rgba(31,36,48,0.08)" } },
                },
                series: [
                  {
                    type: "bar",
                    barWidth: "42%",
                    data: [
                      breakdown.availability,
                      breakdown.performance,
                      breakdown.quality,
                      breakdown.oee,
                    ],
                    label: {
                      show: true,
                      position: "top",
                      formatter: (p: { value: number }) =>
                        formatRatioAsPercent(p.value),
                    },
                  },
                ],
              }}
            />
            <p className="meta-line">
              Machine utilisation:{" "}
              {breakdown.machine_utilisation === null
                ? "N/A"
                : formatRatioAsPercent(breakdown.machine_utilisation)}
            </p>
          </>
        ) : null}
      </StatusBanner>
    </section>
  );
}
