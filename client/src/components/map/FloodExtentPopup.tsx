import { useState } from "react";
import { Popup } from "react-map-gl/mapbox";
import { useFloodPeople } from "../../hooks/useSurveyDetails";
import type { SelectedSurvey } from "../../types/field-survey.types";
import { formatDateTime } from "../../utils/formatDate";
import type { SurveyAbilities } from "../../utils/permissions";
import { roleLabel } from "../../utils/roles";
import { formatArea } from "../../utils/survey-geometry";
import { WATER_DEPTH_INFO } from "../../utils/water-depth";
import { PhotoSection } from "../photos/PhotoSection";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { FloodImpactSummary } from "./FloodImpactSummary";

type Flood = Extract<SelectedSurvey, { type: "flood" }>;

interface FloodExtentPopupProps {
  flood: Flood;
  abilities: SurveyAbilities;
  /** Left out where the popup is only for reading (a place's page): nothing is then offered to change. */
  onRecede?: (id: string) => Promise<boolean>;
  /** Puts a receded flood back as still going. */
  onReopen?: (id: string) => Promise<boolean>;
  onDelete?: () => void;
  /** Whether the buildings, roads and facilities it reaches are drawn over the map, and the switch for it. */
  showingImpact?: boolean;
  onToggleImpact?: () => void;
  onClose: () => void;
}

const personText = (person: { name: string | null; role: string | null } | null) =>
  person ? [person.name, person.role ? `(${roleLabel(person.role)})` : null].filter(Boolean).join(" ") || "someone" : "someone whose account is gone";

/**
 * A recorded flood: how big, how deep, when, what it reaches (which can be drawn over the map) and which
 * drains are near; for staff, who recorded it and who called it over, and its photos; and, for those
 * allowed, calling it over or deleting it.
 */
export function FloodExtentPopup({ flood, abilities, onRecede, onReopen, onDelete, showingImpact = false, onToggleImpact, onClose }: FloodExtentPopupProps) {
  const { properties, point, impact } = flood;
  const [busy, setBusy] = useState(false);
  const people = useFloodPeople(properties.id, abilities.viewPeople) ?? null;

  const run = async (action?: (id: string) => Promise<boolean>) => {
    setBusy(true);
    await action?.(properties.id);
    setBusy(false);
  };
  const mayDelete = abilities.deleteAny || (abilities.deleteOwn && (!people || people.recordedBy?.id === abilities.userId));

  return (
    <Popup longitude={point[0]} latitude={point[1]} anchor="bottom" offset={8} maxWidth="320px" closeOnClick={false} onClose={onClose} className="admin-unit-popup">
      <div className="survey-popup" data-cy="flood-popup">
        <p className="location-summary__title">
          Flood {properties.receded ? <Badge tone="neutral">Receded</Badge> : <Badge tone="info">Active</Badge>}
        </p>
        <p className="survey-popup__figure" data-cy="flood-area">
          {formatArea(properties.areaM2)}
          <span>
            {properties.depth ? ` · ${WATER_DEPTH_INFO[properties.depth].label}` : ""} · {properties.method === "walked" ? "walked with GPS" : "drawn on the map"}
          </span>
        </p>
        <p className="survey-popup__meta">
          Recorded {formatDateTime(properties.observedAt)}
          {abilities.viewPeople && people && <> by {personText(people.recordedBy)}</>}
        </p>
        {abilities.viewPeople && people?.recededAt && (
          <p className="survey-popup__meta" data-cy="flood-receded-by">
            Called over {formatDateTime(people.recededAt)} by {personText(people.recededBy)}
          </p>
        )}
        {abilities.viewPeople && !people?.recededAt && people?.reopenedAt && (
          <p className="survey-popup__meta">
            Put back as still going {formatDateTime(people.reopenedAt)} by {personText(people.reopenedBy)}
          </p>
        )}
        <FloodImpactSummary id={properties.id} initial={impact} />
        {onToggleImpact && (
          <Button variant="ghost" size="sm" icon={<Icon name="layers" size={14} />} aria-pressed={showingImpact} onClick={onToggleImpact} data-cy="toggle-flood-impact">
            {showingImpact ? "Hide what it reaches" : "Show what it reaches on the map"}
          </Button>
        )}
        <PhotoSection subject={{ type: "flood", id: properties.id }} abilities={abilities} of="the flood" knownCount={properties.photoCount} />
        {onRecede && (abilities.recedeFlood || (onDelete && mayDelete)) && (
          <div className="survey-popup__actions">
            {abilities.recedeFlood &&
              (properties.receded ? (
                onReopen && (
                  <Button variant="secondary" size="sm" icon={<Icon name="refresh" size={14} />} loading={busy} loadingLabel="Saving…" onClick={() => void run(onReopen)} data-cy="reopen-flood">
                    Water is still there
                  </Button>
                )
              ) : (
                <Button variant="secondary" size="sm" icon={<Icon name="check" size={14} />} loading={busy} loadingLabel="Saving…" onClick={() => void run(onRecede)} data-cy="recede-flood">
                  Water has gone down
                </Button>
              ))}
            {onDelete && mayDelete && (
              <Button variant="danger" size="sm" icon={<Icon name="trash" size={14} />} disabled={busy} onClick={onDelete} data-cy="delete-flood">
                Delete
              </Button>
            )}
          </div>
        )}
      </div>
    </Popup>
  );
}
