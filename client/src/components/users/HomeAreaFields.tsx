import { useState } from "react";
import { useAdminUnit } from "../../hooks/useAdminUnit";
import { useAdminUnitChildren } from "../../hooks/useAdminUnitChildren";
import { useAdminUnits } from "../../hooks/useAdminUnits";
import { areaTitle } from "../../utils/area-title";
import { SelectField } from "../shared/SelectField";
import "./users.css";

interface HomeAreaFieldsProps {
  /** The chosen LGA's id, or "". */
  value: string;
  onChange: (lgaId: string) => void;
  error?: string;
  /** The chosen ward's id, or "" for none. Leave out (with onWardChange) to ask for the LGA only. */
  wardValue?: string;
  onWardChange?: (wardId: string) => void;
  wardError?: string;
}

/**
 * "Where do you live or work?": a state, then one of its LGAs, then (optionally) a ward in it. The LGA
 * decides which flood alerts reach the person; the ward lets an alert for just their ward reach them too.
 * With a single state on the platform it is chosen already. Changing the state or LGA clears the ward.
 */
export function HomeAreaFields({ value, onChange, error, wardValue = "", onWardChange, wardError }: HomeAreaFieldsProps) {
  const { units: states, loading: statesLoading } = useAdminUnits({ level: 1, pageSize: 100 });
  // A saved LGA tells us its state; otherwise the person picks one (or the only one is picked).
  const { unit: savedLga } = useAdminUnit(value || undefined);
  const [pickedState, setPickedState] = useState<string>("");
  const stateId = pickedState || savedLga?.parentId || (states.length === 1 ? states[0]!.id : "");
  const { children: lgas, loading: lgasLoading } = useAdminUnitChildren(stateId || undefined);
  const { children: wards, loading: wardsLoading } = useAdminUnitChildren(onWardChange && value ? value : undefined);

  return (
    <div className="home-area" data-cy="home-area">
      <SelectField
        label="State"
        value={stateId}
        onChange={(event) => {
          setPickedState(event.target.value);
          onChange("");
          onWardChange?.("");
        }}
        disabled={statesLoading && states.length === 0}
        data-cy="home-state"
      >
        <option value="" disabled>
          {statesLoading ? "Loading states…" : "Choose your state"}
        </option>
        {states.map((state) => (
          <option key={state.id} value={state.id}>
            {areaTitle(state.unitName, state.levelName)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Local government area (LGA)"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onWardChange?.("");
        }}
        disabled={!stateId}
        error={error}
        hint="Flood alerts for this LGA reach you first."
        data-cy="home-lga"
      >
        <option value="" disabled>
          {!stateId ? "Choose a state first" : lgasLoading && lgas.length === 0 ? "Loading LGAs…" : "Choose your LGA"}
        </option>
        {lgas.map((lga) => (
          <option key={lga.id} value={lga.id}>
            {lga.unitName}
          </option>
        ))}
      </SelectField>
      {onWardChange && (
        <SelectField
          label="Ward (optional)"
          value={wardValue}
          onChange={(event) => onWardChange(event.target.value)}
          disabled={!value}
          error={wardError}
          hint="So an alert issued for just your ward reaches you."
          data-cy="home-ward"
        >
          <option value="">{!value ? "Choose your LGA first" : wardsLoading && wards.length === 0 ? "Loading wards…" : "I don't know / not listed"}</option>
          {wards.map((ward) => (
            <option key={ward.id} value={ward.id}>
              {ward.unitName}
            </option>
          ))}
        </SelectField>
      )}
    </div>
  );
}
