import { useCallback, useEffect, useState, type FormEvent } from "react";
import ReactECharts from "echarts-for-react";

import {
  fetchManpowerSummaryAnalytics,
  fetchShiftEntriesAnalytics,
  type ManpowerSummaryAnalyticsResponse,
  type ShiftEntriesAnalyticsResponse,
  type ShiftEntryRow,
} from "../../services/lineTrackerWorksheetsApi";
import { buildLineTrackerWorksheetHash } from "../../services/lineTrackerWorksheetRoutes";
import { formatAssetNumber } from "./rawMaterialFormatting";
import "../../styles/line-tracker-shift-manpower.css";
import "../../styles/line-tracker-dashboards.css";
import { buildQualityByWorkCenterOption } from "./QualityAnalyticsCharts";

const PAGE_SIZE = 15;

function display(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function number(value: number | null, digits = 2): string {
  return value === null ? "—" : formatAssetNumber(value, digits);
}

function percent(value: number | null): string {
  return value === null ? "—" : `${formatAssetNumber(value * 100, 2)}%`;
}

function SourceState({
  data,
}: {
  data: ShiftEntriesAnalyticsResponse | ManpowerSummaryAnalyticsResponse;
}) {
  return (
    <section className="shift-manpower__source" aria-label="Source status">
      <strong>Shift analytics</strong>
      {data.is_stale && (
        <p role="status" className="shift-manpower__warning">
          One or more worksheets could not refresh. Values below may be stale.
        </p>
      )}
    </section>
  );
}

function Metric({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="shift-manpower__metric">
      <span>{title}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function measureDetail(known: number, missing: number) {
  return `${known} known value${known === 1 ? "" : "s"}; ${missing} missing`;
}

export function buildManpowerComparisonOption(
  records: Array<{ name: string | null; avg_planned: number | null; avg_actual: number | null }>,
) {
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { data: ["Average planned", "Average actual"] },
    grid: { left: 180, right: 28, top: 36, bottom: 24 },
    xAxis: { type: "value", name: "Headcount / shift", min: 0 },
    yAxis: { type: "category", data: records.map((row) => row.name ?? "Unnamed").slice().reverse() },
    series: [
      { name: "Average planned", type: "bar", data: records.map((row) => row.avg_planned).slice().reverse() },
      { name: "Average actual", type: "bar", data: records.map((row) => row.avg_actual).slice().reverse() },
    ],
  };
}

function EntriesPage() {
  const [data, setData] = useState<ShiftEntriesAnalyticsResponse | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filters, setFilters] = useState({
    shift: "",
    workCenter: "",
    machine: "",
    part: "",
    source: "",
    downtimeCategory: "",
    breakdownType: "",
    statusVsRated: "",
  });
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setError(null);
    setLoading(true);
    setRefreshing(refresh);
    try {
      setData(await fetchShiftEntriesAnalytics({
        page,
        pageSize: PAGE_SIZE,
        search,
        dateFrom,
        dateTo,
        ...filters,
        sortBy,
        sortOrder,
        refresh,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load shift entries.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo, filters, page, search, sortBy, sortOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  function changeFilter(name: keyof typeof filters, value: string) {
    setPage(1);
    setFilters((current) => ({ ...current, [name]: value }));
  }

  const options = data?.filter_options ?? {};

  return (
    <main className="shift-manpower">
      <header className="shift-manpower__header">
        <div>
          <p className="shift-manpower__eyebrow">ERC Mk-V · Operations</p>
          <h1>Shift Entries</h1>
          <p>Source-level shift records with formula status, data completeness, and verified reference links.</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={loading || refreshing}>
          {refreshing ? "Refreshing…" : "Refresh source"}
        </button>
      </header>

      {data && <SourceState data={data} />}

      {data && (
        <>
          <section className="shift-manpower__metrics" aria-label="Filtered entry summary">
            <Metric title="Entries" value={String(data.summary.entry_count)} detail={`${data.summary.dated_entry_count} dated · ${data.summary.incomplete_entry_count} incomplete`} />
            <Metric title="Output Qty*" value={number(data.summary.output_qty.known_total, 0)} detail={measureDetail(data.summary.output_qty.known_value_count, data.summary.output_qty.missing_value_count)} />
            <Metric title="Downtime" value={`${number(data.summary.downtime_min.known_total, 1)} min`} detail={measureDetail(data.summary.downtime_min.known_value_count, data.summary.downtime_min.missing_value_count)} />
            <Metric title="Total rejects" value={number(data.summary.total_rejects.known_total, 0)} detail={measureDetail(data.summary.total_rejects.known_value_count, data.summary.total_rejects.missing_value_count)} />
            <Metric title="Manpower observations" value={String(data.summary.manpower_observation_count)} detail="Rows with numeric actual manpower" />
            <Metric title="Heat/lot unmatched" value={String(data.summary.unmatched_heat_lot_count)} detail="Composite-key reference check" />
          </section>

          <p className="shift-manpower__definition">
            Output Qty has no unit in its source header; reject values are source counts. Downtime
            and planned shutdown use minutes; cycle times use seconds. Percentages are source
            fractions displayed as percent. The sheet defines Actual CT from remaining shift time
            divided by output, Efficiency as rated CT ÷ actual CT, Availability as remaining
            planned time after downtime ÷ planned time, Performance as output × rated CT ÷ run
            time, Quality as (output − total rejects) ÷ output, and OEE as Availability ×
            Performance × Quality. No cross-entry weighted OEE is added. Totals include known
            values only and display missing-value counts; blank cells are not zero.
          </p>
          {(data.quality_summary_by_work_center ?? []).length > 0 && (
            <section className="line-dashboard__chart" aria-label="Quality and rejection by work center">
              <h2>Work-center rejection and quality</h2>
              <p className="line-dashboard__note">Dated Entries rows only; blank template rows are excluded. Reject values are source counts and missing cells remain gaps.</p>
              <ReactECharts
                option={buildQualityByWorkCenterOption(data.quality_summary_by_work_center ?? [])}
                style={{ height: 380, width: "100%" }}
                notMerge
              />
            </section>
          )}
        </>
      )}

      <form className="shift-manpower__filters" onSubmit={submitFilters}>
        <label>
          Search
          <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Machine, part, description…" />
        </label>
        <label>
          From
          <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} />
        </label>
        <label>
          To
          <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />
        </label>
        {([
          ["shift", "Shift"],
          ["workCenter", "Work center"],
          ["machine", "Machine"],
          ["part", "Part"],
          ["source", "Source"],
          ["downtimeCategory", "Downtime category"],
          ["breakdownType", "Breakdown type"],
          ["statusVsRated", "Status vs rated"],
        ] as const).map(([key, label]) => {
          const optionKey = key === "workCenter" ? "work_center"
            : key === "downtimeCategory" ? "downtime_category"
              : key === "breakdownType" ? "breakdown_type"
              : key === "statusVsRated" ? "status_vs_rated"
                : key;
          return (
            <label key={key}>
              {label}
              <select value={filters[key]} onChange={(event) => changeFilter(key, event.target.value)}>
                <option value="">All</option>
                {(options[optionKey] ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          );
        })}
        <label>
          Sort by
          <select value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }}>
            <option value="date">Date</option><option value="shift">Shift</option>
            <option value="work_center">Work center</option><option value="machine">Machine</option>
            <option value="output_qty">Output quantity</option><option value="downtime_min">Downtime</option>
            <option value="total_rejects">Total rejects</option><option value="oee_fraction">OEE</option>
            <option value="actual_manpower">Actual manpower</option>
          </select>
        </label>
        <label>
          Order
          <select value={sortOrder} onChange={(event) => { setSortOrder(event.target.value as "asc" | "desc"); setPage(1); }}>
            <option value="desc">Descending</option><option value="asc">Ascending</option>
          </select>
        </label>
        <button type="submit">Apply search</button>
      </form>

      {error && <p role="alert" className="shift-manpower__error">{error}</p>}
      {loading && !data && <p role="status">Loading shift entries…</p>}
      {data && !loading && data.records.length === 0 && <p role="status">No entries match these filters.</p>}

      {data && data.records.length > 0 && (
        <>
          <div className="shift-manpower__table-wrap">
            <table className="shift-manpower__table">
              <thead>
                <tr>
                  <th>Source row / date</th><th>Shift</th><th>Machine</th><th>Part</th>
                  <th>Output Qty*</th><th>Actual CT / rated CT (sec)</th><th>Efficiency / status</th>
                  <th>Downtime / planned shutdown (min)</th><th>Total rejects</th>
                  <th>Availability / Performance / Quality / OEE</th>
                  <th>Planned / actual / shortfall (people)</th><th>References</th><th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((row) => <EntryTableRow key={row.source_row} row={row} />)}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pageCount={data.page_count}
            recordCount={data.filtered_record_count}
            onPage={setPage}
            loading={loading}
          />
        </>
      )}
    </main>
  );
}

function EntryTableRow({ row }: { row: ShiftEntryRow }) {
  const machineHref = row.machine_match === "matched" && row.work_center && row.machine
    ? buildLineTrackerWorksheetHash("machine-master", { work_center: row.work_center, machine: row.machine })
    : null;
  const heatHref = row.heat_lot_match === "matched" && row.rm_heat_number && row.lot_number
    ? buildLineTrackerWorksheetHash("heat-lot-number-reference", {
        heat_no: row.rm_heat_number,
        lot_no: row.lot_number,
      })
    : null;
  const entries = [
    ["Date", row.date], ["Shift", row.shift], ["Shift Duration (min)", row.shift_duration_min],
    ["Source", row.source], ["Work Center", row.work_center], ["Machine", row.machine],
    ["Rated CT (sec)", row.rated_ct_sec], ["Output Qty", row.output_qty],
    ["Downtime (min)", row.downtime_min], ["Rejects (Other Ops)", row.rejects_other_ops],
    ["Actual CT (sec)", row.actual_ct_sec], ["Efficiency %", percent(row.efficiency_fraction)],
    ["Status vs Rated", row.status_vs_rated], ["Downtime Category", row.downtime_category],
    ["Breakdown Type", row.breakdown_type], ["Downtime Description", row.downtime_description],
    ["Planned Shutdown (min)", row.planned_shutdown_min],
    ["Availability %", percent(row.availability_fraction)],
    ["Performance %", percent(row.performance_fraction)],
    ["Quality %", percent(row.quality_fraction)], ["OEE %", percent(row.oee_fraction)],
    ["Planned Manpower", row.planned_manpower], ["Actual Manpower", row.actual_manpower],
    ["Manpower Shortfall", row.manpower_shortfall], ["RM Heat Nr", row.rm_heat_number],
    ["Bundle Nr", row.bundle_number], ["Lot Number", row.lot_number], ["Part", row.part],
    ["OP10 Rejects (Forming)", row.op10_rejects_forming],
    ["OP20 Rejects (Forming)", row.op20_rejects_forming],
    ["OP30 Rejects (Forming)", row.op30_rejects_forming], ["Total Rejects", row.total_rejects],
  ];
  return (
    <tr className={row.record_status === "incomplete" ? "is-incomplete" : ""}>
      <td>{display(row.source_row)}<br />{display(row.date)}{row.record_status === "incomplete" && <span className="shift-manpower__badge">Incomplete</span>}</td>
      <td>{display(row.shift)}</td>
      <td>{display(row.work_center)} / {display(row.machine)}<small>{row.machine_match === "matched" ? "Machine Master matched" : row.machine_match}</small></td>
      <td>{display(row.part)}</td>
      <td>{display(row.output_qty)}</td>
      <td>{display(row.actual_ct_sec)} / {display(row.rated_ct_sec)}</td>
      <td>{percent(row.efficiency_fraction)}<small>{display(row.status_vs_rated)}</small></td>
      <td>{display(row.downtime_min)} / {display(row.planned_shutdown_min)}</td>
      <td>{display(row.total_rejects)}</td>
      <td>{percent(row.availability_fraction)} / {percent(row.performance_fraction)} / {percent(row.quality_fraction)} / {percent(row.oee_fraction)}</td>
      <td>{display(row.planned_manpower)} / {display(row.actual_manpower)} / {display(row.manpower_shortfall)}</td>
      <td>
        {machineHref && <a href={machineHref}>Machine</a>}
        {heatHref && <a href={heatHref}>Heat/lot</a>}
        {!heatHref && row.rm_heat_number && <small>Heat/lot {row.heat_lot_match}</small>}
        {!machineHref && !row.rm_heat_number && "—"}
      </td>
      <td>
        <details>
          <summary>Source fields</summary>
          <dl>
            {entries.map(([label, value]) => (
              <div key={label}>
                <dt>{label}{row.formula_derived_fields.includes(label as string) && <em> · formula</em>}</dt>
                <dd>{display(value)}</dd>
              </div>
            ))}
            {Object.entries(row.formula_validations).map(([field, state]) => (
              <div key={`check-${field}`}><dt>{field} check</dt><dd>{state}</dd></div>
            ))}
            {row.formula_unverified_fields.map((field) => (
              <div key={`missing-${field}`}><dt>{field} check</dt><dd>Not independently verifiable from populated inputs</dd></div>
            ))}
          </dl>
        </details>
      </td>
    </tr>
  );
}

function Pagination({
  page,
  pageCount,
  recordCount,
  onPage,
  loading,
}: {
  page: number;
  pageCount: number;
  recordCount: number;
  onPage: (page: number) => void;
  loading: boolean;
}) {
  return (
    <nav className="shift-manpower__pagination" aria-label="Pagination">
      <span>{recordCount} records · page {page} of {Math.max(pageCount, 1)}</span>
      <button type="button" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>Previous</button>
      <button type="button" disabled={page >= pageCount || pageCount === 0 || loading} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}

function ManpowerPage() {
  const [data, setData] = useState<ManpowerSummaryAnalyticsResponse | null>(null);
  const [level, setLevel] = useState<"machine" | "work-center">("machine");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setError(null);
    setLoading(true);
    setRefreshing(refresh);
    try {
      setData(await fetchManpowerSummaryAnalytics({
        level,
        page,
        pageSize: PAGE_SIZE,
        search,
        sortBy,
        sortOrder,
        refresh,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load manpower summary.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [level, page, search, sortBy, sortOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  return (
    <main className="shift-manpower">
      <header className="shift-manpower__header">
        <div>
          <p className="shift-manpower__eyebrow">ERC Mk-V · Operations</p>
          <h1>Manpower Summary</h1>
          <p>Separate source summaries by work center and machine, reconciled to Entries.</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={loading || refreshing}>
          {refreshing ? "Refreshing…" : "Refresh source"}
        </button>
      </header>
      {data && <SourceState data={data} />}
      {data && (
        <>
          <section className="shift-manpower__metrics">
            <Metric title="Work centers" value={String(data.summary.work_center_count)} detail={`${data.summary.work_center_reconciliation.matched} source sections reconcile`} />
            <Metric title="Machines" value={String(data.summary.machine_count)} detail={`${data.summary.machine_reconciliation.matched} source rows reconcile`} />
            <Metric title="Rated manpower conflicts" value={String(data.summary.rated_manpower_mismatch_count)} detail="Compared with Machine Master" />
            <Metric title="Actual manpower observations" value={String(data.summary.actual_manpower_observation_count)} detail={`Across ${data.summary.dated_entry_count} dated entries`} />
          </section>
          <p className="shift-manpower__definition">
            Rated manpower is a source planning assumption, not measured staffing. Averages use
              nonblank planned/actual values; shortfall is the source sum. These are machine/shift
              headcount values and not unique people. The source “Shifts Logged”
            formula counts entries with a nonblank Actual Manpower cell, not all production-entry rows.
            Productivity per person is not calculated.
          </p>
          {data.records.length > 0 && (
            <section className="line-dashboard__chart" aria-label={`${level} manpower comparison`}>
              <h2>{level === "machine" ? "Machine manpower comparison" : "Work-center manpower comparison"}</h2>
              <p className="line-dashboard__note">
                Source-backed headcount per shift. Rated manpower is a planning assumption; actual values are observed Entries data. Blank values remain chart gaps.
              </p>
              <ReactECharts
                option={buildManpowerComparisonOption(data.records)}
                style={{ height: Math.max(300, data.records.length * 38), width: "100%" }}
                notMerge
              />
            </section>
          )}
        </>
      )}
      <div className="shift-manpower__toolbar">
        <div role="group" aria-label="Summary level">
          <button type="button" aria-pressed={level === "machine"} onClick={() => { setLevel("machine"); setPage(1); }}>By machine</button>
          <button type="button" aria-pressed={level === "work-center"} onClick={() => { setLevel("work-center"); setPage(1); }}>By work center</button>
        </div>
        <form onSubmit={submitSearch}>
          <label>Search <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Machine or work center" /></label>
          <button type="submit">Search</button>
        </form>
        <label>
          Sort
          <select value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }}>
            <option value="name">Name</option><option value="rated_manpower_per_shift">Rated manpower</option>
            <option value="avg_planned">Average planned</option><option value="avg_actual">Average actual</option>
            <option value="total_shortfall">Total shortfall</option><option value="source_shifts_logged">Source shifts logged</option>
            <option value="dated_entry_count">Dated entry count</option>
          </select>
        </label>
        <label>
          Order
          <select value={sortOrder} onChange={(event) => { setSortOrder(event.target.value as "asc" | "desc"); setPage(1); }}>
            <option value="asc">Ascending</option><option value="desc">Descending</option>
          </select>
        </label>
      </div>

      {data && (
        <p className="shift-manpower__coverage">
          Manpower Summary formulas reference Entries rows {data.formula_coverage.entry_source_first_row}–
          {data.formula_coverage.entry_source_last_row} ({data.formula_coverage.entry_source_rows} rows).
          Current range contains {data.formula_coverage.entry_rows_with_machine} machine-keyed rows,
          including {data.formula_coverage.dated_entry_count} dated entries.
        </p>
      )}
      {error && <p role="alert" className="shift-manpower__error">{error}</p>}
      {loading && !data && <p role="status">Loading manpower summary…</p>}
      {data && !loading && data.records.length === 0 && <p role="status">No summary rows match this search.</p>}
      {data && data.records.length > 0 && (
        <>
          <div className="shift-manpower__table-wrap">
            <table className="shift-manpower__table shift-manpower__table--manpower">
              <thead><tr>
                <th>{level === "machine" ? "Machine" : "Work center"}</th>
                {level === "machine" && <th>Rated manpower / shift</th>}
                <th>Average planned</th><th>Average actual</th><th>Total shortfall</th>
                <th>Source shifts logged*</th><th>Dated Entries rows</th>
                <th>Reconciliation</th>
              </tr></thead>
              <tbody>
                {data.records.map((row) => (
                  <tr key={`${row.source_row}-${row.name}`}>
                    <td>{display(row.name)}</td>
                    {level === "machine" && <td>{number(row.rated_manpower_per_shift)}</td>}
                    <td>{number(row.avg_planned)}</td><td>{number(row.avg_actual)}</td>
                    <td>{display(row.total_shortfall)}</td><td>{display(row.source_shifts_logged)}</td>
                    <td>{row.dated_entry_count} / {row.entry_row_count}</td>
                    <td>
                      <span className={`shift-manpower__badge ${row.formula_reconciliation === "matched" ? "is-matched" : "is-warning"}`}>
                        {row.formula_reconciliation}
                      </span>
                      {level === "machine" && row.rated_manpower_reconciliation !== "not_applicable" && (
                        <small>Rated vs Master: {row.rated_manpower_reconciliation}</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageCount={data.page_count} recordCount={data.filtered_record_count} onPage={setPage} loading={loading} />
        </>
      )}
      <p className="shift-manpower__footnote">
        *The worksheet’s “Shifts Logged” is based on nonblank Actual Manpower, so it can be lower
        than the dated-entry count. Blank planned/actual cells remain blank in the detail rows.
      </p>
    </main>
  );
}

export function ShiftManpowerAnalyticsPage({
  pageKey,
}: {
  pageKey: "entries" | "manpower-summary";
}) {
  return pageKey === "entries" ? <EntriesPage /> : <ManpowerPage />;
}
