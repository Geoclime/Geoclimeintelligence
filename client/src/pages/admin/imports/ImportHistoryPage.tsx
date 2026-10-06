import { Link, useSearchParams } from "react-router";
import { ImportRunsTable } from "../../../components/imports/ImportRunsTable";
import { buttonClassName } from "../../../components/shared/Button";
import { EmptyState } from "../../../components/shared/EmptyState";
import { ErrorState } from "../../../components/shared/ErrorState";
import { Icon } from "../../../components/shared/Icon";
import { LoadingSpinner } from "../../../components/shared/LoadingSpinner";
import { Pagination } from "../../../components/shared/Pagination";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useImportRuns } from "../../../hooks/useImportRuns";
import { parsePageParam } from "../../../utils/pagination";

/** "Import history": every past import with who ran it, when, its rows and status. */
export function ImportHistoryPage() {
  useDocumentTitle("Imports");
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePageParam(searchParams.get("page"));
  const { runs, loading, error, total, pageSize, hasNext, hasPrev, refetch } = useImportRuns(page);

  const newImport = (
    <Link to="/admin/imports/new" className={buttonClassName()} data-cy="new-import">
      <Icon name="upload" size={16} />
      <span>New import</span>
    </Link>
  );

  const renderBody = () => {
    if (loading && runs.length === 0) return <LoadingSpinner message="Loading imports…" />;
    if (error) return <ErrorState message={error} onRetry={refetch} />;
    if (runs.length === 0) {
      return (
        <EmptyState
          icon="upload"
          title="No imports yet"
          message="Start with the state outline (level 1), then the LGAs (level 2), then the wards (level 3)."
          action={newImport}
        />
      );
    }
    return (
      <>
        <ImportRunsTable runs={runs} />
        <div className="card__footer">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPageChange={(next) => setSearchParams({ page: String(next) })}
            itemLabel="imports"
            disabled={loading}
          />
        </div>
      </>
    );
  };

  return (
    <div className="page" data-cy="import-history-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Administration</p>
          <h1 className="page__title">Imports</h1>
          <p className="page__lead">Every file goes through staging and checks, and only goes live when it's promoted.</p>
        </div>
        {runs.length > 0 && newImport}
      </header>
      <section className="card" aria-busy={loading} aria-label="Import history">
        {renderBody()}
      </section>
    </div>
  );
}
