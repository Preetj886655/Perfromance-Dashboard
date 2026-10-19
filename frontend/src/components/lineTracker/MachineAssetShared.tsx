import type {
  CapacityChangeAnalyticsResponse,
  MachineAssetBaseResponse,
  MachineMasterAnalyticsResponse,
  MachineConsumablesAnalyticsResponse,
  PlannedShutdownAnalyticsResponse,
} from "../../services/lineTrackerWorksheetsApi";
import { displayValue } from "./rawMaterialFormatting";
import "../../styles/line-tracker-machine-assets.css";

export type MachineAssetPageData =
  | { kind: "machine-master"; data: MachineMasterAnalyticsResponse }
  | { kind: "machine-consumables"; data: MachineConsumablesAnalyticsResponse }
  | { kind: "capacity-change-log"; data: CapacityChangeAnalyticsResponse }
  | { kind: "planned-shutdowns"; data: PlannedShutdownAnalyticsResponse };

export function MachineAssetSourceBanner({
  data,
  error,
}: {
  data: MachineAssetBaseResponse;
  error: string | null;
}) {
  const stale = data.is_stale || Boolean(error);
  return (
    <>
      {stale ? <div className="order-analytics__warning" role="status">Some dashboard data may be delayed. The last available values remain visible.</div> : null}
      {data.refresh_error ? <div className="order-analytics__warning" role="status">The latest refresh was not available. Showing the last available values.</div> : null}
      {error ? <div className="order-analytics__alert" role="alert">This analytics view could not be refreshed. Showing the last available values.</div> : null}
    </>
  );
}

export function MachineAssetSourceRows({
  data,
}: {
  data: MachineAssetBaseResponse;
}) {
  return (
    <details className="rm-analytics__raw-source">
      <summary>View complete asset source rows ({data.source_record_count})</summary>
      <div className="order-analytics__table-wrap">
        <table className="order-analytics__table order-analytics__table--monthly">
          <thead><tr><th scope="col">Row</th>{data.source_headers.map((header, index) => <th scope="col" key={`${index}-${header}`}>{header}</th>)}</tr></thead>
          <tbody>{data.source_records.map((record) => (
            <tr key={record.row_number}>
              <td>{record.row_number}</td>
              {data.source_headers.map((_, index) => <td key={`${record.row_number}-${index}`}>{displayValue(record.values[index])}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  );
}

export function MachineAssetTabs({ current }: { current: string }) {
  const tabs = [
    ["machine-master", "Machine Master"],
    ["machine-consumables", "Machine Consumables"],
    ["capacity-change-log", "Capacity Change Log"],
    ["planned-shutdowns", "Planned Shutdowns"],
  ];
  return (
    <nav className="machine-assets__tabs" aria-label="Machine and maintenance worksheets">
      {tabs.map(([key, label]) => (
        <a key={key} className={current === key ? "machine-assets__tab machine-assets__tab--active" : "machine-assets__tab"} href={`#/line-tracker/worksheet/${key}`} aria-current={current === key ? "page" : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}

export function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <article className="order-analytics__metrics-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
