import { memo } from "react";
import type { RainfallChange, StagingRow } from "../../types/import.types";
import { Badge } from "../shared/Badge";

/** What Promote does with a rainfall row, as the review table says it. */
const CHANGE_LABELS: Record<RainfallChange, string> = {
  new: "New month",
  filled: "Fills an incomplete month",
  revised: "Replaces the live value",
  unchanged: "Already live",
};

interface StagingRowsTableProps {
  rows: StagingRow[];
  parentLevelName: string | null;
  /** Rainfall runs show each row's month, value and what Promote does with it. */
  rainfall?: boolean;
}

/** One page of staged rows with each one's verdict, errors and warnings, by file row number. */
export const StagingRowsTable = memo(function StagingRowsTable({ rows, parentLevelName, rainfall = false }: StagingRowsTableProps) {
  return (
    <div className="data-table__scroll">
      <table className="data-table" data-cy="staging-table">
        <caption className="visually-hidden">Checked rows</caption>
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">Area</th>
            {parentLevelName && <th scope="col">{parentLevelName}</th>}
            {rainfall && (
              <>
                <th scope="col">Month</th>
                <th scope="col" className="data-table__numeric">
                  Rainfall (mm)
                </th>
                <th scope="col">On promote</th>
              </>
            )}
            <th scope="col">Result</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-cy="staging-row" data-status={row.status}>
              <td data-label="Row" className="mono">
                {row.rowNumber}
              </td>
              <td className="data-table__lead">
                <span className="data-table__primary">{row.unitName ?? <span className="muted">No name</span>}</span>
                {row.unitCode && <span className="data-table__secondary mono">{row.unitCode}</span>}
              </td>
              {parentLevelName && (
                <td data-label={parentLevelName}>
                  {row.parentName ?? row.parentRef ?? <span className="muted">Not available</span>}
                </td>
              )}
              {rainfall && (
                <>
                  <td data-label="Month" className="mono">
                    {row.yearMonth ?? <span className="muted">Not available</span>}
                  </td>
                  <td data-label="Rainfall (mm)" className="data-table__numeric">
                    {row.rainfallMm ?? <span className="muted">Incomplete</span>}
                  </td>
                  <td data-label="On promote">{row.change ? CHANGE_LABELS[row.change] : <span className="muted">Left out</span>}</td>
                </>
              )}
              <td data-label="Result">
                <Badge tone={row.status === "passed" ? "success" : "danger"}>{row.status === "passed" ? "Passed" : "Failed"}</Badge>
              </td>
              <td data-label="Details">
                {row.errors.length === 0 && row.warnings.length === 0 ? (
                  <span className="muted">No issues</span>
                ) : (
                  <>
                    {row.errors.length > 0 && (
                      <ul className="data-table__messages data-table__messages--error" data-cy="row-errors">
                        {row.errors.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    )}
                    {row.warnings.length > 0 && (
                      <ul className="data-table__messages data-table__messages--warning" data-cy="row-warnings">
                        {row.warnings.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
