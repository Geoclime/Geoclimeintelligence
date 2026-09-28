import { useId, useState, type InputHTMLAttributes, type Ref } from "react";
import { Icon } from "../Icon";
import "./TextField.css";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  /** Guidance shown under the field until there is an error. */
  hint?: string;
  error?: string;
  /** For passwords: adds a show/hide toggle. */
  revealable?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/**
 * A labelled input with inline hint and error text, wired for screen readers (aria-invalid,
 * aria-describedby). Works directly with react-hook-form's register(), ref included.
 */
export function TextField({ label, hint, error, revealable, type = "text", id, className, ref, ...rest }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  const [revealed, setRevealed] = useState(false);
  const inputType = revealable && revealed ? "text" : type;

  return (
    <div className={["field", error && "field--invalid", className].filter(Boolean).join(" ")}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="field__control">
        <input
          ref={ref}
          id={inputId}
          type={inputType}
          className="field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {revealable && (
          <button
            type="button"
            className="field__reveal"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
          >
            <Icon name={revealed ? "eyeOff" : "eye"} size={18} />
          </button>
        )}
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
