import type { ReactNode } from "react";
import { Icon, type IconName } from "../Icon";
import "./Callout.css";

export type CalloutTone = "info" | "success" | "warning" | "danger";

const ICONS: Record<CalloutTone, IconName> = { info: "info", success: "check", warning: "alert", danger: "alert" };

interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  dataCy?: string;
}

/** An inline message inside a page or form, e.g. a form-level error or "check your inbox". */
export function Callout({ tone = "info", title, children, action, dataCy }: CalloutProps) {
  return (
    <div className={`callout callout--${tone}`} role={tone === "danger" ? "alert" : "status"} data-cy={dataCy}>
      <span className="callout__icon">
        <Icon name={ICONS[tone]} size={18} />
      </span>
      <div className="callout__content">
        {title && <p className="callout__title">{title}</p>}
        <div className="callout__body">{children}</div>
      </div>
      {action && <div className="callout__action">{action}</div>}
    </div>
  );
}
