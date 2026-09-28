import type { ReactNode } from "react";
import "./StatePanel.css";

export type StateTone = "neutral" | "danger" | "loading";

interface StatePanelProps {
  tone?: StateTone;
  icon?: ReactNode;
  title?: string;
  message: ReactNode;
  actions?: ReactNode;
  /** Fill the viewport, for whole-app states such as "checking your session". */
  fullPage?: boolean;
  role?: "status" | "alert";
  dataCy?: string;
}

/**
 * The one layout behind LoadingSpinner, EmptyState and ErrorState, so every feature's loading,
 * empty and error screens look and behave the same (standard sections 9 and 17.8).
 */
export function StatePanel({ tone = "neutral", icon, title, message, actions, fullPage, role, dataCy }: StatePanelProps) {
  return (
    <div
      className={`state-panel state-panel--${tone}${fullPage ? " state-panel--full" : ""}`}
      role={role}
      data-cy={dataCy}
    >
      {icon && <div className="state-panel__icon">{icon}</div>}
      {title && <h2 className="state-panel__title">{title}</h2>}
      <div className="state-panel__message">{message}</div>
      {actions && <div className="state-panel__actions">{actions}</div>}
    </div>
  );
}
