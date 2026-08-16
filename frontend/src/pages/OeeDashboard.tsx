import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchLines,
  fetchMachines,
  fetchOee,
  fetchOeeBreakdown,
  fetchOeeLines,
  fetchOeeMachines,
  fetchOeePlants,
  fetchOeeSummary,
  fetchOeeTrend,
  fetchPlants,
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
  LineOption,
  MachineOption,
  OeeBreakdown,
  OeeSnapshot,
  PlantOption,
  ScopeType,
} from "../types/dashboard";
import { isUuid } from "../utils/format";
import { trendWindowFor } from "../utils/trendWindow";

const DEFAULT_FILTERS: DashboardFilters = {
  scope_type: "plant",
  scope_id: "",
  plant_id: "",
  line_id: "",
  machine_id: "",
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
  const [sseStatus, setSseStatus] = useState<"idle" | "connecting" | "live" | "offline">("idle");

  const [plantOptions, setPlantOptions] = useState<PlantOption[]>([]);
  const [lineOptions, setLineOptions] = useState<LineOption[]>([]);
  const [machineOptions, setMachineOptions] = useState<MachineOption[]>([]);
  const [plantLoading, setPlantLoading] = useState(true);
  const [lineLoading, setLineLoading] = useState(false);
  const [machineLoading, setMachineLoading] = useState(false);
  const [plantError, setPlantError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
  const [machineError, setMachineError] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<LoadState<OeeSnapshot>>(emptyLoad());
  const [summary, setSummary] = useState<LoadState<OeeSnapshot>>(emptyLoad());
  const [breakdown, setBreakdown] = useState<LoadState<OeeBreakdown>>(emptyLoad());
  const [trend, setTrend] = useState<LoadState<OeeSnapshot[]>>(emptyLoad());
  const [machines, setMachines] = useState<LoadState<OeeSnapshot[]>>(emptyLoad());
  const [lines, setLines] = useState<LoadState<OeeSnapshot[]>>(emptyLoad());
  const [plants, setPlants] = useState<LoadState<OeeSnapshot[]>>(emptyLoad());

  const refreshPlantOptions = useCallback(async () => {
    setPlantLoading(true);
    setPlantError(null);
    try {
      const res = await fetchPlants();
      setPlantOptions(res.items ?? []);
    } catch (error) {
      setPlantOptions([]);
      setPlantError(errMessage(error));
    } finally {
      setPlantLoading(false);
    }
  }, []);

  const refreshLineOptions = useCallback(async (plantId: string) => {
    if (!plantId) {
      setLineOptions([]);
      setLineError(null);
      setLineLoading(false);
      return;
    }

    setLineLoading(true);
    setLineError(null);
    try {
      const res = await fetchLines({ plant_id: plantId });
      setLineOptions(res.items ?? []);
    } catch (error) {
      setLineOptions([]);
      setLineError(errMessage(error));
    } finally {
      setLineLoading(false);
    }
  }, []);

  const refreshMachineOptions = useCallback(async (plantId: string, lineId?: string) => {
    if (!plantId) {
      setMachineOptions([]);
      setMachineError(null);
      setMachineLoading(false);
      return;
    }

    setMachineLoading(true);
    setMachineError(null);
    try {
      const res = await fetchMachines({
        plant_id: plantId,
        line_id: lineId || undefined,
      });
      setMachineOptions(res.items ?? []);
    } catch (error) {
      setMachineOptions([]);
      setMachineError(errMessage(error));
    } finally {
      setMachineLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPlantOptions();
  }, [refreshPlantOptions]);

  useEffect(() => {
    if (!plantOptions.length) return;

    if (!draft.plant_id) {
      setLineOptions([]);
      setMachineOptions([]);
      return;
    }

    void refreshLineOptions(draft.plant_id);
    if (draft.scope_type === "machine") {
      void refreshMachineOptions(draft.plant_id, draft.line_id || undefined);
    } else {
      void refreshMachineOptions(draft.plant_id);
    }
  }, [draft.plant_id, draft.scope_type, draft.line_id, plantOptions.length, refreshLineOptions, refreshMachineOptions]);

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

  useEffect(() => {
    if (!applied) {
      setSseStatus("idle");
      return;
    }

    const token = window.localStorage.getItem("pril_access_token");
    if (!token) {
      setSseStatus("offline");
      return;
    }

    setSseStatus("connecting");
    const url = `${window.location.origin}${import.meta.env.BASE_URL}api/v1/dashboard/stream?token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);

    source.addEventListener("open", () => {
      setSseStatus("live");
    });

    source.addEventListener("oee_updated", () => {
      void loadAll(applied);
    });

    source.onerror = () => {
      setSseStatus("offline");
      source.close();
    };

    return () => {
      source.close();
      setSseStatus("idle");
    };
  }, [applied, loadAll]);

  const onApply = () => {
    const scopeId = draft.scope_type === "plant" ? draft.plant_id ?? "" : draft.scope_type === "line" ? draft.line_id ?? "" : draft.machine_id ?? "";
    if (!scopeId || !isUuid(scopeId)) {
      setValidationError("Select a valid plant, line, or machine from the dropdowns.");
      return;
    }
    if (!draft.period_start) {
      setValidationError("period_start is required.");
      return;
    }
    const next = {
      ...draft,
      scope_id: scopeId,
    };
    setValidationError(null);
    setApplied(next);
    void loadAll(next);
  };

  const onPlantChange = (plantId: string) => {
    const next: DashboardFilters = {
      ...draft,
      plant_id: plantId,
      line_id: "",
      machine_id: "",
      scope_id: draft.scope_type === "plant" ? plantId : "",
    };
    if (draft.scope_type === "plant") {
      next.scope_id = plantId;
    }
    setDraft(next);
    setValidationError(null);
    if (plantId) {
      void refreshLineOptions(plantId);
      void refreshMachineOptions(plantId);
    } else {
      setLineOptions([]);
      setMachineOptions([]);
    }
  };

  const onLineChange = (lineId: string) => {
    const next: DashboardFilters = {
      ...draft,
      line_id: lineId,
      machine_id: "",
      scope_id: draft.scope_type === "line" ? lineId : "",
    };
    if (draft.scope_type === "line") {
      next.scope_id = lineId;
    }
    setDraft(next);
    setValidationError(null);
    if (lineId) {
      const selectedLine = lineOptions.find((line) => line.id === lineId);
      if (selectedLine) {
        void refreshMachineOptions(selectedLine.plant_id, lineId);
      }
    } else {
      setMachineOptions([]);
    }
  };

  const onMachineChange = (machineId: string) => {
    const next: DashboardFilters = {
      ...draft,
      machine_id: machineId,
      scope_id: machineId,
    };
    setDraft(next);
    setValidationError(null);
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
    setLineOptions([]);
    setMachineOptions([]);
    setLineError(null);
    setMachineError(null);
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
      ? "Machine detail tables are scoped by plant_id. Use plant scope for the plant-level drilldown, or select a plant before reviewing machine-level snapshots."
      : null;

  const linesGap =
    applied && applied.scope_type !== "plant"
      ? "Line detail tables are also grouped by plant_id. Choose a plant scope to load the available lines for this dashboard view."
      : null;

  return (
    <div className="dash">
      <DashboardHeader sseStatus={sseStatus} />

      <FilterBar
        draft={draft}
        onChange={setDraft}
        onApply={onApply}
        onReset={onReset}
        validationError={validationError}
        plantOptions={plantOptions}
        plantLoading={plantLoading}
        plantError={plantError}
        lineOptions={lineOptions}
        machineOptions={machineOptions}
        lineLoading={lineLoading}
        machineLoading={machineLoading}
        lineError={lineError}
        machineError={machineError}
        onPlantChange={onPlantChange}
        onLineChange={onLineChange}
        onMachineChange={onMachineChange}
      />

      {!applied ? (
        <section className="panel panel--muted">
          <h2>Ready</h2>
          <p>
            Select a plant, line, or machine from the master-data dropdowns and apply the period filter.
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
