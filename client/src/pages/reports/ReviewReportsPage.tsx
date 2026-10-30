import { useSearchParams } from "react-router";
import { ReportCard } from "../../components/reports/ReportCard";
import { EmptyState } from "../../components/shared/EmptyState";
import { ErrorState } from "../../components/shared/ErrorState";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { Pagination } from "../../components/shared/Pagination";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useFloodReports } from "../../hooks/useFloodReports";
import { useToast } from "../../hooks/useToast";
import type { ReportStatus } from "../../types/flood-report.types";
import { parsePageParam } from "../../utils/pagination";
import "../../components/reports/reports.css";

const TABS: { status: ReportStatus; label: string }[] = [
  { status: "pending", label: "Waiting for review" },
  { status: "published", label: "Published" },
  { status: "rejected", label: "Not published" },
];

/**
 * The review queue for responders, officials and administrators: community reports inside their
 * region, oldest pending first. Publishing puts a report on the public alert map (its point
 * rounded, the reporter never named); rejecting needs a short reason, which the reporter sees.
 */
export function ReviewReportsPage() {
  useDocumentTitle("Review reports");
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (TABS.find((t) => t.status === searchParams.get("status"))?.status ?? "pending") as ReportStatus;
  const page = parsePageParam(searchParams.get("page"));
  const { reports, loading, error, refetch, review, total, pageSize, hasNext, hasPrev } = useFloodReports({ status, page, pageSize: 20 });

  const go = (next: { status?: ReportStatus; page?: number }) =>
    setSearchParams((params) => {
      if (next.status) {
        params.set("status", next.status);
        params.delete("page");
      }
      if (next.page) params.set("page", String(next.page));
      return params;
    });

  return (
    <div className="page" data-cy="review-reports-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Flooding</p>
          <h1 className="page__title">Review reports</h1>
          <p className="page__lead">
            Check each report before it goes public{user?.scopeAdminUnitId ? ". You see the reports from your region" : ""}. Published reports appear
            on the alert map with their location rounded to about 100 m and without the reporter's name.
          </p>
        </div>
      </header>

      <div className="segmented flood-page__tabs" role="group" aria-label="Report status">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            type="button"
            aria-pressed={tab.status === status}
            onClick={() => go({ status: tab.status })}
            data-cy={`reports-tab-${tab.status}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && reports.length === 0 ? (
        <LoadingSpinner message="Loading reports…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : reports.length === 0 ? (
        <EmptyState icon="inbox" title={status === "pending" ? "Nothing waiting" : "No reports here"} message={status === "pending" ? "New reports from your region appear here." : "Reports you review appear here."} />
      ) : (
        <>
          <ul className="flood-page__list">
            {reports.map((report) => (
              <li key={report.id}>
                <ReportCard
                  report={report}
                  onReview={async (decision, note) => {
                    await review(report.id, decision, note);
                    showToast({ type: "success", message: decision === "publish" ? "Report published to the alert map." : "Report rejected. The reporter can see your note." });
                  }}
                />
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={pageSize} total={total} hasPrev={hasPrev} hasNext={hasNext} onPageChange={(next) => go({ page: next })} itemLabel="reports" disabled={loading} />
        </>
      )}
    </div>
  );
}
