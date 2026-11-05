import { useFloodImpact } from "../../hooks/useFloodImpact";
import type { FloodImpact } from "../../types/field-survey.types";
import { CONDITION_INFO, drainTitle } from "../../utils/field-survey";
import { drainsHeadline, impactHeadline, joinList, NEARBY_DRAIN_METRES } from "../../utils/flood-impact";
import { formatDistance } from "../../utils/geo-distance";
import { describeKind } from "../../utils/facility-kinds";
import { Badge } from "../shared/Badge";
import { Spinner } from "../shared/Spinner";

const TONE = { good: "success", warn: "warning", bad: "danger" } as const;

/** What a recorded flood reaches, and the drains beside it: the part of the popup that turns a shape into a plan. */
export function FloodImpactSummary({ id, initial }: { id: string; initial?: FloodImpact }) {
  const { impact, loading, error } = useFloodImpact(id, initial);

  if (loading) {
    return (
      <p className="survey-popup__status">
        <Spinner size="sm" decorative /> Working out what it reaches…
      </p>
    );
  }
  if (error || !impact) return <p className="survey-popup__status">Couldn't work out what this flood reaches. {error}</p>;

  const drains = drainsHeadline(impact.drains, NEARBY_DRAIN_METRES);
  return (
    <div className="flood-impact" data-cy="flood-impact">
      <p className="flood-impact__headline">{impactHeadline(impact)}</p>
      {impact.facilities.items.length > 0 && (
        <p className="flood-impact__line">
          <strong>Facilities:</strong>{" "}
          {joinList(impact.facilities.items.map((item) => item.name ?? describeKind(item.osmClass)))}
          {impact.facilities.total > impact.facilities.items.length ? ` and ${impact.facilities.total - impact.facilities.items.length} more` : ""}
        </p>
      )}
      {impact.settlements.length > 0 && (
        <p className="flood-impact__line">
          <strong>Settlements:</strong> {joinList(impact.settlements)}
        </p>
      )}
      {impact.wards.length > 0 && (
        <p className="flood-impact__line">
          <strong>Wards:</strong> {joinList(impact.wards)}
        </p>
      )}
      {drains && (
        <div className="flood-impact__drains" data-cy="flood-impact-drains">
          <p className="flood-impact__line">
            <strong>Drainage:</strong> {drains}
          </p>
          <ul className="flood-impact__list">
            {impact.drains.items.slice(0, 5).map((drain) => (
              <li key={drain.id}>
                <Badge tone={TONE[CONDITION_INFO[drain.condition].tone]}>{CONDITION_INFO[drain.condition].label}</Badge> {drainTitle(drain)}
                <span className="flood-impact__distance"> · {drain.distanceM < 10 ? "at the edge" : `${formatDistance(drain.distanceM)} away`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
