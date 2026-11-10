import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertCard } from "../../components/alerts/AlertCard";
import { AlertMap } from "../../components/alerts/AlertMap";
import { toAlertBody, toAlertUpdate } from "../../components/alerts/alert-form.schema";
import { AlertFormDialog } from "../../components/alerts/AlertFormDialog";
import { Badge } from "../../components/shared/Badge";
import { Button, buttonClassName } from "../../components/shared/Button";
import { Callout } from "../../components/shared/Callout";
import { EmptyState } from "../../components/shared/EmptyState";
import { ErrorState } from "../../components/shared/ErrorState";
import { Icon } from "../../components/shared/Icon";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { Modal } from "../../components/shared/Modal";
import { useAlerts } from "../../hooks/useAlerts";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useFloodPredictions } from "../../hooks/useFloodPrediction";
import { usePublicAlertMap } from "../../hooks/usePublicAlertMap";
import { usePublicOutline } from "../../hooks/usePublicOutline";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../transport/api-error";
import type { FloodAlert } from "../../types/alert.types";
import { DEFAULT_OUTLOOK_DAYS, PREDICTION_RISK_INFO } from "../../types/flood-prediction.types";
import { severityByLga, SEVERITY_INFO, sortAlerts } from "../../utils/alert-severity";
import { can } from "../../utils/permissions";
import "../../components/alerts/alerts.css";
import "../../components/reports/reports.css";

/** How many flagged LGAs the early-warning banner lists before "+N more". */
const FLAGGED_PREVIEW = 8;

/**
 * The national alert map for signed-in users: LGAs coloured by the alerts in force, published
 * flood reports, and the alerts themselves (recent ones too). Officials and administrators issue,
 * edit, end and delete alerts here: an alert still in force can be edited or ended, and any alert
 * can be deleted, which removes it for good.
 */
export function AlertsPage() {
  useDocumentTitle("Alerts");
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { alerts, loading, error, refetch, issue, update, remove, end } = useAlerts();
  const { outline, loading: outlineLoading } = usePublicOutline();
  const { alertMap, refetch: refetchMap } = usePublicAlertMap();
  const [issuing, setIssuing] = useState(0);
  const [draftAreaIds, setDraftAreaIds] = useState<string[]>([]);
  const [ending, setEnding] = useState<FloodAlert | null>(null);
  const [endBusy, setEndBusy] = useState(false);
  const [editing, setEditing] = useState<FloodAlert | null>(null);
  const [deleting, setDeleting] = useState<FloodAlert | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showAllFlagged, setShowAllFlagged] = useState(false);
  // Whether the edit being saved was sent to people, for the message afterwards.
  const tellPeople = useRef(false);
  const canIssue = can(user, "alerts.issue");
  const canReview = can(user, "reports.review");

  const { predictions } = useFloodPredictions("NGA", DEFAULT_OUTLOOK_DAYS, canIssue);

  // Arriving from an LGA profile with ?draftArea=<lgaId> opens the issue form for that area. The request
  // is noticed while rendering (an effect would render twice), and the parameter is then taken out of the
  // address so a reload doesn't open the form again. `openedFor` lets the same area be asked for again later.
  const draftArea = searchParams.get("draftArea");
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (draftArea === null && openedFor !== null) {
    setOpenedFor(null);
  } else if (canIssue && draftArea && draftArea !== openedFor) {
    setOpenedFor(draftArea);
    setDraftAreaIds([draftArea]);
    setIssuing((n) => n + 1);
  }
  useEffect(() => {
    if (!canIssue || !searchParams.get("draftArea")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("draftArea");
    setSearchParams(next, { replace: true });
  }, [canIssue, searchParams, setSearchParams]);

  const sorted = useMemo(() => sortAlerts(alerts), [alerts]);
  const inForce = sorted.filter((a) => a.status === "active" || a.status === "scheduled");
  const past = sorted.filter((a) => a.status === "expired" || a.status === "ended");
  const severities = useMemo(() => severityByLga(alerts), [alerts]);

  // LGAs predicted at watch/warning/severe in the next 7 days that do not yet have an active alert in force
  const flaggedPredictions = useMemo(
    () => predictions.filter((p) => p.riskLevel !== "normal" && !(p.adminUnit.id in severities)),
    [predictions, severities],
  );

  const openIssueBlank = () => {
    setDraftAreaIds([]);
    setIssuing((n) => n + 1);
  };

  const openIssueForFlagged = (areaIds: string[]) => {
    setDraftAreaIds(areaIds);
    setIssuing((n) => n + 1);
  };

  const confirmEnd = async () => {
    if (!ending) return;
    setEndBusy(true);
    try {
      await end(ending.id);
      showToast({ type: "info", message: `“${ending.title}” has ended.` });
      refetchMap();
      setEnding(null);
    } catch (failure) {
      showToast({ type: "error", message: errorMessage(failure) });
    } finally {
      setEndBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await remove(deleting.id);
      showToast({ type: "info", message: `“${deleting.title}” was deleted.` });
      refetchMap();
      setDeleting(null);
    } catch (failure) {
      showToast({ type: "error", message: errorMessage(failure) });
    } finally {
      setDeleteBusy(false);
    }
  };

  /** Edit and End are for an alert still in force or scheduled; Delete is for any. */
  const alertButtons = (alert: FloodAlert) => {
    if (!canIssue) return undefined;
    const open = alert.status === "active" || alert.status === "scheduled";
    return (
      <>
        {open && (
          <Button variant="ghost" size="sm" icon={<Icon name="edit" size={14} />} onClick={() => setEditing(alert)} data-cy="edit-alert">
            Edit
          </Button>
        )}
        {open && (
          <Button variant="ghost" size="sm" onClick={() => setEnding(alert)} data-cy="end-alert">
            End alert
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setDeleting(alert)} data-cy="delete-alert">
          Delete
        </Button>
      </>
    );
  };

  return (
    <div className="page" data-cy="alerts-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Flooding</p>
          <h1 className="page__title">Alerts</h1>
          <p className="page__lead">Flood alerts in force, by LGA, with the reports coordinators have published. The map refreshes every 30 seconds.</p>
        </div>
        <div className="page__actions">
          <Link to="/report" className={buttonClassName({ variant: "secondary" })}>
            <Icon name="edit" size={16} />
            Report flooding
          </Link>
          {canReview && (
            <Link to="/reports/review" className={buttonClassName({ variant: "secondary" })}>
              <Icon name="inbox" size={16} />
              Review reports
            </Link>
          )}
          {canIssue && (
            <Button icon={<Icon name="alert" size={16} />} onClick={openIssueBlank} data-cy="open-issue-alert">
              Issue an alert
            </Button>
          )}
        </div>
      </header>

      {canIssue && flaggedPredictions.length > 0 && (
        <div className="section-gap" data-cy="early-warning-banner">
          <Callout tone="warning">
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
              <div>
                <strong>Early-warning forecast (Modelled, next 7 days):</strong>{" "}
                {flaggedPredictions.length} {flaggedPredictions.length === 1 ? "LGA has" : "LGAs have"} elevated predicted flood risk without an active alert in force:
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.4rem" }}>
                  {(showAllFlagged ? flaggedPredictions : flaggedPredictions.slice(0, FLAGGED_PREVIEW)).map((pred) => (
                    <Badge key={pred.adminUnit.id} tone={PREDICTION_RISK_INFO[pred.riskLevel].badgeTone}>
                      {pred.adminUnit.unitName}: {PREDICTION_RISK_INFO[pred.riskLevel].label} ({pred.forecastRainfallMm} mm)
                    </Badge>
                  ))}
                  {flaggedPredictions.length > FLAGGED_PREVIEW && (
                    <button
                      type="button"
                      className="badge badge--neutral badge--button"
                      aria-expanded={showAllFlagged}
                      onClick={() => setShowAllFlagged((open) => !open)}
                      data-cy="toggle-flagged-lgas"
                    >
                      {showAllFlagged ? "Show fewer" : `+${flaggedPredictions.length - FLAGGED_PREVIEW} more`}
                    </button>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openIssueForFlagged(flaggedPredictions.slice(0, 10).map((p) => p.adminUnit.id))}
                data-cy="draft-flagged-lgas-alert"
              >
                Draft alert for flagged LGAs
              </Button>
            </div>
          </Callout>
        </div>
      )}

      <div className="flood-page__grid">
        <AlertMap
          outline={outline}
          loading={outlineLoading}
          severities={severities}
          reports={alertMap?.reports ?? []}
          reportDays={alertMap?.reportDays ?? 7}
          floods={alertMap?.floods ?? []}
          floodDays={alertMap?.floodDays ?? 3}
        />
        <section aria-labelledby="in-force-title" className="flood-page__side">
          <h2 id="in-force-title" className="flood-card__title">
            In force
          </h2>
          {loading && alerts.length === 0 ? (
            <LoadingSpinner message="Loading alerts…" />
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : inForce.length === 0 ? (
            <EmptyState icon="check" title="No flood alerts in force" message="Alerts issued by officials appear here and on the public home page." />
          ) : (
            <ul className="flood-page__list">
              {inForce.map((alert) => (
                <li key={alert.id}>
                  <AlertCard alert={alert} action={alertButtons(alert)} />
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <details className="alerts-page__past">
              <summary>Ended in the last 30 days ({past.length})</summary>
              <ul className="flood-page__list">
                {past.map((alert) => (
                  <li key={alert.id}>
                    <AlertCard alert={alert} action={alertButtons(alert)} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      {canIssue && issuing > 0 && (
        <AlertFormDialog
          key={issuing}
          open
          initialAreaIds={draftAreaIds}
          onClose={() => setIssuing(0)}
          onSubmit={(values) => issue(toAlertBody(values))}
          onDone={(alert) => {
            setIssuing(0);
            refetchMap();
            showToast({ type: "success", message: `${SEVERITY_INFO[alert.severity].label} issued. It is public now.` });
          }}
        />
      )}

      {canIssue && editing && (
        <AlertFormDialog
          key={editing.id}
          open
          alert={editing}
          onClose={() => setEditing(null)}
          onSubmit={(values) => {
            tellPeople.current = values.notify;
            return update(editing.id, toAlertUpdate(values));
          }}
          onDone={() => {
            setEditing(null);
            refetchMap();
            showToast({ type: "success", message: tellPeople.current ? "Alert updated. The people it covers were notified." : "Alert updated. The changes are public now." });
          }}
        />
      )}

      <Modal
        open={deleting !== null}
        title="Delete this alert?"
        description={
          deleting ? (
            <>
              “{deleting.title}” will be removed for good: from the map, the home page and every list. People who were already notified keep their message. If the danger has
              passed, ending the alert keeps a record of it.
            </>
          ) : undefined
        }
        onClose={() => setDeleting(null)}
        dismissible={!deleteBusy}
        dataCy="delete-alert-dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleteBusy} loadingLabel="Deleting…" data-cy="confirm-delete-alert">
              Delete alert
            </Button>
          </>
        }
      />

      <Modal
        open={ending !== null}
        title="End this alert?"
        description={ending ? <>“{ending.title}” will stop showing as in force, on this page and publicly.</> : undefined}
        onClose={() => setEnding(null)}
        dismissible={!endBusy}
        dataCy="end-alert-dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEnding(null)} disabled={endBusy}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmEnd} loading={endBusy} loadingLabel="Ending…" data-cy="confirm-end-alert">
              End alert
            </Button>
          </>
        }
      />
    </div>
  );
}
