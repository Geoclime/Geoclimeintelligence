import { memo } from "react";
import type { StagingRow } from "../../types/import.types";
import { Badge } from "../shared/Badge";

/** One page of staged rows with each one's verdict, errors and warnings, by file row number. */
export const StagingRowsTable = memo(function StagingRowsTable({ rows, parentLevelName }: { rows: StagingRow[]; parentLevelName: string | null }) {
  return (
    <div className="data-table__scroll">
      <table className="data-table" data-cy="staging-table">
        <caption className="visually-hidden">Checked rows</caption>
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">Area</th>
            {parentLevelName && <th scope="col">{parentLevelName}</th>}
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
