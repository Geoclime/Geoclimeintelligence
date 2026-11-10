import { useFloodAhead } from "../../hooks/useFloodAhead";
import { WARN_DISTANCES_M } from "../../types/flood-ahead.types";
import { formatDistance } from "../../utils/flood-ahead";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { SelectField } from "../shared/SelectField";
import "./flood-ahead.css";

/**
 * Turning on warnings for floods near you as you walk or drive, choosing how far ahead, and what it is
 * doing now, in plain words. The privacy note is always shown: this is the one feature that sends where
 * you are to the server.
 */
export function FloodAheadControl() {
  const { supported, enabled, radiusM, problem, issue, accuracyM, lastCheck, turnOn, turnOff, setRadius } = useFloodAhead();

  if (!supported) {
    return (
      <p className="flood-ahead-control__note" data-cy="flood-ahead-unsupported">
        This browser can't share its location, so it can't warn you about floods nearby.
      </p>
    );
  }

  let status: string | null = null;
  let isProblem = false;
  if (enabled) {
    if (problem) {
      status = problem;
      isProblem = true;
    } else if (issue === "offline") {
      status = "Can't reach the server. Warnings resume when the connection is back.";
      isProblem = true;
    } else if (issue === "inaccurate") {
      status = `Waiting for a more exact location${accuracyM !== null ? ` (now within ${formatDistance(accuracyM)})` : ""}…`;
    } else if (issue === "unavailable") {
      status = "Couldn't check for floods just now. Trying again.";
    } else if (!lastCheck) {
      status = "Finding your location…";
    } else if (lastCheck.floodsNearby === 0) {
      status = `No flooding within ${formatDistance(radiusM)} of you.`;
    } else {
      status = `${lastCheck.floodsNearby === 1 ? "1 flooded place" : `${lastCheck.floodsNearby} flooded places`} within ${formatDistance(radiusM)}, the nearest ${formatDistance(lastCheck.nearestM ?? 0)} away.`;
    }
  }

  return (
    <div className="flood-ahead-control" data-cy="flood-ahead-control">
      <Button
        variant={enabled ? "secondary" : "primary"}
        size="sm"
        icon={<Icon name="alert" size={16} />}
        aria-pressed={enabled}
        onClick={enabled ? turnOff : turnOn}
        data-cy="flood-ahead-toggle"
      >
        {enabled ? "Flood warnings on: turn off" : "Warn me about floods nearby"}
      </Button>

      {enabled && (
        <SelectField
          label="Warn me within"
          value={radiusM}
          onChange={(event) => setRadius(Number(event.target.value))}
          data-cy="flood-ahead-distance"
        >
          {WARN_DISTANCES_M.map((metres) => (
            <option key={metres} value={metres}>
              {formatDistance(metres)}
            </option>
          ))}
        </SelectField>
      )}

      {status && (
        <p
          className={`flood-ahead-control__status${isProblem ? " is-problem" : ""}`}
          role={isProblem ? "alert" : "status"}
          data-cy="flood-ahead-status"
        >
          {status}
        </p>
      )}

      <p className="flood-ahead-control__note">
        {enabled
          ? "Your screen stays on while this is on, so your location keeps updating."
          : "Get a warning when you walk or drive towards a place that is flooded now. Works while the app is open."}{" "}
        Your position is sent to the server only to look for floods near you. It isn't saved.
      </p>
    </div>
  );
}
