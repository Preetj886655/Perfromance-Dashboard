import type { DashboardFilters, PeriodType, ScopeType } from "../../types/dashboard";

type Props = {
  draft: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  onApply: () => void;
  onReset: () => void;
  disabled?: boolean;
  validationError?: string | null;
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
}: Props) {
  return (
    <section className="panel filter-bar" aria-label="Dashboard filters">
      <div className="filter-bar__grid">
        <label className="field">
          <span className="field__label">Scope type</span>
          <select
            value={draft.scope_type}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...draft, scope_type: e.target.value as ScopeType })
            }
          >
            {SCOPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <label className="field field--wide">
          <span className="field__label">Scope ID (UUID)</span>
          <input
            type="text"
            value={draft.scope_id}
            disabled={disabled}
            placeholder="plants.id / lines.id / machines.id"
            spellCheck={false}
            onChange={(e) => onChange({ ...draft, scope_id: e.target.value.trim() })}
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
