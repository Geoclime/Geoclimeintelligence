import { isRouteErrorResponse, useRouteError } from "react-router";
import { Button } from "../components/shared/Button";
import { ErrorState } from "../components/shared/ErrorState";

/**
 * Last-resort screen for a crash while rendering a route, or a page bundle that failed to load
 * (common right after a deploy replaces the old files). Never shows the raw error to the user.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);

  const message = isRouteErrorResponse(error)
    ? `The page couldn't be loaded (${error.status}).`
    : "This screen hit an unexpected problem. Reloading usually fixes it, especially after an update.";

  return (
    <ErrorState
      fullPage
      message={message}
      actions={
        <Button onClick={() => window.location.reload()} data-cy="reload">
          Reload the page
        </Button>
      }
    />
  );
}
