import { useState } from "react";
import { useAdminUnits } from "../../hooks/useAdminUnits";
import { useDebounce } from "../../hooks/useDebounce";
import type { AdminUnitSummary } from "../../types/admin-unit.types";
import type { AlertAreaRef } from "../../types/alert.types";
import { alertCoverage, describeCoverage } from "../../utils/alert-coverage";
import { areaTitle } from "../../utils/area-title";
import { Callout } from "../shared/Callout";
import { Icon } from "../shared/Icon";
import "./alerts.css";

interface AreaPickerProps {
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
  /** The areas of an alert being edited, so its chips have names before the lists have loaded. */
  knownAreas?: AlertAreaRef[];
}

/** What an alert says about one of its areas, as much of a summary as the picker needs. */
const fromRef = ({ id, unitName, levelName, level }: AlertAreaRef): AdminUnitSummary => ({
  id,
  countryCode: "",
  level,
  levelName,
  unitName,
  unitCode: null,
  parentId: null,
  sourceId: "",
  childCount: 0,
  bbox: [0, 0, 0, 0],
  centroid: [0, 0],
});

/**
 * Chooses the areas an alert covers: whole states, or LGAs found by name. The chosen ones are
 * listed as removable chips, with a line saying how many LGAs that adds up to. A whole state
 * covers every LGA in it, so choosing one says so in plain words, and its LGAs are shown as
 * covered rather than as separate choices: nobody should issue a statewide alert by ticking a box
 * they took for something smaller. Alerts never cover a single ward (too small to warn about alone).
 */
export function AreaPicker({ value, onChange, error, knownAreas }: AreaPickerProps) {
  const [query, setQuery] = useState("");
  const q = useDebounce(query.trim(), 250);
  const { units: states } = useAdminUnits({ level: 1, pageSize: 100 });
  const { units: lgas, loading } = useAdminUnits({ level: 2, q, pageSize: 50 });
  const [known, setKnown] = useState<Record<string, AdminUnitSummary>>({});

  const chosen = value
    .map((id) => {
      const listed = [...states, ...lgas].find((unit) => unit.id === id);
      const given = knownAreas?.find((area) => area.id === id);
      return listed ?? known[id] ?? (given ? fromRef(given) : undefined);
    })
    .filter((unit): unit is AdminUnitSummary => unit !== undefined);
  const coverage = alertCoverage(chosen);
  const coveredStateIds = new Set(coverage.states.map((state) => state.id));

  const toggle = (unit: AdminUnitSummary) => {
    setKnown((current) => ({ ...current, [unit.id]: unit }));
    if (value.includes(unit.id)) return onChange(value.filter((id) => id !== unit.id));
    // A state covers every LGA in it, so LGAs already chosen inside it are no longer needed.
    onChange(unit.level === 1 ? [...value.filter((id) => known[id]?.parentId !== unit.id), unit.id] : [...value, unit.id]);
  };

  const option = (unit: AdminUnitSummary) => {
    const covered = unit.level === 2 && unit.parentId !== null && coveredStateIds.has(unit.parentId);
    return (
      <label key={unit.id} className={`area-picker__option${covered ? " area-picker__option--covered" : ""}`}>
        <input type="checkbox" checked={covered || value.includes(unit.id)} disabled={covered} onChange={() => toggle(unit)} />
        {areaTitle(unit.unitName, unit.levelName)}
      </label>
    );
  };

  return (
    <fieldset className="area-picker" data-cy="area-picker">
      <legend className="field__label">Areas covered</legend>
      {value.length > 0 && (
        <ul className="area-picker__chips" aria-label="Chosen areas">
          {value.map((id) => {
            const unit = chosen.find((candidate) => candidate.id === id);
            return (
              <li key={id}>
                {unit ? `${areaTitle(unit.unitName, unit.levelName)}${unit.level === 1 ? " · whole state" : ""}` : "Area"}
                <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} aria-label={`Remove ${unit?.unitName ?? "area"}`}>
                  <Icon name="close" size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {value.length > 0 && (
        <p className="area-picker__summary" data-cy="area-picker-summary">
          {describeCoverage(coverage)}
        </p>
      )}
      {coverage.states.length > 0 && (
        <Callout tone="warning" dataCy="area-picker-state-warning">
          A whole state covers every LGA in it, and everyone living there is notified. To warn only some LGAs, untick the state and choose them below.
        </Callout>
      )}
      {states.length > 0 && (
        <div className="area-picker__group">
          <p className="area-picker__group-title">Whole states</p>
          {states.map(option)}
        </div>
      )}
      <div className="area-picker__group">
        <p className="area-picker__group-title">LGAs</p>
        <input
          type="search"
          className="field__input"
          placeholder="Find an LGA by name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Find an LGA by name"
          data-cy="area-picker-search"
        />
        <div className="area-picker__list">
          {lgas.map(option)}
          {!loading && lgas.length === 0 && <p className="area-picker__none">No LGA matches “{q}”.</p>}
        </div>
      </div>
      {error && <p className="field__error">{error}</p>}
    </fieldset>
  );
}
