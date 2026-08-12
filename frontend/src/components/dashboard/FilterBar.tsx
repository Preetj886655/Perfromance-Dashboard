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
  lineOptions?: LineOption[];
  machineOptions?: MachineOption[];
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
  lineOptions = [],
  machineOptions = [],
  onPlantChange,
  onLineChange,
  onMachineChange,
}: Props) {
  const scopeLabel = draft.scope_type === "plant" ? "Plant" : draft.scope_type === "line" ? "Line" : "Machine";

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
                scope_id: nextType === "plant" ? "" : draft.scope_id,
              };
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
            value={draft.scope_type === "plant" ? draft.scope_id : plantOptions.find((plant) => plant.id === draft.scope_id)?.id ?? ""}
            disabled={disabled || plantOptions.length === 0}
            onChange={(e) => {
              const nextPlantId = e.target.value;
              onPlantChange?.(nextPlantId);
            }}
          >
            <option value="">Select plant</option>
            {plantOptions.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.code} — {plant.name}
              </option>
            ))}
          </select>
        </label>

        {draft.scope_type === "line" || draft.scope_type === "machine" ? (
          <label className="field">
            <span className="field__label">Line</span>
            <select
              value={draft.scope_id}
              disabled={disabled || lineOptions.length === 0}
              onChange={(e) => {
                const nextLineId = e.target.value;
                onLineChange?.(nextLineId);
              }}
            >
              <option value="">Select line</option>
              {lineOptions.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.code} — {line.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {draft.scope_type === "machine" ? (
          <label className="field">
            <span className="field__label">Machine</span>
            <select
              value={draft.scope_id}
              disabled={disabled || machineOptions.length === 0}
              onChange={(e) => {
                const nextMachineId = e.target.value;
                onMachineChange?.(nextMachineId);
              }}
            >
              <option value="">Select machine</option>
              {machineOptions.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.code} — {machine.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          <span className="field__label">{scopeLabel} scope</span>
          <input
            type="text"
            value={draft.scope_id}
            readOnly
            placeholder="Selected ID"
            spellCheck={false}
            aria-label={`${scopeLabel} scope id`}
          />
        </label>

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
