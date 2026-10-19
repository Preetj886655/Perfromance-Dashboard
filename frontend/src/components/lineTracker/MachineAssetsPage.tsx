import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  fetchCapacityChangeAnalytics,
  fetchMachineConsumablesAnalytics,
  fetchMachineMasterAnalytics,
  fetchPlannedShutdownAnalytics,
  type MachineConsumableRow,
  type MachineMasterRow,
  type CapacityChangeRow,
  type PlannedShutdownRow,
} from "../../services/lineTrackerWorksheetsApi";
import { buildLineTrackerWorksheetHash, parseLineTrackerWorksheetRoute } from "../../services/lineTrackerWorksheetRoutes";
import type { MachineAssetPageData } from "./MachineAssetShared";
import {
  MachineAssetSourceBanner,
  MachineAssetSourceRows,
  MachineAssetTabs,
  MetricCard,
} from "./MachineAssetShared";
import { formatAssetNumber } from "./rawMaterialFormatting";
import "../../styles/line-tracker-order-analytics.css";
import "../../styles/line-tracker-machine-assets.css";

export type MachineAssetPageKey =
  | "machine-master"
  | "machine-consumables"
  | "capacity-change-log"
  | "planned-shutdowns";

const PAGE_SIZE = 15;

const SORTS: Record<MachineAssetPageKey, Array<[string, string]>> = {
  "machine-master": [
    ["source_row", "Source row"], ["work_center", "Work center"], ["machine", "Machine"],
    ["rated_ct_sec", "Rated CT (sec)"], ["status", "Source status"],
    ["hourly_capacity", "Rated hourly capacity"], ["shift_capacity", "Rated shift capacity"],
    ["day_capacity", "Rated day capacity"], ["capacity_at_85_percent", "Rated day at 85%"],
  ],
  "machine-consumables": [
    ["source_row", "Source row"], ["work_center", "Work center"], ["machine", "Machine"],
    ["consumable", "Consumable"], ["category", "Category"],
    ["change_frequency", "Typical change frequency"], ["last_changed_date", "Last changed"],
    ["next_due_date", "Next due"], ["due_status", "Due-date status"],
  ],
  "capacity-change-log": [
    ["source_row", "Source row"], ["date_changed", "Date changed"],
    ["work_center", "Work center"], ["machine", "Machine"],
    ["old_rated_ct_sec", "Old CT (sec)"], ["new_rated_ct_sec", "New CT (sec)"],
    ["percentage_change", "CT change (%)"], ["classification", "Record classification"],
  ],
  "planned-shutdowns": [
    ["source_row", "Source row"], ["start_date", "Start date"], ["end_date", "End date"],
    ["scope", "Scope"], ["scope_detail", "Scope detail"],
    ["hours_affected_per_day", "Hours/day"], ["duration_days", "Duration (days)"],
    ["classification", "Record classification"], ["date_range_valid", "Date range validity"],
  ],
};

function routeParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return parseLineTrackerWorksheetRoute(window.location.hash)?.params ?? new URLSearchParams();
}

async function fetchAssetPage(
  pageKey: MachineAssetPageKey,
  options: {
    page: number;
    pageSize: number;
    search: string;
    workCenter: string;
    status: string;
    category: string;
    dueStatus: string;
    machine: string;
    classification: string;
    scope: string;
    sortBy: string;
    sortOrder: "asc" | "desc";
    refresh: boolean;
  },
): Promise<MachineAssetPageData> {
  if (pageKey === "machine-master") {
    return { kind: pageKey, data: await fetchMachineMasterAnalytics(options) };
  }
  if (pageKey === "machine-consumables") {
    return { kind: pageKey, data: await fetchMachineConsumablesAnalytics(options) };
  }
  if (pageKey === "capacity-change-log") {
    return { kind: pageKey, data: await fetchCapacityChangeAnalytics(options) };
  }
  return { kind: pageKey, data: await fetchPlannedShutdownAnalytics(options) };
}

function sourceUnitCapacity(value: number | null, suffix: string): string {
  return value === null ? "—" : `${formatAssetNumber(value)} ${suffix}`;
}

function classificationClass(value: string): string {
  return value === "example"
    ? "machine-assets__badge machine-assets__badge--example"
    : value === "confirmed"
      ? "machine-assets__badge machine-assets__badge--confirmed"
      : "machine-assets__badge machine-assets__badge--unverified";
}

function linkToMachine(workCenter: string | null, machine: string | null): string | null {
  if (!workCenter || !machine) return null;
  return buildLineTrackerWorksheetHash("machine-master", {
    work_center: workCenter,
    machine,
  });
}

export function MachineAssetsPage({ pageKey }: { pageKey: MachineAssetPageKey }) {
  const params = useRef(routeParams());
  const initialMachine = params.current.get("machine") ?? "";
  const initialWorkCenter = params.current.get("work_center") ?? "";
  const [data, setData] = useState<MachineAssetPageData | null>(null);
  const [searchDraft, setSearchDraft] = useState(pageKey === "machine-master" ? initialMachine : "");
  const [search, setSearch] = useState(pageKey === "machine-master" ? initialMachine : "");
  const [workCenter, setWorkCenter] = useState(initialWorkCenter);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [dueStatus, setDueStatus] = useState("");
  const [machine, setMachine] = useState(pageKey === "machine-consumables" ? initialMachine : "");
  const [classification, setClassification] = useState("");
  const [scope, setScope] = useState("");
  const [sortBy, setSortBy] = useState("source_row");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const hasData = useRef(false);

  const load = useCallback(async (refresh = false) => {
    const current = ++requestId.current;
    setError(null);
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await fetchAssetPage(pageKey, {
        page,
        pageSize: PAGE_SIZE,
        search,
        workCenter,
        status,
        category,
        dueStatus,
        machine,
        classification,
        scope,
        sortBy,
        sortOrder,
        refresh,
      });
      if (requestId.current === current) {
        setData(result);
        hasData.current = true;
      }
    } catch (loadError) {
      if (requestId.current === current) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load this machine worksheet.");
      }
    } finally {
      if (requestId.current === current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [category, classification, dueStatus, machine, page, pageKey, scope, search, sortBy, sortOrder, status, workCenter]);

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

  const current = data?.kind === pageKey ? data.data : null;
  const selectedSorts = SORTS[pageKey];
  const pageTitle = current?.worksheet.name ?? (
    pageKey === "machine-master" ? "Machine Master"
      : pageKey === "machine-consumables" ? "Machine Consumables"
        : pageKey === "capacity-change-log" ? "Capacity Change Log" : "Planned Shutdowns"
  );

  return (
    <section className="order-analytics machine-assets">
      <header className="order-analytics__header">
        <div>
          <p className="order-analytics__eyebrow">ERC Mk-V Line Tracker / Machines &amp; Capacity</p>
          <h2>{pageTitle}</h2>
          <p>Read-only machine reference and planned-maintenance records. Source labels and example records are preserved.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void load(true)} disabled={loading || refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <MachineAssetTabs current={pageKey} />
      {current ? <MachineAssetSourceBanner data={current} error={error} /> : null}

      {current ? (
        <>
          {current.source_context_rows.map((row) => (
            <p className="order-analytics__footnote" key={row.row_number}>{row.values.map(String).join(" ")}</p>
          ))}
          <div className="order-analytics__metrics machine-assets__metrics">
            {pageKey === "machine-master" && data?.kind === "machine-master" ? (
              <>
                <MetricCard label="Machine records" value={data.data.summary.machine_count} detail={`${data.data.summary.unique_machine_key_count} unique (Work Center, Machine) keys`} />
                <MetricCard label="Source status: Active" value={data.data.summary.status_counts.Active ?? 0} detail="Literal source status only; not an independent availability check" />
                <MetricCard label="Decommissioned status" value={data.data.summary.status_counts["De-Comissioned"] ?? 0} detail="Status wording retained from the source" />
                <MetricCard label="Capacity validations" value={`${data.data.summary.capacity_validation_counts.verified ?? 0} verified`} detail={`${data.data.summary.capacity_validation_counts.incomplete ?? 0} incomplete; ${data.data.summary.capacity_validation_counts.mismatch ?? 0} mismatches`} />
              </>
            ) : null}
            {pageKey === "machine-consumables" && data?.kind === "machine-consumables" ? (
              <>
                <MetricCard label="Reference records" value={data.data.summary.consumable_record_count} detail="Not a stock or inventory ledger" />
                <MetricCard label="Exact machine-key matches" value={data.data.summary.machine_key_match_count} detail="Composite (Work Center, Machine) join" />
                <MetricCard label="Missing next-due date" value={data.data.summary.missing_next_due_date_count} detail="No due status inferred for blank dates" />
                <MetricCard label="Dates before today" value={data.data.summary.past_date_count} detail="Source dates flagged; not an inventory/reorder alert" />
              </>
            ) : null}
            {pageKey === "capacity-change-log" && data?.kind === "capacity-change-log" ? (
              <>
                <MetricCard label="Example records" value={data.data.summary.example_count} detail="Not operational history" />
                <MetricCard label="Confirmed records" value={data.data.summary.confirmed_count} detail="Only explicitly confirmed source notes" />
                <MetricCard label="Unverified records" value={data.data.summary.unverified_count} detail="No historical trend derived" />
              </>
            ) : null}
            {pageKey === "planned-shutdowns" && data?.kind === "planned-shutdowns" ? (
              <>
                <MetricCard label="Example schedules" value={data.data.summary.example_count} detail="Not confirmed shutdowns" />
                <MetricCard label="Confirmed schedules" value={data.data.summary.confirmed_count} detail="Not combined with actual downtime" />
                <MetricCard label="Overlapping source schedules" value={data.data.summary.overlap_count} detail="Overlap is flagged; hours are not combined" />
                <MetricCard label="Cross-schedule hour total" value="Not aggregated" detail="Individual scopes are not a combined actual-downtime metric" />
              </>
            ) : null}
          </div>

          {pageKey === "machine-master" ? (
            <div className="machine-assets__assumptions" role="note">
              <strong>Source capacity assumptions:</strong> Output = 60 ÷ rated cycle seconds (cycles/minute); Hourly = Output × 60; Shift = Hourly × 11 hours; Day = Shift × 2 shifts; “85 %” = Day × 0.85. Rated capacities are formula-derived planning rates, not actual production; the source does not specify a finished-piece unit. The 11-hour shift, two shifts/day, and 85% factor are visible assumptions from the formulas; the 85% result is not an availability measurement. Rated manpower per shift is marked as an assumed starting point in the source instructions, not measured staffing.
            </div>
          ) : null}
          {pageKey === "machine-consumables" ? (
            <div className="order-analytics__notice" role="note">
              This worksheet identifies consumable references only. It contains no inventory balance, stock availability, or reorder quantity. Change frequencies are displayed verbatim because they are qualitative/source-assumed intervals.
            </div>
          ) : null}
          {pageKey === "capacity-change-log" ? (
            <div className="order-analytics__warning" role="status">
              Example and unverified entries remain visible as source records, but are not treated as confirmed events or used to form a capacity trend. Cycle-time percentage is calculated only for an explicitly confirmed entry with two positive values in seconds.
            </div>
          ) : null}
          {pageKey === "planned-shutdowns" ? (
            <div className="order-analytics__warning" role="status">
              Planned schedules are not actual historical downtime. No example or unverified hours are included in confirmed affected-hour summaries. Work-center scope remains work-center-wide; linked machine references do not imply individual-machine impact.
            </div>
          ) : null}

          <div className="order-analytics__toolbar">
            <form className="order-analytics__search" onSubmit={applySearch}>
              <label htmlFor="machine-assets-search">
                {pageKey === "machine-master" ? "Search machine, work center, or notes" : "Search source values"}
              </label>
              <input id="machine-assets-search" type="search" maxLength={120} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} />
              <button type="submit" className="btn">Search</button>
            </form>
            {pageKey === "machine-master" && data?.kind === "machine-master" ? (
              <label>Work center
                <select value={workCenter} onChange={(event) => setFilter(setWorkCenter, event.target.value)}>
                  <option value="">All work centers</option>
                  {data.data.filter_options.work_centers.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
            ) : null}
            {pageKey === "machine-consumables" && data?.kind === "machine-consumables" ? (
              <>
                <label>Work center
                  <select value={workCenter} onChange={(event) => setFilter(setWorkCenter, event.target.value)}>
                    <option value="">All work centers</option>
                    {data.data.filter_options.work_centers.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>Exact machine name
                  <input value={machine} maxLength={120} onChange={(event) => setFilter(setMachine, event.target.value)} />
                </label>
              </>
            ) : null}
            {pageKey === "capacity-change-log" && data?.kind === "capacity-change-log" ? (
              <label>Work center
                <select value={workCenter} onChange={(event) => setFilter(setWorkCenter, event.target.value)}>
                  <option value="">All work centers</option>
                  {data.data.filter_options.work_centers.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
            ) : null}
            {pageKey === "machine-master" && data?.kind === "machine-master" ? (
              <label>Source status
                <select value={status} onChange={(event) => setFilter(setStatus, event.target.value)}>
                  <option value="">All source statuses</option>{data.data.filter_options.statuses.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
            ) : null}
            {pageKey === "machine-consumables" && data?.kind === "machine-consumables" ? (
              <>
                <label>Category
                  <select value={category} onChange={(event) => setFilter(setCategory, event.target.value)}>
                    <option value="">All categories</option>{data.data.filter_options.categories.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>Due-date state
                  <select value={dueStatus} onChange={(event) => setFilter(setDueStatus, event.target.value)}>
                    <option value="">All date states</option>{data.data.filter_options.due_statuses.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
              </>
            ) : null}
            {pageKey === "capacity-change-log" && data?.kind === "capacity-change-log" ? (
              <label>Classification
                <select value={classification} onChange={(event) => setFilter(setClassification, event.target.value)}>
                  <option value="">All classifications</option>{data.data.filter_options.classifications.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
            ) : null}
            {pageKey === "planned-shutdowns" && data?.kind === "planned-shutdowns" ? (
              <>
                <label>Scope
                  <select value={scope} onChange={(event) => setFilter(setScope, event.target.value)}>
                    <option value="">All scopes</option>{data.data.filter_options.scopes.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>Classification
                  <select value={classification} onChange={(event) => setFilter(setClassification, event.target.value)}>
                    <option value="">All classifications</option>{data.data.filter_options.classifications.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
              </>
            ) : null}
          </div>

          <div className="order-analytics__sort">
            <label htmlFor="machine-assets-sort">Sort by</label>
            <select id="machine-assets-sort" value={sortBy} onChange={(event) => { setPage(1); setSortBy(event.target.value); }}>
              {selectedSorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" className="btn" onClick={() => setSortOrder((value) => value === "asc" ? "desc" : "asc")}>{sortOrder === "asc" ? "Ascending" : "Descending"}</button>
            <span>{current.filtered_record_count} matching records</span>
          </div>

          {current.records.length ? (
            <div className="order-analytics__table-wrap">
              {pageKey === "machine-master" && data?.kind === "machine-master" ? <MachineMasterTable records={data.data.records} /> : null}
              {pageKey === "machine-consumables" && data?.kind === "machine-consumables" ? <ConsumablesTable records={data.data.records} /> : null}
              {pageKey === "capacity-change-log" && data?.kind === "capacity-change-log" ? <CapacityTable records={data.data.records} /> : null}
              {pageKey === "planned-shutdowns" && data?.kind === "planned-shutdowns" ? <ShutdownTable records={data.data.records} /> : null}
            </div>
          ) : (
            <div className="order-analytics__empty" role="status">{loading ? "Loading source records..." : "No records match these filters."}</div>
          )}

          <footer className="order-analytics__pagination">
            <span>Page {current.page} of {Math.max(current.page_count, 1)}</span>
            <div>
              <button type="button" className="btn" disabled={page <= 1 || loading || refreshing} onClick={() => setPage((value) => Math.max(value - 1, 1))}>Previous</button>
              <button type="button" className="btn" disabled={page >= current.page_count || current.page_count === 0 || loading || refreshing} onClick={() => setPage((value) => Math.min(value + 1, current.page_count))}>Next</button>
            </div>
          </footer>
          <MachineAssetSourceRows data={current} />
        </>
      ) : loading ? (
        <div className="order-analytics__empty" role="status">Loading live machine worksheets...</div>
      ) : (
        <div className="order-analytics__empty" role="alert">The worksheet is unavailable. Use Refresh to retry.</div>
      )}
    </section>
  );
}

function MachineMasterTable({ records }: { records: MachineMasterRow[] }) {
  return (
    <table className="order-analytics__table machine-assets__table machine-assets__table--master">
      <thead><tr>
        <th scope="col">Row</th><th scope="col">Work center</th><th scope="col">Machine</th>
        <th scope="col">Rated CT (sec)</th><th scope="col">Source status</th>
        <th scope="col">Manpower / shift (assumed)</th><th scope="col">Commissioned</th><th scope="col">Decommissioned</th>
        <th scope="col">Rated cycles/min</th><th scope="col">Rated cycles/hour</th><th scope="col">Rated cycles/shift (11h)</th>
        <th scope="col">Rated cycles/day (2 shifts)</th><th scope="col">Rated cycles/day @ 85%</th><th scope="col">Validation / detail</th>
      </tr></thead>
      <tbody>{records.map((row) => (
        <tr key={row.source_row}>
          <td>{row.source_row}</td><td>{row.work_center}</td><td>{row.machine}</td>
          <td>{formatAssetNumber(row.rated_ct_sec, 3)}</td>
          <td><span className="machine-assets__badge machine-assets__badge--source">{row.status ?? "Unspecified"}</span></td>
          <td>{formatAssetNumber(row.manpower_per_shift)}</td><td>{row.commissioning_date ?? "—"}</td><td>{row.decommissioned_date ?? "—"}</td>
          <td>{sourceUnitCapacity(row.output_per_minute, "cycles/min")}</td>
          <td>{sourceUnitCapacity(row.hourly_capacity, "cycles/hour")}</td>
          <td>{sourceUnitCapacity(row.shift_capacity, "cycles/shift")}</td>
          <td>{sourceUnitCapacity(row.day_capacity, "cycles/day")}</td>
          <td>{sourceUnitCapacity(row.capacity_at_85_percent, "cycles/day")}</td>
          <td>
            <span className={`machine-assets__badge ${row.capacity_validation === "verified" ? "machine-assets__badge--confirmed" : "machine-assets__badge--unverified"}`}>
              {row.capacity_validation}
            </span>
            <details className="machine-assets__detail">
              <summary>Machine details</summary>
              <p>{row.notes || "No source note."}</p>
              <a href={buildLineTrackerWorksheetHash("machine-consumables", { work_center: row.work_center, machine: row.machine })}>Related consumables</a>
              <ul>{Object.entries(row.capacity_formula_checks).map(([field, matches]) => <li key={field}>{field}: {matches === true ? "matches independent formula" : matches === false ? "mismatch" : "not verifiable"}</li>)}</ul>
            </details>
          </td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function ConsumablesTable({ records }: { records: MachineConsumableRow[] }) {
  return (
    <table className="order-analytics__table machine-assets__table machine-assets__table--consumables">
      <thead><tr>
        <th scope="col">Row</th><th scope="col">Work center</th><th scope="col">Machine</th>
        <th scope="col">Consumable</th><th scope="col">Category</th><th scope="col">Typical change frequency</th>
        <th scope="col">Last changed</th><th scope="col">Next due</th><th scope="col">Date flag</th>
        <th scope="col">Machine Master relationship</th><th scope="col">Notes</th>
      </tr></thead>
      <tbody>{records.map((row) => (
        <tr key={row.source_row}>
          <td>{row.source_row}</td><td>{row.work_center}</td><td>{row.machine}</td>
          <td>{row.consumable}</td><td>{row.category}</td><td>{row.change_frequency || "—"}</td>
          <td>{row.last_changed_date || "—"}</td><td>{row.next_due_date || "—"}</td>
          <td><span className={row.due_status === "past date" ? "machine-assets__badge machine-assets__badge--example" : "machine-assets__badge machine-assets__badge--unverified"}>{row.due_status}</span></td>
          <td>
            {row.machine_match === "matched" && row.machine_status
              ? <><a href={linkToMachine(row.work_center, row.machine) ?? undefined}>{row.machine_status} in source</a></>
              : row.machine_match}
          </td>
          <td>{row.notes || "—"}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function CapacityTable({ records }: { records: CapacityChangeRow[] }) {
  return (
    <table className="order-analytics__table machine-assets__table machine-assets__table--events">
      <thead><tr>
        <th scope="col">Row</th><th scope="col">Classification</th><th scope="col">Date changed</th>
        <th scope="col">Work center</th><th scope="col">Machine</th><th scope="col">Old CT (sec)</th>
        <th scope="col">New CT (sec)</th><th scope="col">Change (%)</th><th scope="col">Master relationship</th>
        <th scope="col">Source reason / notes</th>
      </tr></thead>
      <tbody>{records.map((row) => (
        <tr key={row.source_row} className={row.classification === "example" ? "machine-assets__example-row" : ""}>
          <td>{row.source_row}</td><td><span className={classificationClass(row.classification)}>{row.classification}</span></td>
          <td>{row.date_changed || "—"}</td><td>{row.work_center || "—"}</td><td>{row.machine || "—"}</td>
          <td>{formatAssetNumber(row.old_rated_ct_sec, 3)}</td><td>{formatAssetNumber(row.new_rated_ct_sec, 3)}</td>
          <td>{row.percentage_change === null ? "Not calculated" : `${formatAssetNumber(row.percentage_change)}%`}</td>
          <td>{row.machine_match === "matched" ? <a href={linkToMachine(row.work_center, row.machine) ?? undefined}>View machine</a> : row.machine_match}</td>
          <td>{row.reason_notes || "—"}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function ShutdownTable({ records }: { records: PlannedShutdownRow[] }) {
  return (
    <table className="order-analytics__table machine-assets__table machine-assets__table--events">
      <thead><tr>
        <th scope="col">Row</th><th scope="col">Classification</th><th scope="col">Start</th><th scope="col">End</th>
        <th scope="col">Scope</th><th scope="col">Scope detail</th><th scope="col">Hours/day</th>
        <th scope="col">Inclusive days</th><th scope="col">Schedule hours estimate</th>
        <th scope="col">Related machines</th><th scope="col">Reason / notes</th><th scope="col">Validation</th>
      </tr></thead>
      <tbody>{records.map((row) => (
        <tr key={row.source_row} className={row.classification === "example" ? "machine-assets__example-row" : ""}>
          <td>{row.source_row}</td><td><span className={classificationClass(row.classification)}>{row.classification}</span></td>
          <td>{row.start_date || "—"}</td><td>{row.end_date || "—"}</td>
          <td>{row.scope || "—"}</td><td>{row.scope_detail || "—"}</td>
          <td>{row.hours_affected_per_day === null ? "—" : `${formatAssetNumber(row.hours_affected_per_day)} h`}</td>
          <td>{row.duration_days ?? "—"}</td>
          <td>{row.estimated_hours === null ? "Not calculated" : `${formatAssetNumber(row.estimated_hours)} h`}</td>
          <td>
            {row.linked_machine_keys.length ? (
              <div className="machine-assets__links">
                {row.linked_machine_keys.map((item) => (
                  <a key={`${item.work_center}-${item.machine}`} href={linkToMachine(item.work_center, item.machine) ?? undefined}>
                    {item.work_center} / {item.machine}
                  </a>
                ))}
                {row.machine_link_status === "work-center scope" ? <small>Work-center-wide source scope; links do not infer individual effects.</small> : null}
              </div>
            ) : row.machine_link_status}
          </td>
          <td>{[row.reason, row.notes].filter(Boolean).join(" — ") || "—"}</td>
          <td>{[
            row.date_range_valid ? "valid dates" : "invalid dates",
            row.scope_valid ? "valid scope" : "invalid scope",
            row.hours_valid ? "valid hours/day" : "invalid hours/day",
            row.overlaps_source_rows.length ? `overlaps rows ${row.overlaps_source_rows.join(", ")}` : "",
          ].filter(Boolean).join("; ")}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
