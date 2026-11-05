import { Link } from "react-router";
import { buttonClassName } from "../components/shared/Button";
import { EmptyState } from "../components/shared/EmptyState";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { MAP_PATH } from "../utils/map-url";

export function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <div className="page" data-cy="not-found">
      <EmptyState
        icon="pin"
        title="We couldn't find that page"
        message="The link may be out of date, or the page may have moved."
        action={
          <Link to={MAP_PATH} className={buttonClassName({ variant: "secondary" })}>
            Go to the map
          </Link>
        }
      />
    </div>
  );
}
