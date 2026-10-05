import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ImportPreviewMap } from "../../../components/imports/ImportPreviewMap";
import { ImportStatusBadge } from "../../../components/imports/ImportStatusBadge";
import "../../../components/imports/imports.css";
import { StagingRowsTable } from "../../../components/imports/StagingRowsTable";
import type { MapView } from "../../../components/map/ClimateMap";
import { Breadcrumbs } from "../../../components/shared/Breadcrumbs/Breadcrumbs";
import { Button, buttonClassName } from "../../../components/shared/Button";
import { Callout } from "../../../components/shared/Callout";
import { EmptyState } from "../../../components/shared/EmptyState";
import { ErrorState } from "../../../components/shared/ErrorState";
import { Icon } from "../../../components/shared/Icon";
import { LoadingSpinner } from "../../../components/shared/LoadingSpinner";
import { Modal } from "../../../components/shared/Modal";
import { Pagination } from "../../../components/shared/Pagination";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useImportRun } from "../../../hooks/useImportRun";
import { useImportRunLayer } from "../../../hooks/useImportRunLayer";
import { useTheme } from "../../../hooks/useTheme";
import { useToast } from "../../../hooks/useToast";
import { errorMessage } from "../../../transport/api-error";
import { formatDateTime } from "../../../utils/formatDate";
import { parsePageParam } from "../../../utils/pagination";

const FILTERS = [
  { value: undefined, label: "All rows" },
  { value: "failed", label: "Failed" },
  { value: "passed", label: "Passed" },
] as const;

/**
 * "Review import": which rows passed and which failed, with reasons; the staged shapes on a map
 * with failed ones in red; and Promote, which copies only the passed rows into the live table.
 */
export function ImportReviewPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (["failed", "passed"] as const).find((s) => s === searchParams.get("status"));
  const page = parsePageParam(searchParams.get("page"));
  const { resolved: theme } = useTheme();
  const { showToast } = useToast();
  const run = useImportRun(id, { page, status, pageSize: 50 });
  const [view, setView] = useState<MapView | null>(null);
  const [layerVersion, setLayerVersion] = useState(0);
  const layer = useImportRunLayer(run.run?.id, view?.bbox ?? null, layerVersion);
  const [confirming, setConfirming] = useState(false);
  useDocumentTitle(run.run ? `Import: ${run.run.fileName}` : "Import");

  if (run.loading && !run.run) return <LoadingSpinner message="Loading the import…" />;
  if (run.notFound) {
    return (
      <div className="page">
        <EmptyState icon="file" title="No such import" message="It may have been removed, or the link is incomplete." />
      </div>
    );
  }
  if (run.error && !run.run) return <ErrorState message={run.error} onRetry={run.refetch} />;
  if (!run.run) return null;
  const current = run.run;

  const promoted = current.status === "promoted";
  const parentLevelName = current.options.level > 1 ? "Parent" : null;
  const setFilter = (value?: string) => setSearchParams(value ? { status: value } : {});

  const handlePromote = async () => {
    try {
      const result = await run.promote();
      showToast({ type: "success", message: `${result.promotedCount ?? 0} ${current.options.levelName} areas are now live.` });
      setLayerVersion((v) => v + 1);
    } catch (error) {
      showToast({ type: "error", message: errorMessage(error) });
      run.refetch();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="page" data-cy="import-review-page">
      <Breadcrumbs items={[{ label: "Imports", to: "/admin/imports" }, { label: current.fileName }]} />
      <header className="page__header">
        <div>
          <p className="page__eyebrow">
            Import · {current.options.countryCode} · {current.options.levelName}
          </p>
          <h1 className="page__title">{current.fileName}</h1>
          <p className="page__lead">
            <ImportStatusBadge run={current} />
          </p>
        </div>
        <div className="page__actions">
          {!promoted && (
            <Link
              to={`/admin/imports/new?country=${current.options.countryCode}&level=${current.options.level}`}
              className={buttonClassName({ variant: "secondary" })}
            >
              Upload a corrected file
            </Link>
          )}
          <Button
            icon={<Icon name="check" size={16} />}
            disabled={promoted || current.passedCount === 0}
            onClick={() => setConfirming(true)}
            data-cy="promote"
          >
            {promoted ? "Promoted" : `Promote ${current.passedCount} areas`}
          </Button>
        </div>
      </header>

      <div className="stat-grid" data-cy="import-stats">
        <div className="card stat">
          <span className="stat__label">Rows</span>
          <span className="stat__value">{current.rowCount}</span>
        </div>
        <div className="card stat stat--success">
          <span className="stat__label">Passed</span>
          <span className="stat__value" data-cy="passed-count">{current.passedCount}</span>
        </div>
        <div className={`card stat${current.errorCount > 0 ? " stat--danger" : ""}`}>
          <span className="stat__label">Failed</span>
          <span className="stat__value" data-cy="failed-count">{current.errorCount}</span>
        </div>
        <div className="card stat">
          <span className="stat__label">Live</span>
          <span className={promoted ? "stat__value" : "stat__value stat__value--muted"}>{promoted ? current.promotedCount : "Not yet"}</span>
        </div>
      </div>

      <div className="review-callouts">
        {current.warnings.map((warning) => (
          <Callout key={warning} tone="warning">
            {warning}
          </Callout>
        ))}
        {!promoted && current.errorCount > 0 && current.passedCount > 0 && (
          <Callout tone="info">
            Promote copies only the {current.passedCount} rows that passed. The {current.errorCount} failed rows are left out;
            to include them, fix the file and upload it again.
          </Callout>
        )}
      </div>

      <div className="split split--wide-left">
        {current.extent ? (
          <ImportPreviewMap theme={theme} extent={current.extent} data={layer.data} onViewChange={setView} />
        ) : (
          <div className="card">
            <EmptyState icon="map" title="No shapes to preview" message="None of the rows had a shape that could be read." />
          </div>
        )}
        <section className="card card__body" aria-label="Import details">
          <dl className="detail-list">
            <div>
              <dt>Source</dt>
              <dd>
                {current.source.provider}
                <span className="data-table__secondary">{current.source.datasetName}</span>
              </dd>
            </div>
            {current.sheetName && (
              <div>
                <dt>Sheet</dt>
                <dd className="mono">{current.sheetName}</dd>
              </div>
            )}
            <div>
              <dt>Columns</dt>
              <dd>
                {Object.entries(current.columnMapping).map(([column, heading]) => (
                  <span key={column} className="data-table__secondary">
                    {column} ← {heading}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Checked</dt>
              <dd>
                {formatDateTime(current.createdAt)}
                <span className="data-table__secondary">by {current.createdBy.displayName ?? current.createdBy.email ?? "Unknown"}</span>
              </dd>
            </div>
            {current.promotedAt && (
              <div>
                <dt>Promoted</dt>
                <dd>
                  {formatDateTime(current.promotedAt)}
                  <span className="data-table__secondary">by {current.promotedBy?.displayName ?? current.promotedBy?.email ?? "Unknown"}</span>
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <section className="card section-gap" aria-busy={run.loading} aria-labelledby="rows-title">
        <div className="card__header">
          <h2 id="rows-title" className="card__title">
            Checked rows
          </h2>
          <div className="segmented" role="group" aria-label="Show rows">
            {FILTERS.map((filter) => (
              <button key={filter.label} type="button" aria-pressed={status === filter.value} onClick={() => setFilter(filter.value)} data-cy={`filter-${filter.value ?? "all"}`}>
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        {run.rows.length === 0 ? (
          <EmptyState icon="check" message={status === "failed" ? "No rows failed their checks." : "No rows to show."} />
        ) : (
          <>
            <StagingRowsTable rows={run.rows} parentLevelName={parentLevelName} />
            <div className="card__footer">
              <Pagination
                page={page}
                pageSize={run.pageSize}
                total={run.total}
                hasPrev={run.hasPrev}
                hasNext={run.hasNext}
                onPageChange={(next) => setSearchParams({ ...(status ? { status } : {}), page: String(next) })}
                itemLabel="rows"
                disabled={run.loading}
              />
            </div>
          </>
        )}
      </section>

      <Modal
        open={confirming}
        title={`Promote ${current.passedCount} ${current.options.levelName} areas?`}
        description="They become live: on the map, in the directory, and available to every later feature."
        onClose={() => setConfirming(false)}
        dismissible={!run.promoting}
        dataCy="promote-dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={run.promoting}>
              Cancel
            </Button>
            <Button loading={run.promoting} loadingLabel="Promoting…" onClick={() => void handlePromote()} data-cy="confirm-promote">
              Promote
            </Button>
          </>
        }
      >
        <p>
          Only rows that passed are copied, in one step: if anything goes wrong, nothing is copied.
          {current.errorCount > 0 && ` ${current.errorCount} failed rows will be left out.`} This can't be undone from
          this screen.
        </p>
      </Modal>
    </div>
  );
}
