import { useId, type Ref, type TextareaHTMLAttributes } from "react";
import "../TextField/TextField.css";
import "./TextAreaField.css";

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  /** Guidance shown under the field until there is an error. */
  hint?: string;
  error?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

/** TextField's multi-line twin: the same label, hint and error wiring, for a few sentences of text. */
export function TextAreaField({ label, hint, error, id, className, rows = 3, ref, ...rest }: TextAreaFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={["field", error && "field--invalid", className].filter(Boolean).join(" ")}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        className="field__input text-area-field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
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
