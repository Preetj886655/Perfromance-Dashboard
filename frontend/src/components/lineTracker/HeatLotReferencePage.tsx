import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  fetchHeatLotReferenceAnalytics,
  type HeatLotReferenceAnalyticsResponse,
} from "../../services/lineTrackerWorksheetsApi";
import { buildLineTrackerWorksheetHash, parseLineTrackerWorksheetRoute } from "../../services/lineTrackerWorksheetRoutes";
import { RawMaterialSourceBanner, RawSourceRows } from "./RawMaterialShared";
import { formatNumber } from "./rawMaterialFormatting";
import "../../styles/line-tracker-order-analytics.css";
import "../../styles/line-tracker-raw-material.css";

const PAGE_SIZE = 15;
const SORT_FIELDS = [
  ["source_row", "Source row"],
  ["heat_no", "Heat No."],
  ["lot_no", "Lot No."],
  ["customer", "Customer"],
  ["supplier", "Supplier"],
  ["rm_qty_mt", "RM Qty (MT)"],
  ["source_batch", "Source Batch"],
  ["plan_usage", "Plan use"],
] as const;

function initialPair(): { heatNo: string; lotNo: string } {
  if (typeof window === "undefined") return { heatNo: "", lotNo: "" };
  const params = parseLineTrackerWorksheetRoute(window.location.hash)?.params;
  return { heatNo: params?.get("heat_no") ?? "", lotNo: params?.get("lot_no") ?? "" };
}

export function HeatLotReferencePage() {
  const [data, setData] = useState<HeatLotReferenceAnalyticsResponse | null>(null);
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
      const result = await fetchHeatLotReferenceAnalytics({
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
        setError(loadError instanceof Error ? loadError.message : "Unable to load the heat/lot reference.");
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

  return (
    <section className="order-analytics rm-analytics">
      <header className="order-analytics__header">
        <div>
          <p className="order-analytics__eyebrow">ERC Mk-V Line Tracker / Raw Materials</p>
          <h2>Heat &amp; Lot Number Reference</h2>
          <p>Read-only reference/master records. Matching material-plan quantity is linked, never added as a second receipt.</p>
        </div>
        <div className="rm-analytics__header-actions">
          <a className="btn" href="#/line-tracker/worksheet/rm-heat-plan-vs-actual">RM Heat Plan vs Actual</a>
          <button type="button" className="btn btn--primary" onClick={() => void load(true)} disabled={loading || refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {data ? (
        <>
          <RawMaterialSourceBanner data={data} error={error} />
          {data.source_context_rows.map((row) => (
            <p className="order-analytics__footnote" key={row.row_number}>{row.values.map(String).join(" ")}</p>
          ))}

          <div className="order-analytics__metrics">
            <article><span>Reference master records</span><strong>{data.record_count}</strong><small>Excludes the distinct-lot reverse cross-reference section</small></article>
            <article><span>Used by current plan</span><strong>{data.relationship.matched_pair_count}</strong><small>Exact composite heat + lot matches</small></article>
            <article><span>Reference rows with incomplete keys</span><strong>{data.relationship.reference_incomplete_key_count}</strong><small>Not inferred from Heat No. alone</small></article>
            <article><span>Reference-only complete pairs</span><strong>{data.relationship.reference_only_key_count}</strong><small>Material quantity is not summed into plan metrics</small></article>
          </div>

          {data.relationship.consistency_difference_count > 0 ? (
            <section className="order-analytics__warning" aria-label="Reference consistency differences">
              <strong>{data.relationship.consistency_difference_count} source consistency differences:</strong>
              <ul>
                {data.relationship.consistency_differences.map((difference, index) => (
                  <li key={`${difference.heat_no}-${difference.lot_no}-${difference.field}-${index}`}>
                    {difference.heat_no} / {difference.lot_no}: {difference.field} —
                    plan “{String(difference.plan_value)}”, reference “{String(difference.reference_value)}”
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div className="order-analytics__notice" role="status">
              Customer, supplier, source batch, and RM Qty (MT) agree on all exact matched heat/lot pairs.
            </div>
          )}

          <div className="order-analytics__notice" role="status">
            The source also contains a separate “Distinct Lot Numbers” reverse cross-reference with {data.relationship.crosswalk_entry_count} entries; {data.relationship.crosswalk_matched_key_count} map back to the primary reference pairs. Cross-reference quantities are not double-counted.
          </div>
          {data.relationship.crosswalk_unmatched_keys.length || data.relationship.crosswalk_duplicate_keys.length ? (
            <div className="order-analytics__warning" role="status">
              The reverse cross-reference has {data.relationship.crosswalk_unmatched_keys.length} unmatched and {data.relationship.crosswalk_duplicate_keys.length} duplicate composite keys.
            </div>
          ) : null}

          <div className="order-analytics__toolbar">
            <form className="order-analytics__search" onSubmit={applySearch}>
              <label htmlFor="heat-reference-search">Search heat, lot, customer, supplier, or batch</label>
              <input id="heat-reference-search" type="search" maxLength={120} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} />
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
            <label htmlFor="heat-reference-sort">Sort by</label>
            <select id="heat-reference-sort" value={sortBy} onChange={(event) => { setPage(1); setSortBy(event.target.value); }}>
              {SORT_FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" className="btn" onClick={() => setSortOrder((order) => order === "asc" ? "desc" : "asc")}>
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </button>
            <span>{data.filtered_record_count} matching reference records</span>
          </div>

          {data.records.length ? (
            <div className="order-analytics__table-wrap">
              <table className="order-analytics__table order-analytics__table--reference">
                <thead><tr>
                  <th scope="col">Row</th><th scope="col">Heat No.</th><th scope="col">Lot No.</th>
                  <th scope="col">Customer</th><th scope="col">Supplier</th><th scope="col">RM Qty (MT)</th>
                  <th scope="col">Source Batch</th><th scope="col">Plan usage</th><th scope="col">Drill-down</th>
                </tr></thead>
                <tbody>{data.records.map((record) => (
                  <tr key={record.source_row}>
                    <td>{record.source_row}</td>
                    <td>{record.heat_no || "Not listed"}</td>
                    <td>{record.lot_no || "Not listed"}</td>
                    <td>{record.customer || "—"}</td>
                    <td>{record.supplier || "—"}</td>
                    <td>{formatNumber(record.rm_qty_mt)} MT</td>
                    <td>{record.source_batch || "—"}</td>
                    <td>
                      <span className={`rm-analytics__match ${record.plan_usage === "exact" ? "rm-analytics__match--matched" : "rm-analytics__match--unmatched"}`}>
                        {record.plan_usage === "exact" ? "Used by plan" : record.plan_usage === "ambiguous" ? "Ambiguous" : record.plan_usage === "unmatched" ? "No matching pair" : "Incomplete key"}
                      </span>
                    </td>
                    <td>
                      {record.plan_usage === "exact" && record.heat_no && record.lot_no ? (
                        <a className="rm-analytics__drilldown" href={buildLineTrackerWorksheetHash("rm-heat-plan-vs-actual", { heat_no: record.heat_no, lot_no: record.lot_no })}>
                          View plan row{record.plan_row_numbers.length > 1 ? "s" : ""}
                        </a>
                      ) : "No exact plan link"}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="order-analytics__empty" role="status">{loading ? "Loading heat/lot reference..." : "No reference records match these filters."}</div>
          )}

          <footer className="order-analytics__pagination">
            <span>Page {data.page} of {Math.max(data.page_count, 1)}</span>
            <div>
              <button type="button" className="btn" disabled={page <= 1 || loading || refreshing} onClick={() => setPage((value) => Math.max(value - 1, 1))}>Previous</button>
              <button type="button" className="btn" disabled={page >= data.page_count || data.page_count === 0 || loading || refreshing} onClick={() => setPage((value) => Math.min(value + 1, data.page_count))}>Next</button>
            </div>
          </footer>
          <p className="order-analytics__footnote">
            RM Qty (MT) is a reference attribute. It is displayed per master record and is never accumulated with RM plan quantities as though it represented an independent receipt.
          </p>
          <RawSourceRows headers={data.source_headers} records={data.source_records} sourceRecordCount={data.source_record_count} />
        </>
      ) : loading ? (
        <div className="order-analytics__empty" role="status">Loading live reference worksheets...</div>
      ) : (
        <div className="order-analytics__empty" role="alert">Heat/lot reference is unavailable. Use Refresh to retry.</div>
      )}
    </section>
  );
}
