import { useEffect, useRef, useState } from "react";
import { useDataSources } from "../../hooks/useDataSources";
import { useToast } from "../../hooks/useToast";
import type { DataSource } from "../../types/data-source.types";
import { formatDate } from "../../utils/formatDate";
import { DataSourceDialog } from "../imports/DataSourceDialog";
import { Button, buttonClassName } from "../shared/Button";
import { EmptyState } from "../shared/EmptyState";
import { ErrorState } from "../shared/ErrorState";
import { Icon } from "../shared/Icon";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { Modal } from "../shared/Modal";
import "./configuration.css";

const sourceName = (source: DataSource) => `${source.provider}: ${source.datasetName}`;

/**
 * Where the platform's data comes from: add a source, or delete one or several that nothing uses.
 * A source that imported areas, map layers or imports still point at is refused by the server
 * (409) and stays in the list with the reason shown; the others in the same batch still go.
 */
export function DataSourcesSection() {
  const { sources, loading, error, refetch, addSource, removeSources } = useDataSources();
  const { showToast } = useToast();
  const [dialog, setDialog] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<DataSource[]>([]);
  const [deleting, setDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Derived from the list, so a source that has gone (deleted, or the list reloaded) drops out.
  const selectedSources = sources.filter((source) => selected.has(source.id));
  const allSelected = sources.length > 0 && selectedSources.length === sources.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedSources.length > 0 && !allSelected;
  });

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const handleDelete = async () => {
    const batch = pendingDelete;
    setDeleting(true);
    try {
      const { deleted, failures } = await removeSources(batch.map((source) => source.id));
      // Whatever the server refused stays selected, so it is clear what is left to deal with.
      setSelected(new Set(failures.map((failure) => failure.id)));
      if (failures.length === 0) {
        showToast({
          type: "success",
          message: batch.length === 1 ? `${sourceName(batch[0]!)} deleted.` : `${deleted.length} data sources deleted.`,
        });
      } else {
        const lead = deleted.length > 0 ? `${deleted.length} deleted. ` : "";
        const reason = failures.length === 1 ? failures[0]!.message : `${failures.length} are still in use, so they were kept.`;
        showToast({ type: "error", message: `${lead}${reason}` });
      }
    } finally {
      setDeleting(false);
      setPendingDelete([]);
    }
  };

  const addButton = (
    <Button icon={<Icon name="plus" size={16} />} onClick={() => setDialog((n) => n + 1)} data-cy="add-source">
      Add a source
    </Button>
  );

  const renderBody = () => {
    if (loading && sources.length === 0) return <LoadingSpinner message="Loading data sources…" />;
    if (error) return <ErrorState message={error} onRetry={refetch} />;
    if (sources.length === 0) {
      return (
        <EmptyState
          icon="database"
          title="No data sources yet"
          message="Enter the publisher, dataset, licence and download date from the file's README. Imports and map layers point at a source."
          action={addButton}
        />
      );
    }
    return (
      <div className="data-table__scroll">
        <table className="data-table" data-cy="source-table">
          <caption className="visually-hidden">Data sources</caption>
          <thead>
            <tr>
              <th scope="col" className="data-table__select">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => setSelected(event.target.checked ? new Set(sources.map((s) => s.id)) : new Set())}
                  aria-label="Select all data sources"
                  data-cy="select-all-sources"
                />
              </th>
              <th scope="col">Source</th>
              <th scope="col">Licence</th>
              <th scope="col">Downloaded</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} data-cy="source-row" aria-selected={selected.has(source.id)}>
                <td className="data-table__select" data-label="Select">
                  <input
                    type="checkbox"
                    checked={selected.has(source.id)}
                    onChange={(event) => toggle(source.id, event.target.checked)}
                    aria-label={`Select ${sourceName(source)}`}
                    data-cy="select-source"
                  />
                </td>
                <td className="data-table__lead">
                  <span className="data-table__primary">{source.provider}</span>
                  <span className="data-table__secondary">{source.datasetName}</span>
                </td>
                <td data-label="Licence">{source.license}</td>
                <td data-label="Downloaded">{formatDate(source.downloadedOn)}</td>
                <td className="data-table__actions">
                  <a href={source.url} target="_blank" rel="noreferrer" className={buttonClassName({ variant: "ghost", size: "sm" })} aria-label={`Open ${source.provider} website`}>
                    <Icon name="externalLink" size={16} />
                    <span>Website</span>
                  </a>
                  <Button variant="ghost" size="sm" icon={<Icon name="trash" size={16} />} onClick={() => setPendingDelete([source])} data-cy="delete-source">
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const several = pendingDelete.length > 1;

  return (
    <section className="card" aria-busy={loading} aria-labelledby="data-sources-heading" data-cy="data-sources-section">
      <header className="card__header">
        <div>
          <h2 id="data-sources-heading" className="card__title">
            Data sources
          </h2>
          <p className="card__subtitle">Who published the data on the platform. It is recorded with every feature, for credit and licensing.</p>
        </div>
        {sources.length > 0 && (
          <div className="source-toolbar">
            {selectedSources.length > 0 && (
              <Button variant="danger" icon={<Icon name="trash" size={16} />} onClick={() => setPendingDelete(selectedSources)} data-cy="delete-selected-sources">
                Delete {selectedSources.length} selected
              </Button>
            )}
            {addButton}
          </div>
        )}
      </header>
      {renderBody()}

      <Modal
        open={pendingDelete.length > 0}
        title={several ? `Delete ${pendingDelete.length} data sources?` : `Delete ${pendingDelete[0]?.provider ?? "this source"}?`}
        description={
          several
            ? "They are removed from the list. Any that imported areas, map layers or imports still point at can't be deleted and are kept."
            : `${pendingDelete[0]?.datasetName ?? ""} is removed from the list. A source that imported areas, map layers or imports still point at can't be deleted.`
        }
        onClose={() => setPendingDelete([])}
        dismissible={!deleting}
        dataCy="delete-source-dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete([])} disabled={deleting}>
              Keep {several ? "them" : "it"}
            </Button>
            <Button variant="danger" loading={deleting} loadingLabel="Deleting…" onClick={() => void handleDelete()} data-cy="confirm-delete-source">
              {several ? `Delete ${pendingDelete.length} sources` : "Delete source"}
            </Button>
          </>
        }
      >
        {several && (
          <ul className="source-delete-list" data-cy="delete-source-list">
            {pendingDelete.map((source) => (
              <li key={source.id}>{sourceName(source)}</li>
            ))}
          </ul>
        )}
      </Modal>

      <DataSourceDialog
        key={dialog}
        open={dialog > 0}
        onClose={() => setDialog(0)}
        onSave={addSource}
        onSaved={(source) => {
          setDialog(0);
          showToast({ type: "success", message: `${source.provider} added.` });
        }}
      />
    </section>
  );
}
