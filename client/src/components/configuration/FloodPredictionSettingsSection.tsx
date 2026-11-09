import { useState } from "react";
import { useFloodPredictions, useFloodPredictionSettings } from "../../hooks/useFloodPrediction";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../transport/api-error";
import { daysLabel, DEFAULT_OUTLOOK_DAYS } from "../../types/flood-prediction.types";
import { formatDateTime } from "../../utils/formatDate";
import { OutlookDaysPicker } from "../floods/OutlookDaysPicker";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { ErrorState } from "../shared/ErrorState";
import { LoadingSpinner } from "../shared/LoadingSpinner";

export function FloodPredictionSettingsSection() {
  const { showToast } = useToast();
  const { settings, loading, error, refetch, update } = useFloodPredictionSettings();
  const { generatedAt, refresh } = useFloodPredictions("NGA", DEFAULT_OUTLOOK_DAYS, true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleTogglePublic = async (checked: boolean) => {
    setSaving(true);
    try {
      await update({ showPublicFloodOutlook: checked });
      showToast({
        type: "success",
        message: checked
          ? "Public flood outlook enabled on the home page."
          : "Public flood outlook hidden from the home page.",
      });
    } catch (err) {
      showToast({ type: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleDaysChange = async (days: number) => {
    setSaving(true);
    try {
      await update({ publicOutlookDays: days });
      showToast({ type: "success", message: `The public flood outlook now looks ${daysLabel(days)} ahead.` });
    } catch (err) {
      showToast({ type: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      showToast({ type: "success", message: "All LGA flood forecasts refreshed." });
    } catch (err) {
      showToast({ type: "error", message: errorMessage(err) });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="card section-gap" aria-labelledby="flood-prediction-settings-title" data-cy="flood-prediction-settings">
      <div className="card__header">
        <div>
          <h2 id="flood-prediction-settings-title" className="card__title">
            Flood forecast &amp; public outlook
          </h2>
          <p className="card__subtitle">
            Control whether the modelled flood outlook appears on the public landing page, and refresh forecasts across all LGAs.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={refreshing}
          loadingLabel="Refreshing…"
          onClick={handleRefresh}
          data-cy="refresh-all-predictions"
        >
          Refresh forecasts now
        </Button>
      </div>

      <div className="card__body">
        {loading && !settings ? (
          <LoadingSpinner message="Loading forecast settings…" />
        ) : error && !settings ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : settings ? (
          <div className="stack">
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                cursor: saving ? "not-allowed" : "pointer",
              }}
              data-cy="toggle-public-flood-outlook"
            >
              <input
                type="checkbox"
                checked={settings.showPublicFloodOutlook}
                disabled={saving}
                onChange={(e) => void handleTogglePublic(e.target.checked)}
                style={{ marginTop: "0.25rem" }}
              />
              <span>
                <strong style={{ display: "block" }}>
                  Show modelled flood outlook on the public home page{" "}
                  <Badge tone={settings.showPublicFloodOutlook ? "warning" : "neutral"}>
                    {settings.showPublicFloodOutlook ? "Public" : "Internal only"}
                  </Badge>
                </strong>
                <span className="muted" style={{ fontSize: "0.88rem" }}>
                  When enabled, visitors to the home page see a clearly badged &ldquo;Modelled Flood Outlook&rdquo; section alongside official alerts in force.
                </span>
              </span>
            </label>

            <div style={{ maxWidth: "32rem" }}>
              <OutlookDaysPicker
                label="Public outlook: days ahead"
                value={settings.publicOutlookDays}
                disabled={saving}
                onChange={(days) => void handleDaysChange(days)}
                dataCy="public-outlook-days"
              />
            </div>

            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {generatedAt ? `Forecasts last computed ${formatDateTime(generatedAt)}.` : "Forecasts compute automatically on first request."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
