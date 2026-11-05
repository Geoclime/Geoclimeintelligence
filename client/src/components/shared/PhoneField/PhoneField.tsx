import { useId, useState, type ChangeEvent, type Ref } from "react";
import { AFRICAN_PHONE_COUNTRIES, DEFAULT_PHONE_COUNTRY, OTHER_PHONE_COUNTRIES, PHONE_COUNTRIES, type PhoneCountry } from "../../../utils/phone-countries";
import { formatNational, joinPhone, normalisePhone, splitPhone } from "../../../utils/phone";
import "../TextField/TextField.css";
import "./PhoneField.css";

interface PhoneFieldProps {
  label: string;
  /** The whole number in international format ("+2348031234567"), or "" while nothing is entered. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  hint?: string;
  error?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Focuses the number box: react-hook-form uses it to jump to a field with an error. */
  ref?: Ref<HTMLInputElement>;
  "data-cy"?: string;
}

interface Parts {
  country: PhoneCountry;
  text: string;
}

function toParts(value: string): Parts {
  const { country, national } = splitPhone(value);
  return { country: country ?? DEFAULT_PHONE_COUNTRY, text: formatNational(national) };
}

const option = (entry: PhoneCountry) => (
  <option key={entry.iso} value={entry.iso}>
    {entry.name} (+{entry.dial})
  </option>
);

/**
 * A phone number with a country-code dropdown (Nigeria first, then the rest of Africa, then
 * elsewhere). The person types the number the way they dial it at home; the value handed back is
 * always international, "+2348031234567". Pasting "+44 7700 900123" picks the United Kingdom itself.
 *
 * It remembers what was typed and the country chosen, and only starts over when the value is
 * changed from outside (a form reset, a saved profile), so spaces and a leading 0 aren't taken
 * away mid-keystroke.
 */
export function PhoneField({ label, value, onChange, onBlur, hint, error, id, disabled, className, ref, "data-cy": dataCy }: PhoneFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  const [parts, setParts] = useState<Parts>(() => toParts(value));
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    if (normalisePhone(value) !== joinPhone(parts.country, parts.text)) setParts(toParts(value));
  }

  const update = (next: Parts) => {
    setParts(next);
    const joined = joinPhone(next.country, next.text);
    if (joined !== value) onChange(joined);
  };

  const onText = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    if (text.trim().startsWith("+")) {
      const pasted = splitPhone(text);
      if (pasted.country) return update({ country: pasted.country, text: formatNational(pasted.national) });
    }
    update({ country: parts.country, text });
  };

  const onCountry = (event: ChangeEvent<HTMLSelectElement>) => {
    const country = PHONE_COUNTRIES.find((entry) => entry.iso === event.target.value);
    if (country) update({ country, text: parts.text });
  };

  return (
    <div className={["field", "phone-field", error && "field--invalid", className].filter(Boolean).join(" ")}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="phone-field__control">
        <div className="phone-field__code">
          <span aria-hidden="true">
            <span className="phone-field__iso">{parts.country.iso}</span> +{parts.country.dial}
          </span>
          <select
            className="phone-field__select"
            aria-label="Country code"
            value={parts.country.iso}
            onChange={onCountry}
            disabled={disabled}
            data-cy={dataCy ? `${dataCy}-country` : undefined}
          >
            {option(DEFAULT_PHONE_COUNTRY)}
            <optgroup label="Africa">{AFRICAN_PHONE_COUNTRIES.map(option)}</optgroup>
            <optgroup label="Rest of the world">{OTHER_PHONE_COUNTRIES.map(option)}</optgroup>
          </select>
        </div>
        <input
          ref={ref}
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          className="field__input"
          placeholder="803 123 4567"
          maxLength={24}
          value={parts.text}
          onChange={onText}
          onBlur={onBlur}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          data-cy={dataCy}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="field__error" data-cy="field-error">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${inputId}-hint`} className="field__hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
