import type { ReactNode } from "react";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { StatePanel } from "../StatePanel";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  /** Extra actions next to "Try again", e.g. a sign-out button. */
  actions?: ReactNode;
  fullPage?: boolean;
}

export function ErrorState({ title = "Something went wrong", message, onRetry, actions, fullPage }: ErrorStateProps) {
  return (
    <StatePanel
      tone="danger"
      icon={<Icon name="alert" size={26} />}
      title={title}
      message={message}
      fullPage={fullPage}
      role="alert"
      dataCy="error-state"
      actions={
        (onRetry || actions) && (
          <>
            {onRetry && (
              <Button variant="secondary" icon={<Icon name="refresh" size={16} />} onClick={onRetry} data-cy="retry">
                Try again
              </Button>
            )}
            {actions}
          </>
        )
      }
    />
  );
}
