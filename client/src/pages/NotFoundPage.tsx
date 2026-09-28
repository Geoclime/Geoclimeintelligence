import { Link } from "react-router";
import { buttonClassName } from "../components/shared/Button";
import { EmptyState } from "../components/shared/EmptyState";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <div className="page" data-cy="not-found">
      <EmptyState
        icon="pin"
        title="We couldn't find that page"
        message="The link may be out of date, or the page may have moved."
        action={
          <Link to="/" className={buttonClassName({ variant: "secondary" })}>
            Go to overview
          </Link>
        }
      />
    </div>
  );
}
