import { useState } from "react";
import { useAdminUnits } from "../../hooks/useAdminUnits";
import { useDebounce } from "../../hooks/useDebounce";
import type { AdminUnitSummary } from "../../types/admin-unit.types";
import { areaTitle } from "../../utils/area-title";
import { Icon } from "../shared/Icon";
import "./alerts.css";

interface AreaPickerProps {
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}

/**
 * Chooses the areas an alert covers: whole states, or LGAs found by name. The chosen ones are
 * listed as removable chips. Alerts never cover a single ward (too small to warn about alone).
 */
export function AreaPicker({ value, onChange, error }: AreaPickerProps) {
  const [query, setQuery] = useState("");
  const q = useDebounce(query.trim(), 250);
  const { units: states } = useAdminUnits({ level: 1, pageSize: 100 });
  const { units: lgas, loading } = useAdminUnits({ level: 2, q, pageSize: 50 });
  const [known, setKnown] = useState<Record<string, AdminUnitSummary>>({});

  const toggle = (unit: AdminUnitSummary) => {
    setKnown((current) => ({ ...current, [unit.id]: unit }));
    onChange(value.includes(unit.id) ? value.filter((id) => id !== unit.id) : [...value, unit.id]);
  };

  const option = (unit: AdminUnitSummary) => (
    <label key={unit.id} className="area-picker__option">
      <input type="checkbox" checked={value.includes(unit.id)} onChange={() => toggle(unit)} />
      {areaTitle(unit.unitName, unit.levelName)}
    </label>
  );

  return (
    <fieldset className="area-picker" data-cy="area-picker">
      <legend className="field__label">Areas covered</legend>
      {value.length > 0 && (
        <ul className="area-picker__chips" aria-label="Chosen areas">
          {value.map((id) => {
            const unit = known[id] ?? [...states, ...lgas].find((u) => u.id === id);
            return (
              <li key={id}>
                {unit ? areaTitle(unit.unitName, unit.levelName) : "Area"}
                <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} aria-label={`Remove ${unit?.unitName ?? "area"}`}>
                  <Icon name="close" size={12} />
                </button>
              </li>
            );
          })}
        </ul>
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
