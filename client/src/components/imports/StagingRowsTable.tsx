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
  /** Flood risk runs show how much of each LGA and ward is high or very high risk. */
  floodRisk?: boolean;
  /** Satellite flood runs show how much of each LGA and ward was water that month. */
  satellite?: boolean;
}

/** One page of staged rows with each one's verdict, errors and warnings, by file row number. */
export const StagingRowsTable = memo(function StagingRowsTable({
  rows,
  parentLevelName,
  rainfall = false,
  floodRisk = false,
  satellite = false,
}: StagingRowsTableProps) {
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
            {floodRisk && (
              <>
                <th scope="col" className="data-table__numeric">
                  High or very high
                </th>
                <th scope="col" className="data-table__numeric">
                  Mean class
                </th>
                <th scope="col" className="data-table__numeric">
                  Mapped area (km²)
                </th>
              </>
            )}
            {satellite && (
              <>
                <th scope="col" className="data-table__numeric">
                  Water (km²)
                </th>
                <th scope="col" className="data-table__numeric">
                  Share
                </th>
                <th scope="col" className="data-table__numeric">
                  Area covered (km²)
                </th>
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
                {row.risk || row.water ? (
                  <span className="data-table__secondary">{row.risk?.levelName ?? row.water?.levelName}</span>
                ) : (
                  row.unitCode && <span className="data-table__secondary mono">{row.unitCode}</span>
                )}
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
              {floodRisk && (
                <>
                  <td data-label="High or very high" className="data-table__numeric" data-cy="risk-percent-high">
                    {row.risk?.percentHigh != null ? `${row.risk.percentHigh}%` : <span className="muted">No data</span>}
                  </td>
                  <td data-label="Mean class" className="data-table__numeric">
                    {row.risk?.meanClass ?? <span className="muted">No data</span>}
                  </td>
                  <td data-label="Mapped area (km²)" className="data-table__numeric">
                    {row.risk ? row.risk.areaKm2.toLocaleString("en") : <span className="muted">No data</span>}
                  </td>
                </>
              )}
              {satellite && (
                <>
                  <td data-label="Water (km²)" className="data-table__numeric" data-cy="water-km2">
                    {row.water ? row.water.floodedKm2.toLocaleString("en", { maximumFractionDigits: 1 }) : <span className="muted">No data</span>}
                  </td>
                  <td data-label="Share" className="data-table__numeric">
                    {row.water?.percentFlooded != null ? `${row.water.percentFlooded}%` : <span className="muted">Not covered</span>}
                  </td>
                  <td data-label="Area covered (km²)" className="data-table__numeric">
                    {row.water ? row.water.measuredKm2.toLocaleString("en", { maximumFractionDigits: 1 }) : <span className="muted">No data</span>}
                  </td>
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
