import type { LineTrackerWorksheetRecord, RawMaterialSourceState } from "../../services/lineTrackerWorksheetsApi";
import { displayValue } from "./rawMaterialFormatting";

type Props = {
  data: RawMaterialSourceState;
  error: string | null;
};

export function RawMaterialSourceBanner({ data, error }: Props) {
  const stale = data.is_stale || Boolean(error);
  return (
    <>
      {stale ? <div className="order-analytics__warning" role="status">Some analytics data may be delayed. The last available values remain visible.</div> : null}
      {data.refresh_error ? <div className="order-analytics__warning" role="status">The latest refresh was not available. Showing the last available values.</div> : null}
      {error ? <div className="order-analytics__alert" role="alert">This analytics view could not be refreshed. Showing the last available values.</div> : null}
    </>
  );
}

export function RawSourceRows({
  headers,
  records,
  sourceRecordCount,
}: {
  headers: string[];
  records: LineTrackerWorksheetRecord[];
  sourceRecordCount: number;
}) {
  return (
    <details className="rm-analytics__raw-source">
      <summary>View complete source rows ({sourceRecordCount})</summary>
      <div className="order-analytics__table-wrap">
        <table className="order-analytics__table order-analytics__table--monthly">
          <thead><tr><th scope="col">Row</th>{headers.map((header, index) => <th scope="col" key={`${index}-${header}`}>{header}</th>)}</tr></thead>
          <tbody>{records.map((record) => (
            <tr key={record.row_number}>
              <td>{record.row_number}</td>
              {headers.map((_, index) => <td key={`${record.row_number}-${index}`}>{displayValue(record.values[index])}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  );
}
