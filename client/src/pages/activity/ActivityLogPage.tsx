import { useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "../../components/shared/Button";
import { EmptyState } from "../../components/shared/EmptyState";
import { ErrorState } from "../../components/shared/ErrorState";
import { Icon } from "../../components/shared/Icon";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { Pagination } from "../../components/shared/Pagination";
import { SelectField } from "../../components/shared/SelectField";
import { TextField } from "../../components/shared/TextField";
import { useAuditExport, useAuditLog } from "../../hooks/useAuditLog";
import { useDebounce } from "../../hooks/useDebounce";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useRoles } from "../../hooks/useRoles";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../transport/api-error";
import { AUDIT_ACTIONS, type AuditAction, type AuditFilters } from "../../types/audit.types";
import { formatDateTime } from "../../utils/formatDate";
import { parsePageParam } from "../../utils/pagination";
import { roleLabel } from "../../utils/roles";
import { saveBlob } from "../../utils/save-blob";
import "../../components/roles/roles.css";

const PAGE_SIZE = 25;

/** Each action in the words of the log. */
const ACTION_LABEL: Record<AuditAction, string> = {
  "flood.recorded": "Flood recorded",
  "flood.receded": "Flood called over",
  "flood.reopened": "Flood put back as going",
  "flood.deleted": "Flood deleted",
  "drain.recorded": "Drain recorded",
  "drain.inspected": "Drain inspected",
  "drain.deleted": "Drain deleted",
  "drain.imported": "Drainage plan imported",
  "place.saved": "Place saved",
  "place.updated": "Place changed",
  "place.deleted": "Place deleted",
  "household.saved": "Household added",
  "household.deleted": "Household removed",
  "photo.added": "Photo added",
  "photo.deleted": "Photo deleted",
  "role.created": "Role created",
  "role.updated": "Role changed",
  "role.deleted": "Role deleted",
  "user.access_changed": "Access changed",
};

/** The "What" filter's groups, by the part of the action before the dot, in the order they are listed. */
const ACTION_GROUPS: Array<{ label: string; kinds: string[] }> = [
  { label: "Floods", kinds: ["flood"] },
  { label: "Drains", kinds: ["drain"] },
  { label: "Places", kinds: ["place"] },
  { label: "Households and photos", kinds: ["household", "photo"] },
  { label: "Roles and access", kinds: ["role", "user"] },
];

const actionsOf = (kinds: string[]) => AUDIT_ACTIONS.filter((action) => kinds.includes(action.split(".")[0]));

const isDate =(value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);

/**
 * The activity log: who recorded, inspected, called over, changed or deleted what on the record of the
 * ground, and who changed roles and access, newest first. It can't be edited (the database refuses), only
 * read and exported. Needs the audit.view permission. Filters live in the address, so a view can be shared.
 */
export function ActivityLogPage() {
  useDocumentTitle("Activity log");
  const { showToast } = useToast();
  const { roles } = useRoles();
  const [params, setParams] = useSearchParams();
  const page = parsePageParam(params.get("page"));
  const [text, setText] = useState(params.get("q") ?? "");
  const q = useDebounce(text.trim(), 300);
  const actionParam = params.get("action");
  const filters: AuditFilters = {
    action: AUDIT_ACTIONS.includes(actionParam as AuditAction) ? (actionParam as AuditAction) : undefined,
    from: isDate(params.get("from")),
    to: isDate(params.get("to")),
    q: q || undefined,
  };
  const [exporting, setExporting] = useState(false);

  const { events, total, loading, error, refetch } = useAuditLog(filters, page, PAGE_SIZE);
  const downloadCsv = useAuditExport();

  const setFilter = (name: string, value: string) =>
    setParams((next) => {
      if (value) next.set(name, value);
      else next.delete(name);
      next.delete("page");
      return next;
    });

  const exportCsv = async () => {
    setExporting(true);
    try {
      saveBlob(await downloadCsv(filters), `geoclime-activity-log-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (failure) {
      showToast({ type: "error", message: errorMessage(failure) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page" data-cy="activity-log-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Oversight</p>
          <h1 className="page__title">Activity log</h1>
          <p className="page__lead">
            Every flood and drain recorded, inspected, called over or deleted, every place and photo, and every change to roles and access: who did it,
            when, and where. Nothing here can be changed or removed.
          </p>
        </div>
        <Button variant="secondary" icon={<Icon name="download" size={16} />} loading={exporting} loadingLabel="Preparing…" onClick={() => void exportCsv()} data-cy="export-activity">
          Export CSV
        </Button>
      </header>

      <section className="card activity-card" aria-busy={loading} aria-label="Activity">
        <div className="activity-filters">
          <TextField label="Search" placeholder="Name, email or what happened" value={text} onChange={(event) => setText(event.target.value)} data-cy="activity-search" />
          <SelectField label="What" value={filters.action ?? ""} onChange={(event) => setFilter("action", event.target.value)} data-cy="activity-action">
            <option value="">Everything</option>
            {ACTION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {actionsOf(group.kinds).map((action) => (
                  <option key={action} value={action}>
                    {ACTION_LABEL[action]}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>
          <TextField label="From" type="date" value={filters.from ?? ""} onChange={(event) => setFilter("from", event.target.value)} data-cy="activity-from" />
          <TextField label="To" type="date" value={filters.to ?? ""} onChange={(event) => setFilter("to", event.target.value)} data-cy="activity-to" />
        </div>

        {error && <ErrorState message={error} onRetry={refetch} />}
        {loading && !error && <LoadingSpinner message="Loading the log…" />}
        {!loading && !error && events.length === 0 && <EmptyState icon="history" title="Nothing logged here" message="No activity matches these filters yet." />}
        {events.length > 0 && (
          <ol className="activity-list" data-cy="activity-list">
            {events.map((event) => (
              <li key={event.id} className="activity-list__item">
                <span className="activity-list__when">{formatDateTime(event.occurredAt)}</span>
                <span>
                  <strong>{ACTION_LABEL[event.action] ?? event.action}:</strong> {event.summary}
                  <span className="activity-list__who">
                    {" "}
                    · {event.actorName ?? event.actorEmail ?? "an account since deleted"} ({roleLabel(event.actorRole, roles)})
                    {event.wardName || event.lgaName ? ` · ${[event.wardName, event.lgaName].filter(Boolean).join(", ")}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {total > PAGE_SIZE && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            hasPrev={page > 1}
            hasNext={page * PAGE_SIZE < total}
            onPageChange={(next) =>
              setParams((current) => {
                current.set("page", String(next));
                return current;
              })
            }
            itemLabel="entries"
          />
        )}
      </section>
    </div>
  );
}
