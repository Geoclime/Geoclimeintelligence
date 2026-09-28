import { Button } from "../Button";
import { Icon } from "../Icon";
import "./Pagination.css";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPageChange: (page: number) => void;
  /** e.g. "accounts" -> "Showing 1–25 of 60 accounts". */
  itemLabel?: string;
  disabled?: boolean;
}

export function Pagination({
  page,
  pageSize,
  total,
  hasPrev,
  hasNext,
  onPageChange,
  itemLabel = "results",
  disabled,
}: PaginationProps) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label="Pagination" data-cy="pagination">
      <p className="pagination__summary" aria-live="polite">
        Showing <strong>{first.toLocaleString()}</strong>–<strong>{last.toLocaleString()}</strong> of{" "}
        <strong>{total.toLocaleString()}</strong> {itemLabel}
      </p>
      <div className="pagination__controls">
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="chevronLeft" size={16} />}
          disabled={!hasPrev || disabled}
          onClick={() => onPageChange(page - 1)}
          data-cy="pagination-prev"
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!hasNext || disabled}
          onClick={() => onPageChange(page + 1)}
          data-cy="pagination-next"
        >
          Next
          <Icon name="chevronRight" size={16} />
        </Button>
      </div>
    </nav>
  );
}
