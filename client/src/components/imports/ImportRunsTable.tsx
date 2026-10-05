import { memo } from "react";
import { Link } from "react-router";
import type { ImportRun } from "../../types/import.types";
import { formatDateTime } from "../../utils/formatDate";
import { ImportStatusBadge } from "./ImportStatusBadge";

/** The import history: every past run with who ran it, when, its rows and status. */
export const ImportRunsTable = memo(function ImportRunsTable({ runs }: { runs: ImportRun[] }) {
  return (
    <div className="data-table__scroll">
      <table className="data-table" data-cy="import-runs-table">
        <caption className="visually-hidden">Past imports</caption>
        <thead>
          <tr>
            <th scope="col">File</th>
            <th scope="col">Areas</th>
            <th scope="col" className="data-table__numeric">
              Rows
            </th>
            <th scope="col">Status</th>
            <th scope="col">Run by</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} data-cy="import-run-row">
              <td className="data-table__lead">
                <span className="data-table__primary">
                  <Link to={`/admin/imports/${run.id}`}>{run.fileName}</Link>
                </span>
                <span className="data-table__secondary">{run.source.provider}</span>
              </td>
              <td data-label="Areas">
                {run.options.levelName} · {run.options.countryCode}
              </td>
              <td data-label="Rows" className="data-table__numeric">
                {run.passedCount}/{run.rowCount} passed
              </td>
              <td data-label="Status">
                <ImportStatusBadge run={run} />
              </td>
              <td data-label="Run by">
                {run.createdBy.displayName ?? run.createdBy.email ?? "Unknown"}
                <span className="data-table__secondary">{formatDateTime(run.createdAt)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
