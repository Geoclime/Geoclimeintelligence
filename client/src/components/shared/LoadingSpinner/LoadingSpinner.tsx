import { Spinner } from "../Spinner";
import { StatePanel } from "../StatePanel";

interface LoadingSpinnerProps {
  message?: string;
  fullPage?: boolean;
}

export function LoadingSpinner({ message = "Loading…", fullPage = false }: LoadingSpinnerProps) {
  return (
    <StatePanel
      tone="loading"
      icon={<Spinner size="lg" decorative />}
      message={message}
      fullPage={fullPage}
      role="status"
      dataCy="loading-state"
    />
  );
}
