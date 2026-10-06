import type { DataSource } from "../../types/data-source.types";
import { formatDate } from "../../utils/formatDate";
import { Icon } from "../shared/Icon";

interface SourceBadgeProps {
  source: DataSource | null;
  /** Inline: one line for popups. Full: a card with the licence, download date and notes. */
  variant?: "inline" | "full";
}

/**
 * Where a shape came from. Every boundary on the platform is shown with its source, so nobody
 * mistakes a placeholder dataset (e.g. GRID3's "Operational Placeholder" wards) for an
 * authoritative one.
 */
export function SourceBadge({ source, variant = "inline" }: SourceBadgeProps) {
  if (!source) {
    return (
      <span className="source-badge source-badge--missing" data-cy="source-badge">
        Source: not available
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span className="source-badge" data-cy="source-badge" title={`${source.datasetName} · ${source.license}`}>
        <Icon name="database" size={13} />
        Source:{" "}
        <a href={source.url} target="_blank" rel="noreferrer">
          {source.provider}
        </a>
      </span>
    );
  }

  return (
    <div className="source-card" data-cy="source-badge">
      <p className="source-card__label">Source</p>
      <p className="source-card__provider">
        <a href={source.url} target="_blank" rel="noreferrer">
          {source.provider}
          <Icon name="externalLink" size={13} />
        </a>
      </p>
      <p className="source-card__meta">{source.datasetName}</p>
      <p className="source-card__meta">
        Licence {source.license} · downloaded {formatDate(source.downloadedOn)}
      </p>
      {source.notes && <p className="source-card__note">{source.notes}</p>}
    </div>
  );
}
