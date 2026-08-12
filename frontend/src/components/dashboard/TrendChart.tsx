import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { OeeSnapshot } from "../../types/dashboard";
import { formatRatioAsPercent } from "../../utils/format";
import { StatusBanner } from "./StatusBanner";

type SeriesKey = "oee" | "availability" | "performance" | "quality";

type Props = {
  items: OeeSnapshot[];
  loading: boolean;
  error: string | null;
  windowLabel: string;
};

const SERIES_META: { key: SeriesKey; label: string; color: string }[] = [
  { key: "oee", label: "OEE", color: "#8c1c28" },
  { key: "availability", label: "Availability", color: "#2f5d50" },
  { key: "performance", label: "Performance", color: "#c45c26" },
  { key: "quality", label: "Quality", color: "#3d4f7c" },
];

export function TrendChart({ items, loading, error, windowLabel }: Props) {
  const [enabled, setEnabled] = useState<Record<SeriesKey, boolean>>({
    oee: true,
    availability: false,
    performance: false,
    quality: false,
  });

  const option = useMemo(() => {
    const categories = items.map((i) => i.period_start);
    const series = SERIES_META.filter((s) => enabled[s.key]).map((s) => ({
      name: s.label,
      type: "line" as const,
      smooth: false,
      showSymbol: items.length <= 24,
      data: items.map((i) => i[s.key]),
      lineStyle: { width: s.key === "oee" ? 3 : 2, color: s.color },
      itemStyle: { color: s.color },
    }));

    return {
      color: SERIES_META.map((s) => s.color),
      tooltip: {
        trigger: "axis",
        valueFormatter: (v: number) => formatRatioAsPercent(Number(v)),
      },
      legend: { show: false },
      grid: { left: 48, right: 16, top: 24, bottom: 48 },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { color: "#5a6170", hideOverlap: true },
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
      series,
    };
  }, [items, enabled]);

  return (
    <section className="panel chart-panel">
      <div className="panel__head">
        <h2>OEE trend</h2>
        <p className="panel__desc">
          GET /oee/trend · window {windowLabel} · toggles show API fields only (no
          recalculation).
        </p>
      </div>

      <div className="trend-toggles" role="group" aria-label="Trend series">
        {SERIES_META.map((s) => (
          <label key={s.key} className="trend-toggle">
            <input
              type="checkbox"
              checked={enabled[s.key]}
              disabled={s.key === "oee"}
              onChange={() =>
                setEnabled((prev) => ({ ...prev, [s.key]: !prev[s.key] }))
              }
            />
            <span>{s.label}</span>
          </label>
        ))}
      </div>

      <StatusBanner
        loading={loading}
        error={error}
        empty={items.length === 0}
        emptyMessage="No trend snapshots in this presentation window."
      >
        <ReactECharts style={{ height: 300 }} opts={{ renderer: "canvas" }} option={option} />
      </StatusBanner>
    </section>
  );
}
