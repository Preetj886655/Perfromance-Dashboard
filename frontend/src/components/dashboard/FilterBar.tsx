import type {
  DashboardFilters,
  LineOption,
  MachineOption,
  PeriodType,
  PlantOption,
  ScopeType,
} from "../../types/dashboard";

type Props = {
  draft: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  onApply: () => void;
  onReset: () => void;
  disabled?: boolean;
  validationError?: string | null;
  plantOptions?: PlantOption[];
  plantLoading?: boolean;
  plantError?: string | null;
  lineOptions?: LineOption[];
  lineLoading?: boolean;
  lineError?: string | null;
  machineOptions?: MachineOption[];
  machineLoading?: boolean;
  machineError?: string | null;
  onPlantChange?: (plantId: string) => void;
  onLineChange?: (lineId: string) => void;
  onMachineChange?: (machineId: string) => void;
};

const SCOPE_OPTIONS: ScopeType[] = ["plant", "line", "machine"];
const PERIOD_OPTIONS: PeriodType[] = ["day", "week", "month"];

export function FilterBar({
  draft,
  onChange,
  onApply,
  onReset,
  disabled,
  validationError,
  plantOptions = [],
  plantLoading = false,
  plantError = null,
  lineOptions = [],
  lineLoading = false,
  lineError = null,
  machineOptions = [],
  machineLoading = false,
  machineError = null,
  onPlantChange,
  onLineChange,
  onMachineChange,
}: Props) {
  const showLine = draft.scope_type === "line" || draft.scope_type === "machine";
  const showMachine = draft.scope_type === "machine";
  const lineDisabled = disabled || !draft.plant_id || lineLoading || lineOptions.length === 0;
  const machineDisabled = disabled || !draft.line_id || machineLoading || machineOptions.length === 0;

  return (
    <section className="panel filter-bar" aria-label="Dashboard filters">
      <div className="filter-bar__grid">
        <label className="field">
          <span className="field__label">Scope type</span>
          <select
            value={draft.scope_type}
            disabled={disabled}
            onChange={(e) => {
              const nextType = e.target.value as ScopeType;
              const next: DashboardFilters = {
                ...draft,
                scope_type: nextType,
                scope_id: "",
                line_id: nextType === "plant" ? "" : draft.line_id,
                machine_id: nextType === "machine" ? draft.machine_id : "",
              };
              if (nextType === "plant") {
                next.plant_id = draft.plant_id ?? "";
                next.scope_id = draft.plant_id ?? "";
              } else if (nextType === "line") {
                next.plant_id = draft.plant_id ?? "";
                next.line_id = draft.line_id ?? "";
                next.scope_id = next.line_id;
                next.machine_id = "";
              } else {
                next.plant_id = draft.plant_id ?? "";
                next.line_id = draft.line_id ?? "";
                next.machine_id = draft.machine_id ?? "";
                next.scope_id = next.machine_id;
              }
              onChange(next);
            }}
          >
            {SCOPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Plant</span>
          <select
            value={draft.plant_id ?? ""}
            disabled={disabled || plantLoading}
            onChange={(e) => {
              const nextPlantId = e.target.value;
              onPlantChange?.(nextPlantId);
            }}
          >
            <option value="">{plantLoading ? "Loading plants..." : plantError ? "Unable to load plants" : "Select plant"}</option>
            {plantOptions.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.code} — {plant.name}
              </option>
            ))}
          </select>
          {plantError ? <span className="field__hint field__hint--error">{plantError}</span> : null}
        </label>

        {showLine ? (
          <label className="field">
            <span className="field__label">Line</span>
            <select
              value={draft.line_id ?? ""}
              disabled={lineDisabled}
              onChange={(e) => {
                const nextLineId = e.target.value;
                onLineChange?.(nextLineId);
              }}
            >
              <option value="">{lineLoading ? "Loading lines..." : lineError ? "Unable to load lines" : "Select line"}</option>
              {lineOptions.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.code} — {line.name}
                </option>
              ))}
            </select>
            {lineError ? <span className="field__hint field__hint--error">{lineError}</span> : null}
            {!lineError && !lineLoading && !draft.plant_id && !lineOptions.length ? (
              <span className="field__hint">Select a plant to load lines</span>
            ) : null}
            {!lineError && !lineLoading && draft.plant_id && !lineOptions.length ? (
              <span className="field__hint">No lines available</span>
            ) : null}
          </label>
        ) : null}

        {showMachine ? (
          <label className="field">
            <span className="field__label">Machine</span>
            <select
              value={draft.machine_id ?? ""}
              disabled={machineDisabled}
              onChange={(e) => {
                const nextMachineId = e.target.value;
                onMachineChange?.(nextMachineId);
              }}
            >
              <option value="">{machineLoading ? "Loading machines..." : machineError ? "Unable to load machines" : "Select machine"}</option>
              {machineOptions.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.code} — {machine.name}
                </option>
              ))}
            </select>
            {machineError ? <span className="field__hint field__hint--error">{machineError}</span> : null}
            {!machineError && !machineLoading && !draft.line_id && !machineOptions.length ? (
              <span className="field__hint">Select a line to load machines</span>
            ) : null}
            {!machineError && !machineLoading && draft.line_id && !machineOptions.length ? (
              <span className="field__hint">No machines available</span>
            ) : null}
          </label>
        ) : null}

        <label className="field">
          <span className="field__label">Period type</span>
          <select
            value={draft.period_type}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...draft, period_type: e.target.value as PeriodType })
            }
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Period start</span>
          <input
            type="date"
            value={draft.period_start}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, period_start: e.target.value })}
          />
        </label>
      </div>

      <div className="filter-bar__actions">
        <button type="button" className="btn btn--primary" disabled={disabled} onClick={onApply}>
          Apply
        </button>
        <button type="button" className="btn btn--ghost" disabled={disabled} onClick={onReset}>
          Reset
        </button>
        {validationError ? (
          <p className="filter-bar__error" role="alert">
            {validationError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
