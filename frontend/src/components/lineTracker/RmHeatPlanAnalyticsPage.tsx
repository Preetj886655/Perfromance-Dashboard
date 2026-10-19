import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import ReactECharts from "echarts-for-react";

import {
  fetchRawMaterialPlanAnalytics,
  type RawMaterialPlanAnalyticsResponse,
} from "../../services/lineTrackerWorksheetsApi";
import { buildLineTrackerWorksheetHash, parseLineTrackerWorksheetRoute } from "../../services/lineTrackerWorksheetRoutes";
import { RawMaterialSourceBanner, RawSourceRows } from "./RawMaterialShared";
import { displayValue, formatNumber, formatPercentFraction } from "./rawMaterialFormatting";
import { buildHeatYieldOption, buildStageSummaryOption } from "./RawMaterialAnalyticsCharts";
import "../../styles/line-tracker-order-analytics.css";
import "../../styles/line-tracker-raw-material.css";
import "../../styles/line-tracker-dashboards.css";

const PAGE_SIZE = 10;
const SORT_FIELDS = [
  ["source_row", "Source row"],
  ["heat_no", "Heat No."],
  ["lot_no", "Lot No."],
  ["customer", "Customer"],
  ["supplier", "Supplier"],
  ["rm_qty_mt", "RM Qty (MT)"],
  ["yield_vs_plan_fraction", "Yield vs Plan"],
  ["balance_reconciliation", "Balance / Reconciliation"],
  ["source_batch", "Source Batch"],
  ["reference_status", "Reference match"],
] as const;

const DISPLAY_METRICS = [
  ["rm_qty_mt", "RM Qty planned (MT)", "MT"],
  ["plan_cut_bar_nos", "Plan: Cut Bar", "Nos"],
  ["actual_bar_cropper_ok", "Actual: Bar Cropper OK", "source quantity"],
  ["actual_endbit_scrap", "Actual: Endbit Scrap", "source quantity"],
  ["actual_acm_turning_ok", "Actual: ACM/Turning OK", "source quantity"],
  ["actual_acm_turning_rej", "Actual: ACM/Turning REJ", "source quantity"],
  ["plan_clip_prod_nos", "Plan: Clip Prod", "Nos"],
  ["actual_forming_ok", "Actual: Forming OK", "source quantity"],
  ["actual_forming_rej", "Actual: Forming REJ", "source quantity"],
  ["plan_final_supply_nos", "Plan: Final Supply", "Nos"],
] as const;

export function buildRawMaterialDistributionOption(
  items: Array<{ name: string; rm_qty_mt: number | null }>,
  left = 180,
) {
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { data: ["Planned RM (MT)"] },
    grid: { left, right: 28, top: 36, bottom: 24 },
    xAxis: { type: "value", name: "MT" },
    yAxis: { type: "category", data: items.map((item) => item.name).reverse() },
    series: [{
      name: "Planned RM (MT)",
      type: "bar",
      data: items.map((item) => item.rm_qty_mt).reverse(),
    }],
  };
}

function initialPair(): { heatNo: string; lotNo: string } {
  if (typeof window === "undefined") return { heatNo: "", lotNo: "" };
  const params = parseLineTrackerWorksheetRoute(window.location.hash)?.params;
  return { heatNo: params?.get("heat_no") ?? "", lotNo: params?.get("lot_no") ?? "" };
}

function referenceStateText(value: string): string {
  if (value === "exact") return "Exact heat + lot match";
  if (value === "ambiguous") return "Ambiguous duplicate key";
  if (value === "unmatched") return "No reference pair";
  return "Incomplete key; not joined";
}

export function RmHeatPlanAnalyticsPage() {
  const [data, setData] = useState<RawMaterialPlanAnalyticsResponse | null>(null);
  const initial = useRef(initialPair());
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [supplier, setSupplier] = useState("");
  const [sourceBatch, setSourceBatch] = useState("");
  const [heatNo, setHeatNo] = useState(initial.current.heatNo);
  const [lotNo, setLotNo] = useState(initial.current.lotNo);
  const [heatNoDraft, setHeatNoDraft] = useState(initial.current.heatNo);
  const [lotNoDraft, setLotNoDraft] = useState(initial.current.lotNo);
  const [sortBy, setSortBy] = useState<string>("source_row");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const hasData = useRef(false);

  const load = useCallback(async (refresh = false) => {
    const request = ++requestId.current;
    setError(null);
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    try {
      const exactPair = heatNo && lotNo;
      const result = await fetchRawMaterialPlanAnalytics({
        page,
        pageSize: PAGE_SIZE,
        search,
        customer,
        supplier,
        sourceBatch,
        heatNo: exactPair ? heatNo : undefined,
        lotNo: exactPair ? lotNo : undefined,
        sortBy,
        sortOrder,
        refresh,
      });
      if (request === requestId.current) {
        setData(result);
        hasData.current = true;
      }
    } catch (loadError) {
      if (request === requestId.current) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load the raw-material plan.");
      }
    } finally {
      if (request === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [customer, heatNo, lotNo, page, search, sortBy, sortOrder, sourceBatch, supplier]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  };

  const setFilter = (setter: (value: string) => void, value: string) => {
    setPage(1);
    setter(value);
  };

  const clearPair = () => {
    setPage(1);
    setHeatNo("");
    setLotNo("");
    setHeatNoDraft("");
    setLotNoDraft("");
  };

  const applyPair = () => {
    setPage(1);
    setHeatNo(heatNoDraft.trim());
    setLotNo(lotNoDraft.trim());
  };

  const summary = data?.relationship;
  const filteredMetrics = data?.metrics.metrics;

  return (
    <section className="order-analytics rm-analytics">
      <header className="order-analytics__header">
        <div>
          <p className="order-analytics__eyebrow">ERC Mk-V Line Tracker / Raw Materials</p>
          <h2>RM Heat Plan vs Actual</h2>
          <p>Live heat-wise material planning and source-reported stage quantities; original source rows remain available below.</p>
        </div>
        <div className="rm-analytics__header-actions">
          <a className="btn" href="#/line-tracker/worksheet/heat-lot-number-reference">Heat &amp; Lot Reference</a>
          <button type="button" className="btn btn--primary" onClick={() => void load(true)} disabled={loading || refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {data ? (
        <>
          <RawMaterialSourceBanner data={data} error={error} />
          {data.source_context_rows.map((row) => (
            <p className="order-analytics__footnote" key={row.row_number}>
              {row.values.map(displayValue).join(" ")}
            </p>
          ))}

          <div className="order-analytics__metrics">
            <article><span>Material plan detail rows</span><strong>{summary?.plan_record_count ?? data.record_count}</strong><small>Excludes the source's subtotal label and summary block</small></article>
            <article><span>Exact heat + lot matches</span><strong>{summary?.matched_pair_count ?? 0} / {summary?.plan_complete_key_count ?? 0}</strong><small>Reference values are not added to plan quantities</small></article>
            <article><span>Plan rows missing a heat or lot</span><strong>{summary?.plan_incomplete_key_count ?? 0}</strong><small>Never matched on Heat No. alone</small></article>
            <article><span>Planned raw material</span><strong>{formatNumber(data.source_formula_reconciliation.rm_qty_mt.source_formula_value)} MT</strong><small>Source formula and detail-row sum {data.source_formula_reconciliation.rm_qty_mt.matches ? "reconcile" : "do not reconcile"}</small></article>
          </div>

          <div className="rm-analytics__metric-grid">
            {DISPLAY_METRICS.slice(1).map(([field, label, unit]) => {
              const metric = filteredMetrics?.[field];
              return (
                <article className="order-analytics__metrics-card" key={field}>
                  <span>{label}</span>
                  <strong>{formatNumber(metric?.total ?? null)}</strong>
                  <small>{unit} · {metric?.record_count ?? 0} rows with values</small>
                </article>
              );
            })}
          </div>

          {(data.customer_summary.length > 0 || data.supplier_summary.length > 0) && (
            <section className="line-dashboard__chart" aria-label="Raw material plan by customer and supplier">
              <h3>Raw-material plan distribution</h3>
              <p className="line-dashboard__note">
                Planned raw material in MT from the verified customer and supplier summaries. This is a planning view, not actual consumption or inventory.
              </p>
              {data.customer_summary.length > 0 && (
                <ReactECharts
                  option={buildRawMaterialDistributionOption(data.customer_summary)}
                  style={{ height: Math.max(260, data.customer_summary.length * 42), width: "100%" }}
                  notMerge
                />
              )}
              {(data.stage_summary_by_supplier ?? []).length > 0 && (
                <section className="line-dashboard__chart" aria-label="Raw material stage conversion">
                  <h3>Stage-wise conversion and scrap / rejection</h3>
                  <p className="line-dashboard__note">Full-source supplier totals from RM Heat Plan vs Actual. Separator and total rows are excluded; null source cells remain gaps.</p>
                  <ReactECharts
                    option={buildStageSummaryOption(data.stage_summary_by_supplier ?? [])}
                    style={{ height: 420, width: "100%" }}
                    notMerge
                  />
                </section>
              )}
              {(data.heat_yield_series ?? []).length > 0 && (
                <section className="line-dashboard__chart" aria-label="Heat-level yield versus plan">
                  <h3>Heat-level yield vs plan</h3>
                  <ReactECharts
                    option={buildHeatYieldOption(data.heat_yield_series ?? [])}
                    style={{ height: 360, width: "100%" }}
                    notMerge
                  />
                </section>
              )}
              {data.supplier_summary.length > 0 && (
                <ReactECharts
                  option={buildRawMaterialDistributionOption(data.supplier_summary, 120)}
                  style={{ height: Math.max(240, data.supplier_summary.length * 42), width: "100%" }}
                  notMerge
                />
              )}
            </section>
          )}

          {summary && (summary.unmatched_plan_key_count > 0 || summary.reference_only_key_count > 0 || summary.ambiguous_plan_key_count > 0) ? (
            <div className="order-analytics__warning" role="status">
              Composite-key exceptions: {summary.unmatched_plan_key_count} unmatched plan pairs, {summary.reference_only_key_count} reference-only pairs, and {summary.ambiguous_plan_key_count} ambiguous keys.
            </div>
          ) : null}
          {summary && summary.consistency_differences.length > 0 ? (
            <div className="order-analytics__warning" role="status">
              {summary.consistency_difference_count} matched-pair attribute discrepancies are listed in the reference-page diagnostics.
            </div>
          ) : null}
          {data.yield_validation.mismatch_count > 0 ? (
            <div className="order-analytics__alert" role="alert">
              Source Yield vs Plan differs from independent Forming OK ÷ Plan Clip Prod calculation on rows {data.yield_validation.mismatch_source_rows.join(", ")}.
            </div>
          ) : (
            <div className="order-analytics__notice" role="status">
              Yield validation: {data.yield_validation.independently_recomputed_count} of {data.yield_validation.source_formula_count} populated source formula values match Actual: Forming OK ÷ Plan: Clip Prod.
            </div>
          )}

          <div className="rm-analytics__group-summaries">
            {[["Customer summary", data.customer_summary], ["Supplier summary", data.supplier_summary]].map(([title, rows]) => (
              <section className="rm-analytics__summary-panel" key={title as string}>
                <h3>{title as string}</h3>
                <div className="order-analytics__table-wrap">
                  <table className="order-analytics__table">
                    <thead><tr><th scope="col">Name</th><th scope="col">Detail rows</th><th scope="col">RM Qty (MT)</th><th scope="col">Matched pairs</th></tr></thead>
                    <tbody>
                      {(rows as typeof data.customer_summary).map((row) => (
                        <tr key={row.name}><td>{row.name}</td><td>{row.record_count}</td><td>{formatNumber(row.rm_qty_mt)}</td><td>{row.matched_pair_count}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>

          <div className="order-analytics__toolbar">
            <form className="order-analytics__search" onSubmit={applySearch}>
              <label htmlFor="rm-plan-search">Search heat, lot, customer, supplier, or batch</label>
              <input id="rm-plan-search" type="search" maxLength={120} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} />
              <button type="submit" className="btn">Search</button>
            </form>
            <label>Customer
              <select value={customer} onChange={(event) => setFilter(setCustomer, event.target.value)}>
                <option value="">All customers</option>
                {data.filter_options.customers.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Supplier
              <select value={supplier} onChange={(event) => setFilter(setSupplier, event.target.value)}>
                <option value="">All suppliers</option>
                {data.filter_options.suppliers.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Source batch
              <select value={sourceBatch} onChange={(event) => setFilter(setSourceBatch, event.target.value)}>
                <option value="">All batches</option>
                {data.filter_options.source_batches.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          </div>

          <div className="rm-analytics__exact-filter">
            <label>Exact Heat No. <input value={heatNoDraft} onChange={(event) => setHeatNoDraft(event.target.value)} /></label>
            <label>Exact Lot No. <input value={lotNoDraft} onChange={(event) => setLotNoDraft(event.target.value)} /></label>
            <button type="button" className="btn" disabled={!heatNoDraft.trim() || !lotNoDraft.trim()} onClick={applyPair}>Look up exact pair</button>
            {(heatNo || lotNo) ? <button type="button" className="btn" onClick={clearPair}>Clear exact lookup</button> : null}
            {(heatNoDraft && !lotNoDraft) || (!heatNoDraft && lotNoDraft) ? <small>Enter both identifiers to run an exact composite-key lookup.</small> : null}
          </div>

          <div className="order-analytics__sort">
            <label htmlFor="rm-plan-sort">Sort by</label>
            <select id="rm-plan-sort" value={sortBy} onChange={(event) => { setPage(1); setSortBy(event.target.value); }}>
              {SORT_FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" className="btn" onClick={() => setSortOrder((order) => order === "asc" ? "desc" : "asc")}>
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </button>
            <span>{data.filtered_record_count} matching detail rows</span>
          </div>

          {data.records.length ? (
            <div className="order-analytics__table-wrap">
              <table className="order-analytics__table order-analytics__table--rm-plan">
                <thead><tr>
                  <th scope="col">Row</th>
                  <th scope="col">Heat No.</th>
                  <th scope="col">Lot No.</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Supplier</th>
                  <th scope="col">Source Batch</th>
                  <th scope="col">RM Qty (MT)</th>
                  <th scope="col">Plan: Cut Bar (Nos)</th>
                  <th scope="col">Actual: Bar Cropper OK</th>
                  <th scope="col">Actual: Endbit Scrap</th>
                  <th scope="col">Actual: ACM/Turning OK</th>
                  <th scope="col">Actual: ACM/Turning REJ</th>
                  <th scope="col">Plan: Clip Prod (Nos)</th>
                  <th scope="col">Actual: Forming OK</th>
                  <th scope="col">Actual: Forming REJ</th>
                  <th scope="col">Plan: Final Supply (Nos)</th>
                  <th scope="col">Yield vs Plan</th>
                  <th scope="col">Balance / Reconciliation</th>
                  <th scope="col">Reference</th>
                </tr></thead>
                <tbody>{data.records.map((row) => (
                  <tr key={row.source_row}>
                    <td>{row.source_row}</td>
                    <td>{row.heat_no || "Not listed"}</td>
                    <td>{row.lot_no || "Not listed"}</td>
                    <td>{row.customer || "—"}</td>
                    <td>{row.supplier || "—"}</td>
                    <td>{row.source_batch || "—"}</td>
                    <td>{formatNumber(row.rm_qty_mt)}</td>
                    <td>{formatNumber(row.plan_cut_bar_nos)}</td>
                    <td>{formatNumber(row.actual_bar_cropper_ok, 0)}</td>
                    <td>{formatNumber(row.actual_endbit_scrap, 0)}</td>
                    <td>{formatNumber(row.actual_acm_turning_ok, 0)}</td>
                    <td>{formatNumber(row.actual_acm_turning_rej, 0)}</td>
                    <td>{formatNumber(row.plan_clip_prod_nos)}</td>
                    <td>{formatNumber(row.actual_forming_ok, 0)}</td>
                    <td>{formatNumber(row.actual_forming_rej, 0)}</td>
                    <td>{formatNumber(row.plan_final_supply_nos)}</td>
                    <td>
                      {formatPercentFraction(row.yield_vs_plan_fraction)}
                      <small>Forming OK / Plan Clip Prod</small>
                    </td>
                    <td>{formatNumber(row.balance_reconciliation)}</td>
                    <td>
                      <span className="rm-analytics__match">{referenceStateText(row.reference_status)}</span>
                      {row.reference_status === "exact" && row.heat_no && row.lot_no ? (
                        <a className="rm-analytics__drilldown" href={buildLineTrackerWorksheetHash("heat-lot-number-reference", { heat_no: row.heat_no, lot_no: row.lot_no })}>
                          View reference
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="order-analytics__empty" role="status">{loading ? "Loading material plan..." : "No source rows match these filters."}</div>
          )}

          <footer className="order-analytics__pagination">
            <span>Page {data.page} of {Math.max(data.page_count, 1)}</span>
            <div>
              <button type="button" className="btn" disabled={page <= 1 || loading || refreshing} onClick={() => setPage((value) => Math.max(value - 1, 1))}>Previous</button>
              <button type="button" className="btn" disabled={page >= data.page_count || data.page_count === 0 || loading || refreshing} onClick={() => setPage((value) => Math.min(value + 1, data.page_count))}>Next</button>
            </div>
          </footer>
          <p className="order-analytics__footnote">
            Plan columns explicitly label Nos; actual-stage columns have no unit in their headers and are shown as source quantities without conversion. RM Qty is MT. Yield is the verified row formula Actual: Forming OK ÷ Plan: Clip Prod; blanks remain blank. The reference worksheet is a master list and its quantities are not summed into this plan.
          </p>
          <RawSourceRows headers={data.source_headers} records={data.source_records} sourceRecordCount={data.source_record_count} />
        </>
      ) : loading ? (
        <div className="order-analytics__empty" role="status">Loading live raw-material worksheets...</div>
      ) : (
        <div className="order-analytics__empty" role="alert">Raw-material plan is unavailable. Use Refresh to retry.</div>
      )}
    </section>
  );
}
