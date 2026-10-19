import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import ReactECharts from "echarts-for-react";

import {
  fetchProductionOrderAnalytics,
  type ProductionOrderAnalyticsResponse,
} from "../../services/lineTrackerWorksheetsApi";
import "../../styles/line-tracker-order-analytics.css";
import "../../styles/line-tracker-dashboards.css";
import { buildOrderBookOption, buildMonthlyPlanOption } from "./OrderAnalyticsCharts";

type Props = {
  worksheetKey: "production-order" | "copy-of-production-order";
};

const PAGE_SIZE = 10;
const SORT_FIELDS = [
  ["order_number", "Order Nr"],
  ["customer", "Customer"],
  ["part", "Part"],
  ["order_date", "PO Date"],
  ["order_quantity", "Order Qty"],
  ["status", "Status"],
  ["dispatch_date", "DP Date"],
  ["rm_requirement_mt", "RM requirement (MT)"],
  ["plan_production_total", "Monthly Production total"],
  ["plan_dispatch_total", "Monthly Dispatch total"],
] as const;

const quantityFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 3,
});

function numberText(value: number | null): string {
  return value === null ? "—" : quantityFormatter.format(value);
}

function sourceDate(value: string | null): string {
  return value || "—";
}

export function ProductionOrderAnalyticsPage({ worksheetKey }: Props) {
  const [data, setData] = useState<ProductionOrderAnalyticsResponse | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [part, setPart] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState<string>("order_number");
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
      const result = await fetchProductionOrderAnalytics(worksheetKey, {
        page,
        pageSize: PAGE_SIZE,
        search,
        customer,
        part,
        status,
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
        setError(loadError instanceof Error ? loadError.message : "Unable to load production orders.");
      }
    } finally {
      if (request === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [customer, page, part, search, sortBy, sortOrder, status, worksheetKey]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  };

  const setFilter = (setter: (value: string) => void, value: string) => {
    setPage(1);
    setter(value);
  };

  const toggleSort = (field: string) => {
    setPage(1);
    if (sortBy === field) setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const duplicate = data?.duplicate_comparison;
  const stale = Boolean(data?.is_stale || error);
  const isCopy = worksheetKey === "copy-of-production-order";

  return (
    <section className="order-analytics">
      <header className="order-analytics__header">
        <div>
          <p className="order-analytics__eyebrow">ERC Mk-V Line Tracker / Production</p>
          <h2>{isCopy ? "Copy of Production Order" : "Production Order"}</h2>
          <p>Live order rows and explicitly matched monthly plan references. Source values remain read-only.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void load(true)} disabled={loading || refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {stale ? <div className="order-analytics__warning" role="status">Some order data may be delayed. The last available values remain visible.</div> : null}

      {error ? <div className="order-analytics__alert" role="alert">{error}</div> : null}
      {data?.refresh_error ? <div className="order-analytics__warning" role="status">The latest order refresh was not available. Showing the last available values.</div> : null}

      {duplicate ? (
        <div className={duplicate.cell_values_equal ? "order-analytics__notice" : "order-analytics__warning"} role="status">
          {duplicate.cell_values_equal
            ? `Live cell values match the ${isCopy ? "Production Order" : "Copy of Production Order"} tab across ${duplicate.compared_nonempty_rows} populated rows. This copy is shown separately and is never added to order metrics.`
            : "The two live tabs differ. This page shows only its selected worksheet; the tabs are not combined."}
        </div>
      ) : null}

      {data ? (
        <>
          {(data.order_book_summary ?? []).length > 0 && (
            <section className="line-dashboard__chart" aria-label="Customer order book">
              <h3>Customer order book and carryover</h3>
              <p className="line-dashboard__note">Production-order-linked monthly-plan values in NOS. Copy of Production Order is never added to these totals.</p>
              <ReactECharts
                option={buildOrderBookOption(data.order_book_summary ?? [])}
                style={{ height: Math.max(280, (data.order_book_summary ?? []).length * 42), width: "100%" }}
                notMerge
              />
            </section>
          )}
          {(data.monthly_plan_summary ?? []).length > 0 && (
            <section className="line-dashboard__chart" aria-label="Monthly production and dispatch plan">
              <h3>Monthly production plan vs dispatch plan</h3>
              <ReactECharts
                option={buildMonthlyPlanOption(data.monthly_plan_summary ?? [])}
                style={{ height: 340, width: "100%" }}
                notMerge
              />
            </section>
          )}
          <div className="order-analytics__metrics">
            <article><span>{isCopy ? "Rows in this snapshot" : "Orders in source"}</span><strong>{data.summary.order_count.toLocaleString()}</strong></article>
            <article>
              <span>RM requirement recorded (MT)</span>
              <strong>{data.summary.known_rm_requirement_total_mt === null ? "—" : numberText(data.summary.known_rm_requirement_total_mt)}</strong>
              <small>{data.summary.known_rm_requirement_count} of {data.summary.order_count} orders have a value</small>
            </article>
            <article><span>Exact PO matches in monthly plan</span><strong>{data.plan_overlap.exact_match_count} / {data.plan_overlap.plan_order_count}</strong></article>
            <article><span>Monthly-plan note aliases</span><strong>{data.plan_overlap.note_alias_match_count}</strong></article>
          </div>

          <div className="order-analytics__status-counts" aria-label="Source status counts">
            <span>Source statuses:</span>
            {Object.entries(data.summary.status_counts).map(([label, count]) => (
              <span className="order-analytics__status-chip" key={label}>{label}: {count}</span>
            ))}
          </div>
          {data.plan_overlap.unmatched_count > 0 || data.plan_overlap.ambiguous_count > 0 ? (
            <div className="order-analytics__warning" role="status">
              Unmatched monthly plan POs: {data.plan_overlap.unmatched_po_numbers.join(", ") || "none"}.
              {data.plan_overlap.ambiguous_count > 0 ? ` Ambiguous POs: ${data.plan_overlap.ambiguous_po_numbers.join(", ")}.` : ""}
            </div>
          ) : null}

          <div className="order-analytics__toolbar">
            <form className="order-analytics__search" onSubmit={onSearch}>
              <label htmlFor="production-order-search">Search orders</label>
              <input
                id="production-order-search"
                type="search"
                maxLength={120}
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Order Nr, customer, notes..."
              />
              <button type="submit" className="btn">Search</button>
            </form>
            <label>Customer
              <select value={customer} onChange={(event) => setFilter(setCustomer, event.target.value)}>
                <option value="">All customers</option>
                {data.filter_options.customers.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Part
              <select value={part} onChange={(event) => setFilter(setPart, event.target.value)}>
                <option value="">All parts</option>
                {data.filter_options.parts.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Source status
              <select value={status} onChange={(event) => setFilter(setStatus, event.target.value)}>
                <option value="">All source statuses</option>
                {data.filter_options.statuses.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          </div>

          <div className="order-analytics__sort">
            <label htmlFor="production-order-sort">Sort by</label>
            <select id="production-order-sort" value={sortBy} onChange={(event) => {
              setPage(1);
              setSortBy(event.target.value);
            }}>
              {SORT_FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" className="btn" onClick={() => setSortOrder((order) => (order === "asc" ? "desc" : "asc"))}>
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </button>
            <span>{data.filtered_record_count} matching orders</span>
          </div>

          {data.orders.length ? (
            <div className="order-analytics__table-wrap">
              <table className="order-analytics__table">
                <thead><tr>
                  {SORT_FIELDS.map(([field, label]) => (
                    <th key={field} scope="col">
                      <button type="button" onClick={() => toggleSort(field)}>
                        {label}{sortBy === field ? (sortOrder === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                  <th scope="col">Monthly plan link</th>
                  <th scope="col">Order details</th>
                </tr></thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr key={`${order.row_number}-${order.order_number ?? "no-id"}`}>
                      <td>{order.order_number || "Not listed"}</td>
                      <td>{order.customer || "—"}</td>
                      <td>{order.part || "—"}</td>
                      <td>{numberText(order.order_quantity)}</td>
                      <td>{order.status || "—"}</td>
                      <td>{sourceDate(order.order_date)}</td>
                      <td>{sourceDate(order.dispatch_date)}</td>
                      <td>{order.rm_requirement_mt === null ? "—" : `${numberText(order.rm_requirement_mt)} MT`}</td>
                      <td>{numberText(order.plan_production_total)}</td>
                      <td>{numberText(order.plan_dispatch_total)}</td>
                      <td>
                        {order.plan_link ? (
                          <span className="order-analytics__status-chip">
                            {order.plan_link.match_method === "exact" ? "Exact PO" : "PO listed in notes"}
                          </span>
                        ) : "No matched monthly plan"}
                      </td>
                      <td>
                        <details>
                          <summary>View</summary>
                          <dl>
                            <dt>Assigned RM heat</dt><dd>{order.assigned_rm_heat || "Not listed"}</dd>
                            <dt>Subsequent lot(s)</dt><dd>{order.subsequent_lot || "Not listed"}</dd>
                            <dt>Notes</dt><dd>{order.notes || "Not listed"}</dd>
                          </dl>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="order-analytics__empty" role="status">
              {loading ? "Loading orders..." : "No source orders match these filters."}
            </div>
          )}

          <footer className="order-analytics__pagination">
            <span>Page {data.page} of {Math.max(data.page_count, 1)}</span>
            <div>
              <button type="button" className="btn" disabled={page <= 1 || loading || refreshing} onClick={() => setPage((value) => Math.max(value - 1, 1))}>Previous</button>
              <button type="button" className="btn" disabled={page >= data.page_count || data.page_count === 0 || loading || refreshing} onClick={() => setPage((value) => Math.min(value + 1, data.page_count))}>Next</button>
            </div>
          </footer>
          <p className="order-analytics__footnote">
            Order Qty has no confirmed unit in the source header; quantities are shown as entered. Monthly Production and Dispatch are source Type labels, not reclassified actuals. Empty source cells remain blank.
          </p>
        </>
      ) : loading ? (
        <div className="order-analytics__empty" role="status">Loading live order data...</div>
      ) : (
        <div className="order-analytics__empty" role="alert">Order data is unavailable. Use Refresh to retry.</div>
      )}
    </section>
  );
}
