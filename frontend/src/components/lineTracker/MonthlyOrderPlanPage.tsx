import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import ReactECharts from "echarts-for-react";

import {
  fetchMonthlyOrderPlan,
  type MonthlyOrderPlanResponse,
} from "../../services/lineTrackerWorksheetsApi";
import "../../styles/line-tracker-order-analytics.css";
import "../../styles/line-tracker-dashboards.css";
import { buildOrderBookOption, buildMonthlyPlanOption } from "./OrderAnalyticsCharts";

const PAGE_SIZE = 10;
const SORT_FIELDS = [
  ["row_number", "Source row"],
  ["po_number", "PO No"],
  ["customer", "Customer"],
  ["part", "Part"],
  ["type", "Type"],
  ["po_quantity", "PO Qty"],
  ["balance", "Balance"],
  ["month_total", "Sum of listed month cells"],
] as const;

const quantityFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 3,
});

function numberText(value: number | null): string {
  return value === null ? "—" : quantityFormatter.format(value);
}

export function MonthlyOrderPlanPage() {
  const [data, setData] = useState<MonthlyOrderPlanResponse | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [part, setPart] = useState("");
  const [type, setType] = useState("");
  const [month, setMonth] = useState("");
  const [sortBy, setSortBy] = useState<string>("row_number");
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
      const result = await fetchMonthlyOrderPlan({
        page,
        pageSize: PAGE_SIZE,
        search,
        customer,
        part,
        type,
        month,
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
        setError(loadError instanceof Error ? loadError.message : "Unable to load the monthly plan.");
      }
    } finally {
      if (request === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [customer, month, page, part, search, sortBy, sortOrder, type]);

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

  const stale = Boolean(data?.is_stale || error);

  return (
    <section className="order-analytics">
      <header className="order-analytics__header">
        <div>
          <p className="order-analytics__eyebrow">ERC Mk-V Line Tracker / Planning</p>
          <h2>Order Plan (Monthly)</h2>
          <p>{data?.source_title || "Monthly production and dispatch source rows."}</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void load(true)} disabled={loading || refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {stale ? <div className="order-analytics__warning" role="status">Some planning data may be delayed. The last available values remain visible.</div> : null}

      {error ? <div className="order-analytics__alert" role="alert">{error}</div> : null}
      {data?.refresh_error ? <div className="order-analytics__warning" role="status">The latest planning refresh was not available. Showing the last available values.</div> : null}

      {data ? (
        <>
          {(data.order_book_summary ?? []).length > 0 && (
            <section className="line-dashboard__chart" aria-label="Customer order book">
              <h3>Customer order book and carryover</h3>
              <p className="line-dashboard__note">Production rows only; paired dispatch metadata is forward-filled from its production row. Values are NOS.</p>
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
              <p className="line-dashboard__note">Source month labels are normalized for the fiscal sequence; original labels remain available through the source worksheet.</p>
              <ReactECharts
                option={buildMonthlyPlanOption(data.monthly_plan_summary ?? [])}
                style={{ height: 340, width: "100%" }}
                notMerge
              />
            </section>
          )}
          <div className="order-analytics__metrics">
            <article><span>Order book rows</span><strong>{data.order_book_summary?.length.toLocaleString() ?? "0"}</strong></article>
            <article>
              <span>Fulfillment references</span>
              <strong>{data.plan_overlap.exact_match_count} exact · {data.plan_overlap.note_alias_match_count} note alias</strong>
              <small>Used only to explain fulfillment coverage.</small>
            </article>
          </div>

          <div className="order-analytics__toolbar">
            <form className="order-analytics__search" onSubmit={onSearch}>
              <label htmlFor="monthly-plan-search">Search monthly plan</label>
              <input
                id="monthly-plan-search"
                type="search"
                maxLength={120}
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="PO No, customer, part..."
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
            <label>Source Type
              <select value={type} onChange={(event) => setFilter(setType, event.target.value)}>
                <option value="">All types</option>
                {data.filter_options.types.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Month
              <select value={month} onChange={(event) => setFilter(setMonth, event.target.value)}>
                <option value="">All months</option>
                {data.month_headers.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>


          <div className="order-analytics__sort">
            <label htmlFor="monthly-plan-sort">Sort by</label>
            <select id="monthly-plan-sort" value={sortBy} onChange={(event) => {
              setPage(1);
              setSortBy(event.target.value);
            }}>
              {SORT_FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" className="btn" onClick={() => setSortOrder((order) => (order === "asc" ? "desc" : "asc"))}>
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </button>
            <span>{data.filtered_record_count} matching source rows</span>
          </div>

          {data.plans.length ? (
            <div className="order-analytics__table-wrap">
              <table className="order-analytics__table order-analytics__table--monthly">
                <thead><tr>
                  <th scope="col"><button type="button" onClick={() => toggleSort("row_number")}>Row{sortBy === "row_number" ? (sortOrder === "asc" ? " ↑" : " ↓") : ""}</button></th>
                  <th scope="col"><button type="button" onClick={() => toggleSort("po_number")}>PO No / paired PO</button></th>
                  <th scope="col"><button type="button" onClick={() => toggleSort("customer")}>Customer</button></th>
                  <th scope="col"><button type="button" onClick={() => toggleSort("part")}>Part</button></th>
                  <th scope="col"><button type="button" onClick={() => toggleSort("type")}>Type</button></th>
                  <th scope="col"><button type="button" onClick={() => toggleSort("po_quantity")}>PO Qty</button></th>
                  <th scope="col">FY25-26 Carryover</th>
                  <th scope="col"><button type="button" onClick={() => toggleSort("balance")}>Balance</button></th>
                  {data.month_headers.map((monthHeader) => <th scope="col" key={monthHeader}>{monthHeader}</th>)}
                  <th scope="col"><button type="button" onClick={() => toggleSort("month_total")}>Listed-month sum</button></th>
                  <th scope="col">Source Grand Total</th>
                  <th scope="col">PO match</th>
                </tr></thead>
                <tbody>
                  {data.plans.map((plan) => (
                    <tr key={plan.row_number}>
                      <td>{plan.row_number}</td>
                      <td>
                        {plan.po_number || plan.parent_po_number || "Not listed"}
                        {!plan.po_number && plan.parent_po_number ? <small>Paired with source row {plan.parent_row_number}</small> : null}
                      </td>
                      <td>{plan.customer || "—"}</td>
                      <td>{plan.part || "—"}</td>
                      <td>{plan.source_type}</td>
                      <td>{numberText(plan.po_quantity)}</td>
                      <td>{numberText(plan.fy25_26_carryover)}</td>
                      <td>{numberText(plan.balance)}</td>
                      {data.month_headers.map((monthHeader) => (
                        <td key={`${plan.row_number}-${monthHeader}`}>{numberText(plan.month_values[monthHeader] ?? null)}</td>
                      ))}
                      <td>{numberText(plan.month_total)}</td>
                      <td>{numberText(plan.grand_total)}</td>
                      <td>{plan.match_method === "exact" ? "Exact" : plan.match_method === "note_alias" ? "Notes alias" : plan.match_method === "ambiguous" ? "Ambiguous" : "No order match"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="order-analytics__empty" role="status">
              {loading ? "Loading monthly plan..." : "No source plan rows match these filters."}
            </div>
          )}

          <footer className="order-analytics__pagination">
            <span>Page {data.page} of {Math.max(data.page_count, 1)}</span>
            <div>
              <button type="button" className="btn" disabled={page <= 1 || loading || refreshing} onClick={() => setPage((value) => Math.max(value - 1, 1))}>Previous</button>
              <button type="button" className="btn" disabled={page >= data.page_count || data.page_count === 0 || loading || refreshing} onClick={() => setPage((value) => Math.min(value + 1, data.page_count))}>Next</button>
            </div>
          </footer>
          </div>
          <p className="order-analytics__footnote">
            Month names are displayed exactly as present in the source; the source label above is {data.fiscal_period || "not available"}. “Listed-month sum” adds only populated monthly cells and is separate from Source Grand Total. Blank cells are not treated as zero. Order-plan source identifies itself as an information-only snapshot that is not kept synchronized automatically. Quantities have no explicit unit in these headers.
          </p>
        </>
      ) : loading ? (
        <div className="order-analytics__empty" role="status">Loading live monthly plan...</div>
      ) : (
        <div className="order-analytics__empty" role="alert">Monthly plan is unavailable. Use Refresh to retry.</div>
      )}
    </section>
  );
}
