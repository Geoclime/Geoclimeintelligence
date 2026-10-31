import { lazy, Suspense, useId, useState, type ReactNode } from "react";
import { useReportMedia } from "../../hooks/useReportMedia";
import type { FloodReport, FloodReportMediaRef, ReportStatus } from "../../types/flood-report.types";
import { formatCoordinates } from "../../utils/formatCoordinates";
import { formatDateTime } from "../../utils/formatDate";
import { WATER_DEPTH_INFO } from "../../utils/water-depth";
import { MapErrorBoundary } from "../map/MapErrorBoundary";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { Spinner } from "../shared/Spinner";
import { TextAreaField } from "../shared/TextAreaField";
import "./reports.css";

// The map (Mapbox is large) is only downloaded when someone asks to see a report on it.
const ReportLocationMap = lazy(() => import("./ReportLocationMap").then((module) => ({ default: module.ReportLocationMap })));

const STATUS: Record<ReportStatus, { label: string; tone: "warning" | "success" | "neutral" }> = {
  pending: { label: "Waiting for review", tone: "warning" },
  published: { label: "Published", tone: "success" },
  rejected: { label: "Not published", tone: "neutral" },
};

/** One file, shown as what it is: a photo, a recording, a video or a document link. */
function MediaView({ kind, url, index }: { kind: FloodReportMediaRef["kind"]; url: string; index: number }) {
  switch (kind) {
    case "photo":
      return (
        <a href={url} target="_blank" rel="noreferrer" className="report-card__media">
          <img src={url} alt={`Photo ${index + 1} sent with the report`} loading="lazy" />
        </a>
      );
    case "audio":
      return (
        <audio controls preload="none" src={url} className="report-card__audio">
          Your browser can't play this recording.
        </audio>
      );
    case "video":
      return (
        <video controls playsInline preload="metadata" src={url} className="report-card__video">
          Your browser can't play this video.
        </video>
      );
    case "file":
      return (
        <a href={url} target="_blank" rel="noreferrer" className="report-card__document">
          <Icon name="file" size={16} />
          Document {index + 1} (PDF)
        </a>
      );
  }
}

/** A file kept in the database: fetched through the signed-in API, then shown from memory. */
function StoredMedia({ reportId, media, index }: { reportId: string; media: FloodReportMediaRef; index: number }) {
  const { url, loading, failed } = useReportMedia(reportId, media.id);
  if (loading) return <span className="report-card__media report-card__media--loading"><Spinner size="sm" label="Loading media" /></span>;
  if (failed || !url) return <span className="report-card__media report-card__media--failed">Couldn't load this file</span>;
  return <MediaView kind={media.kind} url={url} index={index} />;
}

/** A Cloudinary file comes with a signed link and is shown straight from it; others go through the API. */
function Media({ reportId, media, index }: { reportId: string; media: FloodReportMediaRef; index: number }) {
  return media.url ? <MediaView kind={media.kind} url={media.url} index={index} /> : <StoredMedia reportId={reportId} media={media} index={index} />;
}

interface ReportCardProps {
  report: FloodReport;
  /** Reviewers get Publish and Reject on a pending report. Rejects with an ApiError. */
  onReview?: (decision: "publish" | "reject", note?: string) => Promise<unknown>;
  /** Shows Edit: for a report its sender may still change (not published). */
  onEdit?: () => void;
  /** Shows Delete. */
  onDelete?: () => void;
  footer?: ReactNode;
}

/** One flood report: depth, place, what was seen, media, and where it stands in review. */
export function ReportCard({ report, onReview, onEdit, onDelete, footer }: ReportCardProps) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"publish" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const mapId = useId();
  const depth = WATER_DEPTH_INFO[report.waterDepth];
  const status = STATUS[report.status];

  const decide = async (decision: "publish" | "reject") => {
    if (!onReview) return;
    setBusy(decision);
    setError(null);
    try {
      await onReview(decision, decision === "reject" ? note.trim() : undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The review couldn't be saved.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={`report-card report-card--${report.waterDepth}`} data-cy="report-card">
      <header className="report-card__header">
        <span className="report-card__depth">
          {depth.label} <span className="report-card__metres">({depth.metres})</span>
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>
      <h3 className="report-card__place">{report.locationName}</h3>
      <div className="report-card__where-row">
        <p className="report-card__where">
          {[report.ward?.unitName, report.lga && `${report.lga.unitName} LGA`].filter(Boolean).join(", ") || "Outside the mapped areas"} ·{" "}
          <span className="mono">{formatCoordinates(report.point)}</span>
        </p>
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="map" size={14} />}
          onClick={() => setMapOpen((open) => !open)}
          aria-expanded={mapOpen}
          aria-controls={mapId}
          data-cy="report-view-map"
        >
          {mapOpen ? "Hide map" : "View on map"}
        </Button>
      </div>
      {mapOpen && (
        <div id={mapId}>
          <MapErrorBoundary fallback={<p className="field__error">The map couldn't load. Check your connection and try again.</p>}>
            <Suspense
              fallback={
                <div className="report-map__loading">
                  <Spinner label="Loading map" />
                </div>
              }
            >
              <ReportLocationMap point={report.point} placeName={report.locationName} lgaId={report.lga?.id} />
            </Suspense>
          </MapErrorBoundary>
        </div>
      )}
      <p className="report-card__description">{report.description}</p>
      {report.media.length > 0 && (
        <div className="report-card__media-row">
          {report.media.map((media, index) => (
            <Media key={media.id} reportId={report.id} media={media} index={index} />
          ))}
        </div>
      )}
      <p className="report-card__meta">
        Sent {formatDateTime(report.createdAt)}
        {report.reporter && ` by ${report.reporter.name ?? "an unnamed account"}${report.reporter.organisation ? ` (${report.reporter.organisation})` : ""}`}
        {report.reviewedAt && ` · reviewed ${formatDateTime(report.reviewedAt)}`}
      </p>
      {report.reviewNote && <p className="report-card__note">Reviewer's note: {report.reviewNote}</p>}

      {(onEdit || onDelete) && (
        <div className="report-card__manage">
          {onEdit && (
            <Button variant="ghost" size="sm" icon={<Icon name="edit" size={14} />} onClick={onEdit} data-cy="edit-report">
              Edit
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={onDelete} data-cy="delete-report">
              Delete
            </Button>
          )}
        </div>
      )}

      {onReview && report.status === "pending" && (
        <div className="report-card__review">
          {rejecting && (
            <TextAreaField label="Why isn't it being published?" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} data-cy="reject-note" />
          )}
          {error && <p className="field__error">{error}</p>}
          <div className="report-card__review-actions">
            {rejecting ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={busy !== null}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={() => decide("reject")} loading={busy === "reject"} disabled={note.trim().length === 0} data-cy="confirm-reject">
                  Reject report
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={() => setRejecting(true)} disabled={busy !== null} data-cy="reject-report">
                  Reject
                </Button>
                <Button size="sm" onClick={() => decide("publish")} loading={busy === "publish"} data-cy="publish-report">
                  Publish
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {footer}
    </article>
  );
}
