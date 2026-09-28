import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "../Spinner";
import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** The button classes on their own, so a router <Link> can look exactly like a Button. */
export function buttonClassName({ variant = "primary", size = "md", fullWidth, className }: ButtonStyleOptions = {}) {
  return ["button", `button--${variant}`, `button--${size}`, fullWidth && "button--full", className]
    .filter(Boolean)
    .join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleOptions {
  /** Shows a spinner, disables the button and announces the busy state to screen readers. */
  loading?: boolean;
  /** Replaces the label while loading, e.g. "Signing in…". */
  loadingLabel?: string;
  icon?: ReactNode;
}

export function Button({
  variant,
  size,
  fullWidth,
  className,
  loading = false,
  loadingLabel,
  icon,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="sm" decorative /> : icon}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
}
