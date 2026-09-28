import { useAuth } from "../../hooks/useAuth";
import { Button } from "../shared/Button";
import { ErrorState } from "../shared/ErrorState";

/**
 * Signed in with Firebase, but the backend couldn't tell us the account's role (it's down,
 * waking up, or unreachable). Nothing role-dependent can render safely, so offer a retry and a
 * way out, rather than guessing a role.
 */
export function SessionErrorState() {
  const { error, retry, signOut } = useAuth();
  return (
    <ErrorState
      fullPage
      title="We couldn't load your account"
      message={error ?? "The server didn't respond."}
      onRetry={retry}
      actions={
        <Button variant="ghost" onClick={() => void signOut()} data-cy="session-error-sign-out">
          Sign out
        </Button>
      }
    />
  );
}
