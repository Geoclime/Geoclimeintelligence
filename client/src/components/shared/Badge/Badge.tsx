import type { ReactNode } from "react";
import "./Badge.css";

export type BadgeTone = "neutral" | "primary" | "danger" | "warning" | "success" | "info" | "violet";

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  dataCy?: string;
}

export function Badge({ tone = "neutral", children, dataCy }: BadgeProps) {
  return (
    <span className={`badge badge--${tone}`} data-cy={dataCy}>
      {children}
    </span>
  );
}
