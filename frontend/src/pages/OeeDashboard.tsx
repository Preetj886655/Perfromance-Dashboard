import { useCallback, useMemo, useState } from "react";
import {
  fetchOee,
  fetchOeeBreakdown,
  fetchOeeLines,
  fetchOeeMachines,
  fetchOeePlants,
  fetchOeeSummary,
  fetchOeeTrend,
} from "../api/dashboard";
import { ApiRequestError } from "../api/client";
import { BreakdownChart } from "../components/dashboard/BreakdownChart";
import { DashboardHeader } from "../components/dashboard/DashboardHeader";
import { FilterBar } from "../components/dashboard/FilterBar";
import { KpiCards } from "../components/dashboard/KpiCards";
import { SnapshotTable } from "../components/dashboard/SnapshotTable";
import { TrendChart } from "../components/dashboard/TrendChart";
import type {
  DashboardFilters,
  OeeBreakdown,
  OeeSnapshot,
  ScopeType,
} from "../types/dashboard";
import { isUuid } from "../utils/format";
import { trendWindowFor } from "../utils/trendWindow";

const DEFAULT_FILTERS: DashboardFilters = {
  scope_type: "plant",
  scope_id: "",
  period_type: "day",
  period_start: new Date().toISOString().slice(0, 10),
};

type LoadState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

function emptyLoad<T>(): LoadState<T> {
  return { data: null, loading: false, error: null };
}

function errMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 404) return "Snapshot not found (404).";
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export function OeeDashboard() {
  const [draft, setDraft] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<DashboardFilters | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<LoadState<OeeSnapshot>>(emptyLoad());
  const [summary, setSummary] = useState<LoadState<OeeSnapshot>>(emptyLoad());
  const [breakdown, setBreakdown] = useState<LoadState<OeeBreakdown>>(emptyLoad());
  const [trend, setTrend] = useState<LoadState<OeeSnapshot[]>>(emptyLoad());
  const [machines, setMachines] = useState<LoadState<OeeSnapshot[]>>(emptyLoad());
  const [lines, setLines] = useState<LoadState<OeeSnapshot[]>>(emptyLoad());
  const [plants, setPlants] = useState<LoadState<OeeSnapshot[]>>(emptyLoad());

  const trendWindow = useMemo(() => {
    if (!applied) return null;
    return trendWindowFor(applied.period_type, applied.period_start);
  }, [applied]);

  const loadAll = useCallback(async (filters: DashboardFilters) => {
    const query = {
      scope_type: filters.scope_type,
      scope_id: filters.scope_id,
      period_type: filters.period_type,
      period_start: filters.period_start,
    };
    const window = trendWindowFor(filters.period_type, filters.period_start);

    setSnapshot({ data: null, loading: true, error: null });
    setSummary({ data: null, loading: true, error: null });
    setBreakdown({ data: null, loading: true, error: null });
    setTrend({ data: null, loading: true, error: null });
    setPlants({ data: null, loading: true, error: null });

    const plantId =
      filters.scope_type === "plant" ? filters.scope_id : null;
    if (plantId) {
      setMachines({ data: null, loading: true, error: null });
      setLines({ data: null, loading: true, error: null });
    } else {
      setMachines(emptyLoad());
      setLines(emptyLoad());
    }

    const settled = await Promise.allSettled([
      fetchOee(query),
      fetchOeeSummary({
        scope_type: filters.scope_type,
        scope_id: filters.scope_id,
        period_type: filters.period_type,
      }),
      fetchOeeBreakdown(query),
      fetchOeeTrend({
        ...query,
        period_start_from: window.period_start_from,
        period_start_to: window.period_start_to,
      }),
      fetchOeePlants({
        period_type: filters.period_type,
        period_start: filters.period_start,
        plant_id: filters.scope_type === "plant" ? filters.scope_id : undefined,
      }),
      plantId
        ? fetchOeeMachines({
            plant_id: plantId,
            period_type: filters.period_type,
            period_start: filters.period_start,
          })
        : Promise.resolve(null),
      plantId
        ? fetchOeeLines({
            plant_id: plantId,
            period_type: filters.period_type,
            period_start: filters.period_start,
          })
        : Promise.resolve(null),
    ]);

    const [oeeR, summaryR, breakdownR, trendR, plantsR, machinesR, linesR] =
      settled;

    if (oeeR.status === "fulfilled") {
      setSnapshot({ data: oeeR.value, loading: false, error: null });
    } else {
      const msg = errMessage(oeeR.reason);
      const is404 =
        oeeR.reason instanceof ApiRequestError && oeeR.reason.status === 404;
      setSnapshot({
        data: null,
        loading: false,
        error: is404 ? null : msg,
      });
    }

    if (summaryR.status === "fulfilled") {
      setSummary({ data: summaryR.value, loading: false, error: null });
    } else {
      const is404 =
        summaryR.reason instanceof ApiRequestError &&
        summaryR.reason.status === 404;
      setSummary({
        data: null,
        loading: false,
        error: is404 ? null : errMessage(summaryR.reason),
      });
    }

    if (breakdownR.status === "fulfilled") {
      setBreakdown({ data: breakdownR.value, loading: false, error: null });
    } else {
      const is404 =
        breakdownR.reason instanceof ApiRequestError &&
        breakdownR.reason.status === 404;
      setBreakdown({
        data: null,
        loading: false,
        error: is404 ? null : errMessage(breakdownR.reason),
      });
    }

    if (trendR.status === "fulfilled") {
      setTrend({
        data: trendR.value.items,
        loading: false,
        error: null,
      });
    } else {
      setTrend({ data: [], loading: false, error: errMessage(trendR.reason) });
    }

    if (plantsR.status === "fulfilled") {
      setPlants({
        data: plantsR.value.items,
        loading: false,
        error: null,
      });
    } else {
      setPlants({ data: [], loading: false, error: errMessage(plantsR.reason) });
    }

    if (!plantId) {
      return;
    }

    if (machinesR.status === "fulfilled" && machinesR.value) {
      setMachines({
        data: machinesR.value.items,
        loading: false,
        error: null,
      });
    } else if (machinesR.status === "rejected") {
      setMachines({
        data: [],
        loading: false,
        error: errMessage(machinesR.reason),
      });
    }

    if (linesR.status === "fulfilled" && linesR.value) {
      setLines({ data: linesR.value.items, loading: false, error: null });
    } else if (linesR.status === "rejected") {
      setLines({ data: [], loading: false, error: errMessage(linesR.reason) });
    }
  }, []);

  const onApply = () => {
    if (!draft.scope_id || !isUuid(draft.scope_id)) {
      setValidationError("scope_id must be a valid UUID.");
      return;
    }
    if (!draft.period_start) {
      setValidationError("period_start is required.");
      return;
    }
    setValidationError(null);
    setApplied(draft);
    void loadAll(draft);
  };

  const onReset = () => {
    setDraft(DEFAULT_FILTERS);
    setApplied(null);
    setValidationError(null);
    setSnapshot(emptyLoad());
    setSummary(emptyLoad());
    setBreakdown(emptyLoad());
    setTrend(emptyLoad());
    setMachines(emptyLoad());
    setLines(emptyLoad());
    setPlants(emptyLoad());
  };

  const onDrill = (scopeType: ScopeType, scopeId: string) => {
    if (!applied) return;
    const next: DashboardFilters = {
      ...applied,
      scope_type: scopeType,
      scope_id: scopeId,
    };
    setDraft(next);
    setApplied(next);
    void loadAll(next);
  };

  const kpiEmpty =
    Boolean(applied) &&
    !snapshot.loading &&
    !snapshot.error &&
    snapshot.data === null;

  const machinesGap =
    applied && applied.scope_type !== "plant"
      ? "Machine table requires plant_id (GET /oee/machines). Set scope_type=plant and use plants.id as scope_id — no master lookup API and no plant_id on machine/line snapshots for reverse lookup."
      : null;

  const linesGap =
    applied && applied.scope_type !== "plant"
      ? "Line table requires plant_id (GET /oee/lines). Set scope_type=plant to load plant lines."
      : null;

  return (
    <div className="dash">
      <DashboardHeader />

      <FilterBar
        draft={draft}
        onChange={setDraft}
        onApply={onApply}
        onReset={onReset}
        validationError={validationError}
      />

      {!applied ? (
        <section className="panel panel--muted">
          <h2>Ready</h2>
          <p>
            Enter a known plant / line / machine UUID and period, then Apply.
            There is no master-list API yet — scope_id is entered manually.
          </p>
        </section>
      ) : (
        <>
          <KpiCards
            snapshot={snapshot.data}
            summary={summary.data}
            loading={snapshot.loading}
            error={snapshot.error}
            empty={kpiEmpty}
          />

          <div className="dash-charts">
            <BreakdownChart
              breakdown={breakdown.data}
              loading={breakdown.loading}
              error={breakdown.error}
            />
            <TrendChart
              items={trend.data ?? []}
              loading={trend.loading}
              error={trend.error}
              windowLabel={
                trendWindow
                  ? `${trendWindow.period_start_from} → ${trendWindow.period_start_to}`
                  : "—"
              }
            />
          </div>

          <SnapshotTable
            title="Machines"
            description="GET /oee/machines — plant_id from plant-scope filter."
            items={machines.data ?? []}
            loading={machines.loading}
            error={machines.error}
            gapMessage={machinesGap}
            onDrill={onDrill}
          />

          <SnapshotTable
            title="Lines"
            description="GET /oee/lines — plant_id from plant-scope filter."
            items={lines.data ?? []}
            loading={lines.loading}
            error={lines.error}
            gapMessage={linesGap}
            onDrill={onDrill}
          />

          <SnapshotTable
            title="Plants"
            description="GET /oee/plants — optional plant_id when scope is plant."
            items={plants.data ?? []}
            loading={plants.loading}
            error={plants.error}
            onDrill={onDrill}
          />
        </>
      )}

    </div>
  );
}
