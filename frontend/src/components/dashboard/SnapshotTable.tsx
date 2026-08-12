import type { OeeSnapshot, ScopeType } from "../../types/dashboard";
import {
  formatDateTime,
  formatMachineUtilisation,
  formatNumber,
  formatRatioAsPercent,
} from "../../utils/format";
import { StatusBanner } from "./StatusBanner";

type Props = {
  title: string;
  description: string;
  items: OeeSnapshot[];
  loading: boolean;
  error: string | null;
  emptyMessage?: string;
  gapMessage?: string | null;
  onDrill?: (scopeType: ScopeType, scopeId: string) => void;
};

export function SnapshotTable({
  title,
  description,
  items,
  loading,
  error,
  emptyMessage = "No rows for this period.",
  gapMessage,
  onDrill,
}: Props) {
  return (
    <section className="panel table-panel">
      <div className="panel__head">
        <h2>{title}</h2>
        <p className="panel__desc">{description}</p>
      </div>

      {gapMessage ? (
        <p className="status-banner status-banner--empty">{gapMessage}</p>
      ) : (
        <StatusBanner
          loading={loading}
          error={error}
          empty={items.length === 0}
          emptyMessage={emptyMessage}
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Scope ID</th>
                  <th>Period</th>
                  <th>OEE</th>
                  <th>A</th>
                  <th>P</th>
                  <th>Q</th>
                  <th>Utilisation</th>
                  <th>Produced</th>
                  <th>Good</th>
                  <th>Computed</th>
                  {onDrill ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.scope_type}</td>
                    <td className="mono">{row.scope_id}</td>
                    <td>
                      {row.period_type} / {row.period_start}
                    </td>
                    <td>{formatRatioAsPercent(row.oee)}</td>
                    <td>{formatRatioAsPercent(row.availability)}</td>
                    <td>{formatRatioAsPercent(row.performance)}</td>
                    <td>{formatRatioAsPercent(row.quality)}</td>
                    <td>{formatMachineUtilisation(row.machine_utilisation)}</td>
                    <td>{formatNumber(row.sum_produced_qty)}</td>
                    <td>{formatNumber(row.sum_good_qty)}</td>
                    <td>{formatDateTime(row.computed_at)}</td>
                    {onDrill ? (
                      <td>
                        <button
                          type="button"
                          className="btn btn--link"
                          onClick={() =>
                            onDrill(row.scope_type as ScopeType, row.scope_id)
                          }
                        >
                          Filter
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta-line">{items.length} row(s)</p>
        </StatusBanner>
      )}
    </section>
  );
}
