import { useCallback, useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";

import {
  fetchLineTrackerWorksheet,
  type LineTrackerWorksheetResponse,
} from "../../services/lineTrackerWorksheetsApi";
import {
  buildBreakdownSeverityOption,
  buildDowntimeParetoOption,
  buildOeeBreakdownOption,
  buildReliabilityComparisonOption,
} from "./ReliabilityAnalyticsCharts";
import { displayValue } from "./rawMaterialFormatting";
import "../../styles/line-tracker-dashboards.css";
import "../../styles/line-tracker-order-analytics.css";

export function ReliabilityAnalyticsPage({
  pageKey,
}: {
  pageKey: "downtime-analysis" | "oee-reliability";
}) {
  const [data, setData] = useState<LineTrackerWorksheetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchLineTrackerWorksheet(pageKey, { pageSize: 200, refresh }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load reliability analytics.");
    } finally {
      setLoading(false);
    }
  }, [pageKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="order-analytics">
      <header className="order-analytics__header">
        <div>
          <p className="order-analytics__eyebrow">ERC Mk-V Line Tracker / Downtime &amp; Reliability</p>
          <h2>{pageKey === "downtime-analysis" ? "Downtime Analysis" : "OEE & Reliability"}</h2>
          <p>Read-only charts use the dedicated pre-aggregated worksheet tables; blank and error-token cells remain gaps.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void load(true)} disabled={loading}>
          {loading ? "Loading..." : "Refresh source"}
        </button>
      </header>
      {error && <p className="order-analytics__alert" role="alert">{error}</p>}
      {data?.is_stale ? <div className="order-analytics__warning" role="status">Some reliability data may be delayed. The last available values remain visible.</div> : null}
      {loading && !data && <p role="status">Loading pre-aggregated worksheet tables...</p>}
      {data && pageKey === "downtime-analysis" && (
        <>
          <section className="line-dashboard__metrics" aria-label="Downtime KPI scorecards">
            <div className="line-dashboard__metric"><span>Categories in Pareto</span><strong>{data.records.length}</strong><small>Source-backed downtime categories</small></div>
            <div className="line-dashboard__metric"><span>Analysis coverage</span><strong>Complete</strong><small>Pre-aggregated analytical rows</small></div>
            <div className="line-dashboard__metric"><span>Unavailable cells</span><strong>Visible as gaps</strong><small>No null values are zero-filled</small></div>
          </section>
          <section className="line-dashboard__chart" aria-label="Downtime Pareto">
            <h3>Downtime Pareto</h3>
            <p className="line-dashboard__note">Table 1 source rows 6–25. Total hours and cumulative percentage are taken directly from the worksheet.</p>
            <ReactECharts option={buildDowntimeParetoOption(data.records)} style={{ height: 480, width: "100%" }} notMerge />
          </section>
          <section className="line-dashboard__chart" aria-label="Machine breakdown severity">
            <h3>Top machine breakdown severity</h3>
            <p className="line-dashboard__note">Table 2 source rows 30–49. No recalculation from the paginated Downtime Log is performed.</p>
            <ReactECharts option={buildBreakdownSeverityOption(data.records)} style={{ height: 480, width: "100%" }} notMerge />
          </section>
          <ReliabilityDataTable data={data} />
        </>
      )}
      {data && pageKey === "oee-reliability" && (
        <>
          <section className="line-dashboard__metrics" aria-label="Reliability KPI scorecards">
            <div className="line-dashboard__metric"><span>Reliability records</span><strong>{data.records.length}</strong><small>OEE, MTTR and MTBF source rows</small></div>
            <div className="line-dashboard__metric"><span>Reliability views</span><strong>3</strong><small>OEE, MTTR and MTBF</small></div>
            <div className="line-dashboard__metric"><span>Missing values</span><strong>Preserved</strong><small>Unavailable source cells remain gaps</small></div>
          </section>
          <section className="line-dashboard__chart" aria-label="Live OEE breakdown">
            <h3>Live OEE by work center</h3>
            <p className="line-dashboard__note">Table 1 source rows 6–14. Percentages are source worksheet values; unavailable cells are not plotted as zero.</p>
            <ReactECharts option={buildOeeBreakdownOption(data.records)} style={{ height: 420, width: "100%" }} notMerge />
          </section>
          <section className="line-dashboard__chart" aria-label="Machine MTTR and MTBF">
            <h3>Machine MTTR vs MTBF</h3>
            <p className="line-dashboard__note">Reliability values are sourced from the dedicated worksheet tables, not inferred from missing downtime rows.</p>
            <ReactECharts option={buildReliabilityComparisonOption(data.records, 20, 34, "MTTR", "Occurrences")} style={{ height: 480, width: "100%" }} notMerge />
            <ReactECharts option={buildReliabilityComparisonOption(data.records, 40, 54, "MTBF", "Events")} style={{ height: 480, width: "100%" }} notMerge />
          </section>
          <ReliabilityDataTable data={data} />
        </>
      )}
    </section>
  );
}

function ReliabilityDataTable({ data }: { data: LineTrackerWorksheetResponse }) {
  return (
    <section className="line-dashboard__table-wrap" aria-label="Reliability source data">
      <h3>Detailed reliability data</h3>
      <div className="order-analytics__table-wrap">
        <table className="order-analytics__table">
          <thead><tr><th>Row</th>{data.headers.map((header, index) => <th key={`${index}-${header}`}>{header}</th>)}</tr></thead>
          <tbody>{data.records.map((record) => (
            <tr key={record.row_number}>
              <td>{record.row_number}</td>
              {data.headers.map((_, index) => <td key={`${record.row_number}-${index}`}>{displayValue(record.values[index])}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
