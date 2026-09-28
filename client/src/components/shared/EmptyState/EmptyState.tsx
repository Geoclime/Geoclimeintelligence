import type { ReactNode } from "react";
import { Icon, type IconName } from "../Icon";
import { StatePanel } from "../StatePanel";

interface EmptyStateProps {
  title?: string;
  message: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}

/**
 * The honest rendering of "no data yet". Never replace it with placeholder or sample records
 * to make a screen look populated (standard section 19.4).
 */
export function EmptyState({ title, message, icon = "inbox", action }: EmptyStateProps) {
  return (
    <StatePanel
      icon={<Icon name={icon} size={26} />}
      title={title}
      message={message}
      actions={action}
      dataCy="empty-state"
    />
  );
}
