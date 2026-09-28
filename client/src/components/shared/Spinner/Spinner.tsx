import "./Spinner.css";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** Text announced to screen readers. Ignored when `decorative`. */
  label?: string;
  /** Hide from assistive tech when something nearby already announces the busy state. */
  decorative?: boolean;
}

export function Spinner({ size = "md", label = "Loading", decorative = false }: SpinnerProps) {
  return (
    <span
      className={`spinner spinner--${size}`}
      role={decorative ? undefined : "status"}
      aria-hidden={decorative || undefined}
    >
      {!decorative && <span className="visually-hidden">{label}</span>}
    </span>
  );
}
