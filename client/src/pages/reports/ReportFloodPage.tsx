import { useState } from "react";
import { DeleteReportDialog } from "../../components/reports/DeleteReportDialog";
import { EditReportDialog } from "../../components/reports/EditReportDialog";
import { ReportCard } from "../../components/reports/ReportCard";
import { ReportFloodForm } from "../../components/reports/ReportFloodForm";
import { Callout } from "../../components/shared/Callout";
import { EmptyState } from "../../components/shared/EmptyState";
import { ErrorState } from "../../components/shared/ErrorState";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { SITE } from "../../config/site";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useFloodReportActions, useMyFloodReports, useSubmitFloodReport } from "../../hooks/useFloodReports";
import { useToast } from "../../hooks/useToast";
import type { FloodReport } from "../../types/flood-report.types";
import "../../components/reports/reports.css";

/**
 * Report flooding, and follow what happened to your earlier reports. A report that isn't published
 * can still be edited or deleted; a published one can only be removed by a coordinator.
 */
export function ReportFloodPage() {
  useDocumentTitle("Report flooding");
  const { showToast } = useToast();
  const { submit } = useSubmitFloodReport();
  const mine = useMyFloodReports(1, 10);
  const { update, remove } = useFloodReportActions();
  const [editing, setEditing] = useState<FloodReport | null>(null);
  const [deleting, setDeleting] = useState<FloodReport | null>(null);
  // A new key gives a fresh, empty form after each report.
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="page" data-cy="report-flood-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Flooding</p>
          <h1 className="page__title">Report flooding</h1>
          <p className="page__lead">
            Tell coordinators what is happening where you are. Every report is checked before it appears on the public alert map, and your
            name is never shown publicly.
          </p>
        </div>
      </header>

      <div className="flood-page__grid">
        <section className="card flood-card" aria-label="Flood report">
          <ReportFloodForm
            key={formKey}
            onSubmit={submit}
            onSent={() => {
              showToast({ type: "success", message: "Thank you. Your report was sent and a coordinator will review it." });
              setFormKey((k) => k + 1);
              mine.refetch();
            }}
          />
        </section>

        <div className="flood-page__side">
          <Callout tone="danger" title="Is anyone in danger?">
            Call <a href={`tel:${SITE.emergencyNumber}`}>{SITE.emergencyNumber}</a> first. Reports here help coordinators plan; they don't send help.
          </Callout>
          <section className="card flood-card" aria-labelledby="my-reports-title" data-cy="my-reports">
            <h2 id="my-reports-title" className="flood-card__title">
              Your reports
            </h2>
            {mine.loading && mine.reports.length === 0 ? (
              <LoadingSpinner message="Loading your reports…" />
            ) : mine.error ? (
              <ErrorState message={mine.error} onRetry={mine.refetch} />
            ) : mine.reports.length === 0 ? (
              <EmptyState icon="inbox" title="No reports yet" message="Reports you send appear here with their review status." />
            ) : (
              <ul className="flood-page__list">
                {mine.reports.map((report) => (
                  <li key={report.id}>
                    <ReportCard
                      report={report}
                      onEdit={report.status !== "published" ? () => setEditing(report) : undefined}
                      onDelete={report.status !== "published" ? () => setDeleting(report) : undefined}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {editing && (
        <EditReportDialog
          key={editing.id}
          report={editing}
          onClose={() => setEditing(null)}
          onSave={update}
          onSaved={() => {
            setEditing(null);
            showToast({
              type: "success",
              message: editing.status === "rejected" ? "Your changes were saved and the report is back with the coordinators." : "Your report was updated.",
            });
          }}
        />
      )}
      <DeleteReportDialog report={deleting} onClose={() => setDeleting(null)} onConfirm={(report) => remove(report.id)} />
    </div>
  );
}
