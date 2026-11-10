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
 * Chooses the areas an alert covers: whole states, LGAs found by name, or single wards (pick the
 * LGA, then its wards). The chosen ones are listed as removable chips, with a line saying how many
 * LGAs and wards that adds up to. A whole state covers every LGA in it, and an LGA every ward in it,
 * so choosing one says so in plain words, and what it covers is shown as covered rather than as
 * separate choices: nobody should issue a statewide alert by ticking a box they took for something smaller.
 */
export function AreaPicker({ value, onChange, error, knownAreas }: AreaPickerProps) {
  const [query, setQuery] = useState("");
  const q = useDebounce(query.trim(), 250);
  const { units: states } = useAdminUnits({ level: 1, pageSize: 100 });
  const { units: lgas, loading } = useAdminUnits({ level: 2, q, pageSize: 50 });
  // Wards are found through their LGA (many wards share a name), so the LGAs are listed whole for the choice.
  const { units: lgaChoices } = useAdminUnits({ level: 2, pageSize: 100 });
  const [wardLgaId, setWardLgaId] = useState("");
  const { units: wards, loading: wardsLoading } = useAdminUnits({ level: 3, parentId: wardLgaId, pageSize: 100, enabled: wardLgaId !== "" });
  const [known, setKnown] = useState<Record<string, AdminUnitSummary>>({});

  const unitById = (id: string): AdminUnitSummary | undefined => {
    const listed = [...states, ...lgaChoices, ...lgas, ...wards].find((unit) => unit.id === id);
    const given = knownAreas?.find((area) => area.id === id);
    return listed ?? known[id] ?? (given ? fromRef(given) : undefined);
  };
  const chosen = value.map(unitById).filter((unit): unit is AdminUnitSummary => unit !== undefined);
  const coverage = alertCoverage(chosen);
  const coveredStateIds = new Set(coverage.states.map((state) => state.id));
  const lgaOf = (ward: AdminUnitSummary) => lgaChoices.find((lga) => lga.id === ward.parentId);
  /** A ward is already covered when its LGA is chosen, or the state its LGA is in. */
  const wardCovered = (ward: AdminUnitSummary) => {
    if (ward.parentId && value.includes(ward.parentId)) return true;
    const stateId = lgaOf(ward)?.parentId;
    return stateId ? coveredStateIds.has(stateId) : false;
  };
  const wardLabel = (unit: AdminUnitSummary) => {
    const lgaName = lgaOf(unit)?.unitName ?? knownAreas?.find((area) => area.id === unit.id)?.parentName;
    return lgaName ? `${areaTitle(unit.unitName, unit.levelName)} in ${lgaName}` : areaTitle(unit.unitName, unit.levelName);
  };

  const toggle = (unit: AdminUnitSummary) => {
    setKnown((current) => ({ ...current, [unit.id]: unit }));
    if (value.includes(unit.id)) return onChange(value.filter((id) => id !== unit.id));
    // A state covers every LGA and ward in it, and an LGA every ward in it, so what was chosen inside is no longer needed.
    const inside = (id: string) => {
      const other = unitById(id);
      if (!other) return false;
      if (unit.level === 1) return other.parentId === unit.id || (other.level === 3 && lgaOf(other)?.parentId === unit.id);
      return unit.level === 2 && other.level === 3 && other.parentId === unit.id;
    };
    onChange([...value.filter((id) => !inside(id)), unit.id]);
  };

  const option = (unit: AdminUnitSummary) => {
    const covered = unit.level === 2 ? unit.parentId !== null && coveredStateIds.has(unit.parentId) : unit.level === 3 && wardCovered(unit);
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
                {unit ? (unit.level === 3 ? wardLabel(unit) : `${areaTitle(unit.unitName, unit.levelName)}${unit.level === 1 ? " · whole state" : ""}`) : "Area"}
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
          A whole state covers every LGA in it, and everyone living there is notified. To warn only some LGAs or wards, untick the state and choose them below.
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
      <div className="area-picker__group">
        <p className="area-picker__group-title">Wards</p>
        <select
          className="field__input"
          value={wardLgaId}
          onChange={(event) => setWardLgaId(event.target.value)}
          aria-label="Choose an LGA to list its wards"
          data-cy="area-picker-ward-lga"
        >
          <option value="">Choose an LGA to list its wards</option>
          {lgaChoices.map((lga) => (
            <option key={lga.id} value={lga.id}>
              {areaTitle(lga.unitName, lga.levelName)}
            </option>
          ))}
        </select>
        {wardLgaId !== "" && (
          <div className="area-picker__list" data-cy="area-picker-wards">
            {wards.map(option)}
            {!wardsLoading && wards.length === 0 && <p className="area-picker__none">No wards are listed for this LGA.</p>}
          </div>
        )}
      </div>
      {error && <p className="field__error">{error}</p>}
    </fieldset>
  );
}
