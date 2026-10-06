import { useId, type ReactNode, type Ref, type SelectHTMLAttributes } from "react";
import "../TextField/TextField.css";

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  ref?: Ref<HTMLSelectElement>;
  children: ReactNode;
}

/** A labelled <select> with the same hint/error wiring as TextField; works with register(). */
export function SelectField({ label, hint, error, id, className, ref, children, ...rest }: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <div className={["field", error && "field--invalid", className].filter(Boolean).join(" ")}>
      <label className="field__label" htmlFor={selectId}>
        {label}
      </label>
      <div className="field__control">
        <select
          ref={ref}
          id={selectId}
          className="field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        >
          {children}
        </select>
      </div>
      {error ? (
        <p id={`${selectId}-error`} className="field__error" data-cy="field-error">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${selectId}-hint`} className="field__hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
