import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import ReactECharts from "echarts-for-react";

import {
  fetchCapacityDashboard,
  fetchDashboardSummary,
  fetchProductionDashboard,
  type CapacityDashboardResponse,
  type DashboardAnalyticsResponse,
  type DashboardPeriodRow,
  type DashboardSummaryResponse,
  type ProductionDashboardResponse,
} from "../../services/lineTrackerWorksheetsApi";
import { buildLineTrackerWorksheetHash } from "../../services/lineTrackerWorksheetRoutes";
import { formatAssetNumber } from "./rawMaterialFormatting";
import "../../styles/line-tracker-dashboards.css";

export type DashboardPageKey = "production-dashboard" | "dashboard" | "summary";

function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function numeric(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : formatAssetNumber(value, digits);
}

function percentage(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${formatAssetNumber(value * 100, 1)}%`;
}

function isValidRatedCycleTime(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidMachineCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function SourceStatus({ data }: { data: DashboardAnalyticsResponse }) {
  return (
    <section className="line-dashboard__source" aria-label="Dashboard source status">
      <strong>Read-only Google Sheets</strong>
      <span>Last fetched: {text(data.fetched_at)}</span>
      <span>{data.cache_hit ? "Cached" : "Fresh source request"}</span>
      <ul>
        {Object.entries(data.sources).map(([key, source]) => (
          <li key={key} className={source.is_stale ? "is-stale" : ""}>
            {source.worksheet} · sheet {source.worksheet_id}
            {source.is_stale ? " · stale cache" : ""}
            {source.refresh_error ? ` · ${source.refresh_error}` : ""}
          </li>
        ))}
      </ul>
      {data.is_stale && (
        <p role="status" className="line-dashboard__warning">
          Source refresh failed; the displayed values may be stale.
        </p>
      )}
      {data.validation_warnings.map((warning) => (
        <p key={warning} className="line-dashboard__warning">{warning}</p>
      ))}
    </section>
  );
}

function PageTabs({ active }: { active: DashboardPageKey }) {
  const tabs: Array<[DashboardPageKey, string]> = [
    ["production-dashboard", "Production Dashboard"],
    ["dashboard", "Capacity Dashboard"],
    ["summary", "Summary"],
  ];
  return (
    <nav className="line-dashboard__tabs" aria-label="Dashboard worksheets">
      {tabs.map(([key, label]) => (
        <a
          key={key}
          href={buildLineTrackerWorksheetHash(key)}
          aria-current={key === active ? "page" : undefined}
          className={key === active ? "is-active" : ""}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="line-dashboard__metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function useDashboardLoad<T extends DashboardAnalyticsResponse>(
  fetcher: (refresh: boolean) => Promise<T>,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasData = useRef(false);
  const load = useCallback(async (refresh = false) => {
    setError(null);
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    try {
      setData(await fetcher(refresh));
      hasData.current = true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetcher]);
  const loadWith = useCallback(async (request: Promise<T>) => {
    setError(null);
    try {
      setData(await request);
      hasData.current = true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load dashboard data.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, setData, loading, refreshing, error, load, loadWith };
}

export type DashboardLoadState<T extends DashboardAnalyticsResponse> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  load: (refresh?: boolean) => Promise<void>;
  loadWith: (request: Promise<T>) => Promise<void>;
};

function ProductionDashboard() {
  const fetcher = useCallback(
    (refresh: boolean) => fetchProductionDashboard({ refresh }),
    [],
  );
  const state = useDashboardLoad<ProductionDashboardResponse>(fetcher);
  return <ProductionDashboardView state={state} />;
}

export function ProductionDashboardView({
  state,
}: {
  state: DashboardLoadState<ProductionDashboardResponse>;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stage, setStage] = useState("");
  const [machine, setMachine] = useState("");

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await state.loadWith(fetchProductionDashboard({ dateFrom, dateTo, stage, machine }));
  }

  return (
    <>
      <header className="line-dashboard__header">
        <div>
          <p>ERC Mk-V · Production trends</p>
          <h1>Production Dashboard</h1>
          <span>Historical Downtime Log rollup · latest source date {text(state.data?.latest_log_date)}</span>
        </div>
        <button type="button" onClick={() => void state.load(true)} disabled={state.loading || state.refreshing}>
          {state.refreshing ? "Refreshing…" : "Refresh source"}
        </button>
      </header>
      {state.data && <SourceStatus data={state.data} />}
      {state.error && <p role="alert" className="line-dashboard__error">{state.error}</p>}
      {state.data && (
        <>
          <section className="line-dashboard__metrics">
            <Metric label="Output NOS" value={numeric(state.data.summary.output_nos.total, 0)} hint={`${state.data.summary.output_nos.known_count} known · ${state.data.summary.output_nos.missing_count} missing`} />
            <Metric label="Target NOS" value={numeric(state.data.summary.target_nos.total, 0)} hint={`${state.data.summary.target_nos.known_count} known · ${state.data.summary.target_nos.missing_count} missing`} />
            <Metric label="Downtime" value={`${numeric(state.data.summary.downtime_hours.total)} hrs`} hint={`${state.data.summary.downtime_hours.known_count} known durations`} />
            <Metric label="Average daily Fill %" value={percentage(state.data.summary.average_daily_fill_fraction)} hint={`${state.data.summary.days_with_fill} days with a valid target`} />
          </section>
          <form className="line-dashboard__filters" onSubmit={(event) => void applyFilters(event)}>
            <label>From<input type="date" value={dateFrom || state.data.date_from} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label>To<input type="date" value={dateTo || state.data.date_to} onChange={(event) => setDateTo(event.target.value)} /></label>
            <label>Stage<select value={stage} onChange={(event) => setStage(event.target.value)}><option value="">All stages</option>{state.data.filter_options.stages.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Machine<select value={machine} onChange={(event) => setMachine(event.target.value)}><option value="">All machines</option>{state.data.filter_options.machines.map((value) => <option key={value}>{value}</option>)}</select></label>
            <button type="submit">Apply filters</button>
          </form>
          <p className="line-dashboard__note">
            The source labels its Stage filter “Work Center”, but its formulas match the Downtime Log Stage column; this page filters by that actual source column. Daily Fill % is Output NOS ÷ Target NOS. Downtime minutes are converted to hours. Missing targets or durations remain missing and are not zero-filled.
          </p>
          {state.data.reconciliation.mismatch_count > 0 && (
            <p className="line-dashboard__warning">Source dashboard daily values differ on {state.data.reconciliation.mismatch_count} of {state.data.reconciliation.source_daily_values_checked} comparable fields.</p>
          )}
          {state.data.reconciliation.source_summary_mismatch_count > 0 && (
            <p className="line-dashboard__warning">The source dashboard summary cells differ on {state.data.reconciliation.source_summary_mismatch_count} of {state.data.reconciliation.source_summary_values_checked} comparable values.</p>
          )}
          {state.data.missing_dates.length > 0 && (
            <p className="line-dashboard__warning">No historical source records for {state.data.missing_dates.length} calendar day(s) in this range. These dates are not plotted as zero output.</p>
          )}
          {state.data.records.length > 0 && (
            <section className="line-dashboard__chart" aria-label="Daily production trend">
              <h2>Daily output vs target</h2>
              <ReactECharts
                option={{
                  tooltip: { trigger: "axis" },
                  legend: { data: ["Output NOS", "Target NOS"] },
                  grid: { left: 64, right: 24, top: 44, bottom: 48 },
                  xAxis: { type: "category", data: state.data.records.map((row) => row.date) },
                  yAxis: { type: "value", name: "NOS" },
                  series: [
                    { name: "Output NOS", type: "line", connectNulls: false, data: state.data.records.map((row) => row.output_nos) },
                    { name: "Target NOS", type: "line", connectNulls: false, data: state.data.records.map((row) => row.target_nos) },
                  ],
                }}
                style={{ height: 300 }}
                notMerge
              />
            </section>
          )}
          {state.data.records.length === 0 ? <p className="line-dashboard__empty">No records match these filters.</p> : (
            <div className="line-dashboard__table-wrap">
              <table><thead><tr><th>Date</th><th>Output NOS</th><th>Target NOS</th><th>Downtime (hrs)</th><th>Fill %</th><th>Source rows</th></tr></thead>
                <tbody>{state.data.records.map((row) => <tr key={row.date}><td>{row.date}</td><td>{numeric(row.output_nos, 0)}</td><td>{numeric(row.target_nos, 0)}</td><td>{numeric(row.downtime_hours)}</td><td>{percentage(row.fill_fraction)}</td><td>{row.source_record_count}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
      {state.loading && !state.data && <p>Loading Production Dashboard…</p>}
    </>
  );
}

function SummaryDashboard() {
  const fetcher = useCallback(
    (refresh: boolean) => fetchDashboardSummary({ refresh }),
    [],
  );
  const state = useDashboardLoad<DashboardSummaryResponse>(fetcher);
  return <SummaryDashboardView state={state} />;
}

export function SummaryDashboardView({
  state,
}: {
  state: DashboardLoadState<DashboardSummaryResponse>;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [periodRows, setPeriodRows] = useState<"months" | "years">("months");

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await state.loadWith(fetchDashboardSummary({ dateFrom, dateTo }));
  }

  const rows: DashboardPeriodRow[] = state.data?.[periodRows] ?? [];
  const totalTarget = rows.reduce((sum, row) => sum + (row.target_known_count > 0 ? row.target_nos ?? 0 : 0), 0);
  const totalActual = rows.reduce((sum, row) => sum + (row.actual_known_count > 0 ? row.actual_nos ?? 0 : 0), 0);
  const totalDowntime = rows.reduce((sum, row) => sum + (row.downtime_known_count > 0 ? row.downtime_hours ?? 0 : 0), 0);
  const totalBreakdown = rows.reduce((sum, row) => sum + (row.breakdown_known_count > 0 ? row.breakdown_hours ?? 0 : 0), 0);
  const knownAvailability = rows.filter((row) => row.approx_availability_fraction !== null);
  const averageAvailability = knownAvailability.length
    ? knownAvailability.reduce((sum, row) => sum + (row.approx_availability_fraction ?? 0), 0) / knownAvailability.length
    : null;
  const achievement = totalTarget > 0 ? totalActual / totalTarget : null;
  return (
    <>
      <header className="line-dashboard__header">
        <div><p>ERC Mk-V · Historical summary</p><h1>Summary</h1><span>Month-wise and year-wise Downtime Log aggregates</span></div>
        <button type="button" onClick={() => void state.load(true)} disabled={state.loading || state.refreshing}>{state.refreshing ? "Refreshing…" : "Refresh source"}</button>
      </header>
      {state.data && <SourceStatus data={state.data} />}
      {state.error && <p role="alert" className="line-dashboard__error">{state.error}</p>}
      {state.data && <>
        <section className="line-dashboard__metrics" aria-label="Summary KPI scorecards">
          <Metric label="Total Target NOS" value={numeric(totalTarget, 0)} />
          <Metric label="Total Actual NOS" value={numeric(totalActual, 0)} />
          <Metric label="Overall Achievement" value={percentage(achievement)} />
          <Metric label="Total Downtime" value={`${numeric(totalDowntime)} hrs`} />
          <Metric label="Breakdown Hours" value={`${numeric(totalBreakdown)} hrs`} />
          <Metric label="Approx. Availability" value={percentage(averageAvailability)} />
        </section>
        <section className="line-dashboard__insight" aria-label="Executive pattern insight">
          <strong>Executive pattern insight</strong>
          <p>
            {achievement === null
              ? "Production achievement is unavailable for the selected period because comparable target values are missing."
              : `Known production records achieved ${percentage(achievement)} of the selected target volume. Missing target months remain visible as gaps rather than being treated as zero.`}
          </p>
        </section>
        <form className="line-dashboard__filters" onSubmit={(event) => void applyFilters(event)}>
          <label>From<input type="date" value={dateFrom || state.data.data_quality.date_range.from} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>To<input type="date" value={dateTo || state.data.data_quality.date_range.to} onChange={(event) => setDateTo(event.target.value)} /></label>
          <button type="submit">Apply period</button>
          <button type="button" onClick={() => setPeriodRows((current) => current === "months" ? "years" : "months")}>
            Show {periodRows === "months" ? "yearly" : "monthly"} view
          </button>
        </form>
        <p className="line-dashboard__note">
          Fill % is Actual NOS ÷ Target NOS; source target coverage is incomplete in 2024 and early months. Approx. Availability is the source estimate 1 − Downtime Hours ÷ (calendar days × 24 × 27 machines), not measured uptime or OEE availability. Breakdown Hours include only rows whose Downtime Category is exactly “Breakdown”.
        </p>
        {state.data.data_quality.november_2024_source_records === 0 && (
          <p className="line-dashboard__warning">November 2024 has no Downtime Log records (source data gap), not a verified zero-downtime month.</p>
        )}
        {state.data.data_quality.formula_zero_missing_downtime_periods.length > 0 && (
          <p className="line-dashboard__warning">
            The Summary worksheet reports zero downtime for {state.data.data_quality.formula_zero_missing_downtime_periods.join(", ")}, but those periods contain dated records with no downtime values. Downtime and Approx. Availability are shown as unavailable, not zero or 100%.
          </p>
        )}
        {state.data.missing_months.length > 0 && <p className="line-dashboard__warning">Source months absent from the monthly summary in this period: {state.data.missing_months.join(", ")}.</p>}
        {rows.length > 0 ? (
          <section className="line-dashboard__chart" aria-label={`${periodRows} production versus target`}>
            <h2>{periodRows === "months" ? "Monthly" : "Yearly"} actual production vs target</h2>
            <p className="line-dashboard__note">
              Source values are reported in NOS. Periods with missing actual or target values are chart gaps, not zero.
            </p>
            <ReactECharts
              option={{
                tooltip: { trigger: "axis" },
                legend: { data: ["Actual NOS", "Target NOS"] },
                grid: { left: 76, right: 24, top: 44, bottom: 48 },
                xAxis: { type: "category", name: "Period", data: rows.map((row) => row.period) },
                yAxis: { type: "value", name: "NOS" },
                series: [
                  {
                    name: "Actual NOS",
                    type: "bar",
                    data: rows.map((row) => row.actual_known_count > 0 ? row.actual_nos : null),
                  },
                  {
                    name: "Target NOS",
                    type: "bar",
                    data: rows.map((row) => row.target_known_count > 0 ? row.target_nos : null),
                  },
                ],
              }}
              style={{ height: Math.max(300, rows.length * 34), width: "100%" }}
              notMerge
            />
          </section>
        ) : (
          <p className="line-dashboard__note">
            No periods match the selected date range.
          </p>
        )}
        {rows.length > 0 && (
          <section className="line-dashboard__chart" aria-label={`${periodRows} downtime trend`}>
            <h2>{periodRows === "months" ? "Monthly" : "Yearly"} downtime trend</h2>
            <ReactECharts
              option={{
                tooltip: { trigger: "axis" },
                legend: { data: ["Downtime (hrs)", "Breakdown (hrs)"] },
                grid: { left: 64, right: 24, top: 44, bottom: 48 },
                xAxis: { type: "category", data: rows.map((row) => row.period) },
                yAxis: { type: "value", name: "Hours" },
                series: [
                  { name: "Downtime (hrs)", type: "line", connectNulls: false, data: rows.map((row) => row.downtime_hours) },
                  { name: "Breakdown (hrs)", type: "line", connectNulls: false, data: rows.map((row) => row.breakdown_hours) },
                ],
              }}
              style={{ height: 300 }}
              notMerge
            />
          </section>
        )}
        <div className="line-dashboard__table-wrap">
          {rows.length === 0 ? <p className="line-dashboard__empty">No periods match the selected date range.</p> : (
            <table><thead><tr><th>{periodRows === "months" ? "Month" : "Year"}</th><th>Downtime (hrs)</th><th>Breakdown (hrs)</th><th>Target NOS</th><th>Actual NOS</th><th>Fill %</th><th>Approx. Availability %</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.period}><td>{row.period}</td><td>{numeric(row.downtime_hours)}</td><td>{numeric(row.breakdown_hours)}</td><td>{row.target_known_count ? numeric(row.target_nos, 0) : "—"}</td><td>{row.actual_known_count ? numeric(row.actual_nos, 0) : "—"}</td><td>{percentage(row.fill_fraction)}</td><td>{percentage(row.approx_availability_fraction)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
        <h2>Per-shift Availability from Entries</h2>
        <p className="line-dashboard__note">This is a separate, source-defined per-shift Entries measure; it is not combined with the historical approximate availability above.</p>
        <div className="line-dashboard__table-wrap"><table><thead><tr><th>Work Center</th><th>Average source Availability</th><th>Shifts logged</th></tr></thead><tbody>{Object.entries(state.data.entry_availability_by_work_center).map(([center, value]) => <tr key={center}><td>{center}</td><td>{percentage(value.average_fraction)}</td><td>{value.shift_count}</td></tr>)}</tbody></table></div>
      </>}
      {state.loading && !state.data && <p>Loading Summary…</p>}
    </>
  );
}

function CapacityDashboard() {
  const fetcher = useCallback((refresh: boolean) => fetchCapacityDashboard(refresh), []);
  const state = useDashboardLoad<CapacityDashboardResponse>(fetcher);
  return <CapacityDashboardView state={state} />;
}

export function CapacityDashboardView({
  state,
}: {
  state: DashboardLoadState<CapacityDashboardResponse>;
}) {
  const rows = state.data?.records ?? [];
  const ratedMachineCountRows = rows.filter((row) => isValidMachineCount(row.rated_machine_count));
  const ratedCycleTimeRows = rows.filter((row) => isValidRatedCycleTime(row.effective_rated_ct_sec));
  const missingRatedCtWorkCenters = rows
    .filter((row) => !isValidRatedCycleTime(row.effective_rated_ct_sec))
    .map((row) => row.work_center);
  const invalidRatedMachineCountWorkCenters = rows
    .filter((row) => !isValidMachineCount(row.rated_machine_count))
    .map((row) => row.work_center);
  return (
    <>
      <header className="line-dashboard__header">
        <div><p>ERC Mk-V · Rated capacity and logged performance</p><h1>Dashboard</h1><span>Work-center rated cycle time with Entries performance</span></div>
        <button type="button" onClick={() => void state.load(true)} disabled={state.loading || state.refreshing}>{state.refreshing ? "Refreshing…" : "Refresh source"}</button>
      </header>
      {state.data && <SourceStatus data={state.data} />}
      {state.error && <p role="alert" className="line-dashboard__error">{state.error}</p>}
      {state.data && <>
        <section className="line-dashboard__metrics">
          <Metric label="Registered machines" value={String(state.data.summary.registered_machines)} />
          <Metric label="Active with rated CT" value={String(state.data.summary.active_rated_machines)} />
          <Metric label="Rated bottleneck CT" value={`${numeric(state.data.summary.theoretical_bottleneck_ct_sec, 2)} sec`} hint="Maximum effective rated CT across work centers" />
          <Metric label="Theoretical output" value={`${numeric(state.data.summary.theoretical_output_pcs_per_hour, 0)} pcs/hr`} hint="Source-labeled theoretical rate, not actual capacity" />
        </section>
        <section className="line-dashboard__chart" aria-label="Active rated machines by work center">
          <h2>Rated-machine coverage by work center</h2>
          <p className="line-dashboard__note">
            Count of active machines with a valid rated cycle time. This is the source-supported capacity basis, not an output rate or actual production measure.
          </p>
          <p className="line-dashboard__warning">
            The API provides theoretical output per hour only as a plant-level summary, not by work center. A comparable per-work-center output-rate chart is therefore not shown.
          </p>
          {ratedMachineCountRows.length > 0 ? (
            <ReactECharts
              option={{
                tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
                grid: { left: 150, right: 28, top: 20, bottom: 36 },
                xAxis: { type: "value", name: "Active rated machines", minInterval: 1 },
                yAxis: {
                  type: "category",
                  data: ratedMachineCountRows.map((row) => row.work_center).reverse(),
                },
                series: [{
                  name: "Active rated machines",
                  type: "bar",
                  data: ratedMachineCountRows.map((row) => row.rated_machine_count).reverse(),
                }],
              }}
              style={{ height: Math.max(260, ratedMachineCountRows.length * 38), width: "100%" }}
              notMerge
            />
          ) : (
            <p className="line-dashboard__empty">No valid rated-machine counts are available.</p>
          )}
          {invalidRatedMachineCountWorkCenters.length > 0 && (
            <p className="line-dashboard__warning">
              Rated-machine counts are invalid for: {invalidRatedMachineCountWorkCenters.join(", ")}. These work centers are omitted from the chart.
            </p>
          )}
        </section>
        <section className="line-dashboard__chart" aria-label="Effective rated cycle time by work center">
          <h2>Effective rated cycle time by work center</h2>
          <p className="line-dashboard__note">
            Seconds per cycle under the source rated-capacity definition; a lower value indicates faster theoretical processing, not actual production performance.
          </p>
          {ratedCycleTimeRows.length > 0 ? (
            <ReactECharts
              option={{
                tooltip: {
                  trigger: "axis",
                  axisPointer: { type: "shadow" },
                  valueFormatter: (value: number | string) => `${value} sec`,
                },
                legend: { data: ["Effective rated CT (sec)", "Average actual CT (sec)"] },
                grid: { left: 150, right: 36, top: 20, bottom: 36 },
                xAxis: { type: "value", name: "Effective rated CT (sec)", min: 0 },
                yAxis: {
                  type: "category",
                  data: ratedCycleTimeRows.map((row) => row.work_center).reverse(),
                },
                series: [{
                  name: "Effective rated CT (sec)",
                  type: "bar",
                  data: ratedCycleTimeRows
                    .map((row) => row.effective_rated_ct_sec)
                    .reverse(),
                }, {
                  name: "Average actual CT (sec)",
                  type: "bar",
                  data: ratedCycleTimeRows.map((row) => row.avg_actual_ct_sec ?? null).reverse(),
                }],
              }}
              style={{ height: Math.max(260, ratedCycleTimeRows.length * 38), width: "100%" }}
              notMerge
            />
          ) : (
            <p className="line-dashboard__empty">No work centers have a valid effective rated cycle time.</p>
          )}
          {missingRatedCtWorkCenters.length > 0 && (
            <p className="line-dashboard__warning">
              No rated cycle-time value is available for: {missingRatedCtWorkCenters.join(", ")}. These work centers are omitted from the cycle-time chart, not plotted as zero.
            </p>
          )}
        </section>
        <div className="line-dashboard__table-wrap"><table><thead><tr><th>Work Center</th><th>All master machines</th><th>Active rated machines</th><th>Effective CT (sec)</th><th>Source CT (sec)</th><th>Capacity bottleneck</th><th>Avg Actual CT (sec)</th><th>Entries Output Qty*</th><th>Rejects (source count)</th><th>Avg Efficiency</th></tr></thead>
          <tbody>{state.data.records.map((row) => <tr key={row.work_center}><td><a href={buildLineTrackerWorksheetHash("machine-master", { work_center: row.work_center })}>{row.work_center}</a></td><td>{row.machine_count}</td><td>{row.rated_machine_count}</td><td>{numeric(row.effective_rated_ct_sec, 3)}</td><td>{numeric(row.source_effective_rated_ct_sec, 3)}</td><td>{row.is_bottleneck ? "Source-defined theoretical bottleneck" : "—"}</td><td>{numeric(row.avg_actual_ct_sec, 2)}</td><td>{row.output_nos?.known_count ? numeric(row.output_nos.total, 0) : "—"}</td><td>{row.total_rejects?.known_count ? numeric(row.total_rejects.total, 0) : "—"}</td><td>{percentage(row.avg_efficiency_fraction)}</td></tr>)}</tbody>
        </table></div>
        <p className="line-dashboard__note">* Entries’ Output Qty has no declared unit in its source header; NOS labels above come from this Dashboard sheet and may not describe the Entries values. Efficiency is a simple average of source row fractions, not a weighted measure. Machine links open the corresponding Machine Master work-center filter.</p>
      </>}
      {state.loading && !state.data && <p>Loading Dashboard…</p>}
    </>
  );
}

export function DashboardAnalyticsPage({ pageKey }: { pageKey: DashboardPageKey }) {
  return (
    <main className="line-dashboard">
      <PageTabs active={pageKey} />
      {pageKey === "production-dashboard" ? <ProductionDashboard /> : pageKey === "dashboard" ? <CapacityDashboard /> : <SummaryDashboard />}
    </main>
  );
}
