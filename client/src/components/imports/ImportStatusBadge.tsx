import type { ImportRun } from "../../types/import.types";
import { Badge } from "../shared/Badge";

/** "Promoted" once live; otherwise whether the checked run is ready, partly ready, or blocked. */
export function ImportStatusBadge({ run }: { run: Pick<ImportRun, "status" | "passedCount" | "errorCount"> }) {
  if (run.status === "promoted") {
    return (
      <Badge tone="success" dataCy="import-status">
        Promoted
      </Badge>
    );
  }
  if (run.passedCount === 0) {
    return (
      <Badge tone="danger" dataCy="import-status">
        Nothing passed
      </Badge>
    );
  }
  return (
    <Badge tone={run.errorCount > 0 ? "warning" : "info"} dataCy="import-status">
      {run.errorCount > 0 ? "Checked, with errors" : "Ready to promote"}
    </Badge>
  );
}
