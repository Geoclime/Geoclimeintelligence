import { useId, useState } from "react";
import {
  LIVE_FORECAST_DAYS,
  MAX_OUTLOOK_DAYS,
  MIN_OUTLOOK_DAYS,
  OUTLOOK_DAY_PRESETS,
} from "../../types/flood-prediction.types";
import "../shared/TextField/TextField.css";
import "./flood-outlook.css";

interface OutlookDaysPickerProps {
  label: string;
  /** The number of days in use. */
  value: number;
  /** Called with a whole number from MIN_OUTLOOK_DAYS to MAX_OUTLOOK_DAYS, and only when it changes. */
  onChange: (days: number) => void;
  disabled?: boolean;
  dataCy?: string;
}

const isValidDays = (text: string) => {
  const n = Number(text);
  return text.trim() !== "" && Number.isInteger(n) && n >= MIN_OUTLOOK_DAYS && n <= MAX_OUTLOOK_DAYS;
};

/**
 * Chooses how many days ahead an outlook looks: a few quick choices, or any whole number in the box.
 * The box is applied when the person leaves it or presses Enter, not on every key, so typing "14"
 * does not first ask for a 1-day outlook.
 */
export function OutlookDaysPicker({ label, value, onChange, disabled, dataCy }: OutlookDaysPickerProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;
  // What is being typed in the box; null while the box just shows the value in use.
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && !isValidDays(draft);

  const choose = (days: number) => {
    setDraft(null);
    if (days !== value) onChange(days);
  };
  const commit = () => {
    if (draft !== null && isValidDays(draft)) choose(Number(draft));
  };

  return (
    <div className="days-picker" data-cy={dataCy}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="days-picker__row">
        <div className="days-picker__presets" role="group" aria-label="Quick choices, in days">
          {OUTLOOK_DAY_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              className={`days-picker__preset${n === value && draft === null ? " is-active" : ""}`}
              aria-pressed={n === value}
              disabled={disabled}
              onClick={() => choose(n)}
              data-cy={`outlook-days-${n}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="days-picker__custom">
          <input
            id={inputId}
            className="field__input days-picker__input"
            type="number"
            inputMode="numeric"
            min={MIN_OUTLOOK_DAYS}
            max={MAX_OUTLOOK_DAYS}
            step={1}
            value={draft ?? String(value)}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              commit();
            }}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid || value > LIVE_FORECAST_DAYS ? messageId : undefined}
            data-cy="outlook-days-input"
          />
          <span className="days-picker__unit">days</span>
        </div>
      </div>
      {invalid ? (
        <p id={messageId} className="field__error" data-cy="outlook-days-error">
          Enter a whole number of days, from {MIN_OUTLOOK_DAYS} to {MAX_OUTLOOK_DAYS}.
        </p>
      ) : value > LIVE_FORECAST_DAYS ? (
        <p id={messageId} className="field__hint">
          Only the first {LIVE_FORECAST_DAYS} days are a weather forecast. The days after that assume the 10-year average rain for the month.
        </p>
      ) : null}
    </div>
  );
}
