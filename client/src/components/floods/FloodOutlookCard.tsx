import { useState } from "react";
import { Link } from "react-router";
import { useAiStatus } from "../../hooks/useAi";
import { useAuth } from "../../hooks/useAuth";
import { useAreaFloodOutlook } from "../../hooks/useFloodPrediction";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../transport/api-error";
import {
  daysLabel,
  DEFAULT_OUTLOOK_DAYS,
  LIVE_FORECAST_DAYS,
  PREDICTION_RISK_INFO,
} from "../../types/flood-prediction.types";
import { formatDate } from "../../utils/formatDate";
import { can } from "../../utils/permissions";
import { hasAnyRole } from "../../utils/roles";
import { RainfallChart, type RainfallColumn } from "../rainfall/RainfallChart";
import { Badge } from "../shared/Badge";
import { Button, buttonClassName } from "../shared/Button";
import { ErrorState } from "../shared/ErrorState";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { OutlookDaysPicker } from "./OutlookDaysPicker";
import "./flood-outlook.css";

interface FloodOutlookCardProps {
  areaId: string;
  areaName: string;
}

const AI_ROLES = ["administrator", "government_official", "coordinator", "first_responder", "researcher"] as const;

export function FloodOutlookCard({ areaId, areaName }: FloodOutlookCardProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { status: aiStatus } = useAiStatus();
  const [days, setDays] = useState(DEFAULT_OUTLOOK_DAYS);
  const { outlook, loading, error, refetch, generateAi, generatingAi } = useAreaFloodOutlook(areaId, days);

  const canUseAi = Boolean(user && hasAnyRole(user.role, [...AI_ROLES]));
  const canIssueAlert = can(user, "alerts.issue");

  if (loading && !outlook) {
    return (
      <section className="card card__body" data-cy="flood-outlook-card">
        <LoadingSpinner message="Computing flood forecast…" />
      </section>
    );
  }

  if (error && !outlook) {
    return (
      <section className="card card__body" data-cy="flood-outlook-card">
        <ErrorState message={error} onRetry={refetch} />
      </section>
    );
  }

  if (!outlook) return null;

  const prediction = outlook.outlook;
  // While a new number of days loads, the last answer stays on screen; label it by what it really covers.
  const shownDays = prediction.horizonDays;
  const riskInfo = PREDICTION_RISK_INFO[prediction.riskLevel];

  const dailyColumns: RainfallColumn[] = prediction.dailyForecast.map((day) => ({
    key: day.date,
    label: day.date.slice(5),
    valueMm: day.rainfallMm,
    averageMm: null,
    title: `${formatDate(day.date)}: ${day.rainfallMm} mm${
      day.probabilityPercent !== null ? ` (${day.probabilityPercent}% chance)` : ""
    }`,
  }));

  const handleGenerateAi = async () => {
    try {
      await generateAi();
      showToast({ type: "success", message: "AI flood outlook analysis generated." });
    } catch (err) {
      showToast({ type: "error", message: errorMessage(err) });
    }
  };

  return (
    <section
      className="card flood-outlook-card"
      aria-labelledby={`flood-outlook-${areaId}`}
      aria-busy={loading}
      data-cy="flood-outlook-card"
    >
      <div className="card__header">
        <div>
          <h2 id={`flood-outlook-${areaId}`} className="card__title">
            Flood forecast &amp; outlook
          </h2>
          <p className="card__subtitle">
            Modelled {shownDays}-day weather &amp; river discharge combined with terrain susceptibility and drainage records for {areaName}.
          </p>
        </div>
        <OutlookDaysPicker label="Days ahead" value={days} onChange={setDays} dataCy="outlook-days-picker" />
      </div>

      <div className="card__body">
        <div
          className="flood-outlook-card__summary-bar"
          style={{ "--outlook-accent": riskInfo.color } as React.CSSProperties}
          data-cy="flood-outlook-summary"
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <Badge tone={riskInfo.badgeTone}>{riskInfo.label}</Badge>
              <Badge tone="neutral">Modelled</Badge>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {riskInfo.description} ({formatDate(prediction.validFrom)} – {formatDate(prediction.validTo)})
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="flood-outlook-card__score" data-cy="flood-outlook-score">
              {prediction.likelihoodScore}/100
            </div>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              Likelihood score
            </span>
          </div>
        </div>

        <div className="stat-grid">
          <div className="card stat">
            <span className="stat__label">
              {shownDays <= LIVE_FORECAST_DAYS ? `${shownDays}-day forecast rain` : `Expected rain over ${shownDays} days`}
            </span>
            <span className="stat__value">{prediction.forecastRainfallMm} mm</span>
            {prediction.peakDayDate && (
              <span className="rainfall-card__delta">
                Peak: {prediction.peakDailyRainfallMm} mm on {formatDate(prediction.peakDayDate)}
              </span>
            )}
          </div>
          <div className="card stat">
            <span className="stat__label">River discharge</span>
            <span className="stat__value">
              {prediction.riverDischargeM3s !== null ? `${prediction.riverDischargeM3s} m³/s` : "Climatology"}
            </span>
            <span className="rainfall-card__delta">
              {prediction.riverDischargeRatio !== null
                ? `${Math.round(prediction.riverDischargeRatio * 100)}% of seasonal mean`
                : "No live river gauge anomaly"}
            </span>
          </div>
          <div className="card stat">
            <span className="stat__label">Local vulnerability</span>
            <span className="stat__value">
              {prediction.drivers.metrics.percentHighOrVeryHighRisk !== null
                ? `${prediction.drivers.metrics.percentHighOrVeryHighRisk}% high risk`
                : "Terrain baseline"}
            </span>
            <span className="rainfall-card__delta">
              {prediction.drivers.metrics.blockedDrainsCount} of {prediction.drivers.metrics.totalDrainsCount} drains need attention
            </span>
          </div>
        </div>

        {dailyColumns.length > 0 && (
          <div className="section-gap">
            <h3 className="rainfall-card__section-title">Daily forecast rainfall (next {daysLabel(dailyColumns.length)})</h3>
            <RainfallChart
              columns={dailyColumns}
              valueLabel="Forecast rainfall"
              averageLabel={null}
              ariaLabel={`${dailyColumns.length}-day daily rainfall forecast for ${areaName}`}
            />
            {shownDays > dailyColumns.length && (
              <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
                The weather forecast stops after {daysLabel(dailyColumns.length)}. The other {shownDays - dailyColumns.length} of the {shownDays}{" "}
                days assume the 10-year average rain for the month, so they are not shown here.
              </p>
            )}
          </div>
        )}

        <div className="section-gap">
          <h3 className="rainfall-card__section-title">Contributing risk factors</h3>
          <ul className="flood-outlook-card__drivers" data-cy="flood-outlook-factors">
            {prediction.drivers.factors.map((factor, index) => (
              <li key={index}>{factor}</li>
            ))}
          </ul>
        </div>

        <div className="flood-outlook-card__ai-box" data-cy="flood-outlook-ai">
          <div className="flood-outlook-card__ai-header">
            <strong>
              {prediction.aiSummary ? "AI-synthesized outlook & preparedness" : "AI narrative synthesis"}
            </strong>
            {canUseAi && aiStatus?.available && (
              <Button
                variant="secondary"
                size="sm"
                loading={generatingAi}
                loadingLabel="Synthesizing…"
                onClick={handleGenerateAi}
                data-cy="generate-ai-outlook"
              >
                {prediction.aiSummary ? "Refresh AI analysis" : "Generate AI analysis"}
              </Button>
            )}
          </div>

          {prediction.aiSummary ? (
            <>
              <p style={{ margin: "0.35rem 0" }}>{prediction.aiSummary}</p>
              {prediction.aiPreparedness.length > 0 && (
                <>
                  <p className="muted" style={{ margin: "0.5rem 0 0.25rem", fontWeight: 600 }}>
                    Recommended preparedness actions:
                  </p>
                  <ul className="flood-outlook-card__actions-list">
                    {prediction.aiPreparedness.map((action, idx) => (
                      <li key={idx}>{action}</li>
                    ))}
                  </ul>
                </>
              )}
              {prediction.aiCaveats && (
                <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                  Note: {prediction.aiCaveats}
                </p>
              )}
              {prediction.aiModel && (
                <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.78rem" }}>
                  Synthesized by {prediction.aiProvider} ({prediction.aiModel}) · Modelled estimate, not an official alert.
                </p>
              )}
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {aiStatus?.available
                ? "Click 'Generate AI analysis' to synthesize forecast rain, river discharge, and local drainage records into plain-language preparedness steps."
                : "Deterministic multi-factor forecast is active. Configure an AI provider in Configuration to enable plain-language AI synthesis."}
            </p>
          )}
        </div>

        <div className="flood-outlook-card__footer">
          <span className="muted" style={{ fontSize: "0.82rem" }}>
            Source: {prediction.weatherProvider} · Modelled forecast (distinct from observed ground records).
          </span>
          {canIssueAlert && prediction.riskLevel !== "normal" && (
            <Link
              to={`/alerts?draftArea=${encodeURIComponent(areaId)}`}
              className={buttonClassName({ variant: "secondary", size: "sm" })}
              data-cy="outlook-draft-alert-link"
            >
              Draft alert for {areaName}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
