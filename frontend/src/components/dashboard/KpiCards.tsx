import type { OeeSnapshot } from "../../types/dashboard";
import {
  formatDateTime,
  formatMachineUtilisation,
  formatRatioAsPercent,
} from "../../utils/format";

type Props = {
  snapshot: OeeSnapshot | null;
  summary: OeeSnapshot | null;
  loading: boolean;
  error: string | null;
  empty: boolean;
};

type Card = {
  key: string;
  label: string;
  value: string;
  hint?: string;
};

export function KpiCards({ snapshot, summary, loading, error, empty }: Props) {
  if (loading) {
    return (
      <section className="kpi-grid" aria-busy="true">
        {["OEE", "Availability", "Performance", "Quality", "Machine Utilisation"].map(
          (label) => (
            <article key={label} className="kpi-card kpi-card--skeleton">
              <h3>{label}</h3>
              <p className="kpi-card__value">…</p>
            </article>
          ),
        )}
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel panel--error" role="alert">
        <h2>KPI snapshot</h2>
        <p>{error}</p>
      </section>
    );
  }

  if (empty || !snapshot) {
    return (
      <section className="panel panel--muted">
        <h2>KPI snapshot</h2>
        <p>No OEE snapshot for this scope × period. Apply filters after rollup data exists.</p>
      </section>
    );
  }

  const cards: Card[] = [
    { key: "oee", label: "OEE", value: formatRatioAsPercent(snapshot.oee) },
    {
      key: "a",
      label: "Availability",
      value: formatRatioAsPercent(snapshot.availability),
    },
    {
      key: "p",
      label: "Performance",
      value: formatRatioAsPercent(snapshot.performance),
      hint: "AF / run-time path from snapshot (not AG)",
    },
    {
      key: "q",
      label: "Quality",
      value: formatRatioAsPercent(snapshot.quality),
    },
    {
      key: "mu",
      label: "Machine Utilisation",
      value: formatMachineUtilisation(snapshot.machine_utilisation),
      hint: "N/A when null — not stored on oee_snapshots",
    },
  ];

  return (
    <section aria-label="KPI cards">
      <div className="kpi-grid">
        {cards.map((card) => (
          <article key={card.key} className="kpi-card">
            <h3>{card.label}</h3>
            <p className="kpi-card__value">{card.value}</p>
            {card.hint ? <p className="kpi-card__hint">{card.hint}</p> : null}
          </article>
        ))}
      </div>
      <p className="meta-line">
        Period {snapshot.period_start} ({snapshot.period_type}) · scope{" "}
        {snapshot.scope_type}/{snapshot.scope_id} · computed{" "}
        {formatDateTime(snapshot.computed_at)}
        {summary ? (
          <>
            {" "}
            · latest summary period {summary.period_start} (
            {formatRatioAsPercent(summary.oee)} OEE)
          </>
        ) : null}
      </p>
    </section>
  );
}
