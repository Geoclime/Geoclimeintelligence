import { useState } from "react";
import type { useFieldSurvey } from "../../hooks/useFieldSurvey";
import type { SurveyAbilities } from "../../utils/permissions";
import { DrainageImportDialog } from "./DrainageImportDialog";
import { DrainageKindGuide } from "./DrainageKindGuide";
import type { SurveyTarget } from "../../types/field-survey.types";
import { TARGET_INFO } from "../../utils/field-survey";
import { formatDistance } from "../../utils/geo-distance";
import { formatArea, gpsQuality } from "../../utils/survey-geometry";
import { Button } from "../shared/Button";
import { Icon, type IconName } from "../shared/Icon";
import { Modal } from "../shared/Modal";
import "./field-survey.css";

type Survey = ReturnType<typeof useFieldSurvey>;

// One short line each: what the long definitions say is in "What do these mean?" (DrainageKindGuide).
const CHOICES: { target: SurveyTarget; icon: IconName; title: string; text: string; cy: string; allowed: (a: SurveyAbilities) => boolean }[] = [
  { target: "flood", icon: "droplet", title: "Record a flood", text: "Walk the edge of the water, or trace it on the map.", cy: "survey-start-flood", allowed: (a) => a.recordFlood },
  { target: "drain-line", icon: "waves", title: "Record a drain", text: "Walk along a drain, channel or gutter and note its condition.", cy: "survey-start-drain", allowed: (a) => a.recordDrain },
  { target: "drain-spot", icon: "pin", title: "Mark a culvert, outfall or inlet", text: "One spot: stand at it, or tap it on the map.", cy: "survey-start-spot", allowed: (a) => a.recordDrain },
];

/** One row of the start menu: an icon, what it does in a line, and an arrow. */
function ChoiceRow({ icon, title, text, onClick, cy }: { icon: IconName; title: string; text: string; onClick: () => void; cy: string }) {
  return (
    <button type="button" className="field-dock__choice" onClick={onClick} data-cy={cy}>
      <span className="field-dock__choice-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="field-dock__choice-body">
        <span className="field-dock__choice-title">{title}</span>
        <span className="field-dock__choice-text">{text}</span>
      </span>
      <Icon name="chevronRight" size={16} className="field-dock__choice-go" />
    </button>
  );
}

interface DockProps {
  survey: Survey;
  abilities: SurveyAbilities;
  /** The country a drainage plan is imported into. */
  countryCode: string | null;
  /** A plan was imported: the map draws the drainage again. */
  onImported: () => void;
}

/**
 * Where a responder starts and runs a field recording, over the map: a button that opens the three
 * things to record, then (once one is chosen) the recorder with its live distance, area and GPS signal,
 * and a card that offers a walk left unfinished on this device. Finishing opens the form (FieldSurveyForms).
 */
export function FieldSurveyDock({ survey, abilities, countryCode, onImported }: DockProps) {
  if (survey.unfinished) return <UnfinishedCard survey={survey} />;
  if (survey.recorder.target) return <Recorder survey={survey} />;
  return <StartMenu survey={survey} abilities={abilities} countryCode={countryCode} onImported={onImported} />;
}

function StartMenu({ survey, abilities, countryCode, onImported }: DockProps) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const choices = CHOICES.filter((choice) => choice.allowed(abilities));
  return (
    <div className="field-dock" data-cy="field-survey-dock">
      {open && (
        <section className="map-panel field-dock__menu" aria-label="Field survey">
          <header className="field-dock__intro">
            <h2 className="map-panel__title">Field survey</h2>
            <p className="field-dock__howto">What you record shows on the map for everyone as soon as you save it.</p>
          </header>
          <div className="field-dock__choices">
            {choices.map((choice) => (
              <ChoiceRow key={choice.target} icon={choice.icon} title={choice.title} text={choice.text} cy={choice.cy} onClick={() => survey.startRecording(choice.target)} />
            ))}
          </div>
          {abilities.recordDrain && <DrainageKindGuide />}
          {abilities.importDrainage && (
            <div className="field-dock__more">
              <ChoiceRow icon="upload" title="Import a drainage plan" text="Drains and culverts from a GeoJSON survey file." cy="survey-import-plan" onClick={() => setImporting(true)} />
            </div>
          )}
        </section>
      )}
      <DrainageImportDialog open={importing} countryCode={countryCode} onClose={() => setImporting(false)} onImported={onImported} />
      <Button icon={<Icon name={open ? "close" : "crosshair"} size={16} />} aria-expanded={open} onClick={() => setOpen((value) => !value)} data-cy="field-survey-toggle">
        {open ? "Close" : "Field survey"}
      </Button>
    </div>
  );
}

function UnfinishedCard({ survey }: { survey: Survey }) {
  const draft = survey.unfinished!;
  return (
    <section className="map-panel field-dock field-dock--card" aria-label="Unfinished recording" data-cy="survey-unfinished">
      <h2 className="map-panel__title">Pick up where you left off?</h2>
      <p className="field-dock__howto">
        An unfinished recording is saved on this device: {draft.points.length} {draft.points.length === 1 ? "point" : "points"} of {TARGET_INFO[draft.target].title.toLowerCase()}.
      </p>
      <div className="field-dock__row">
        <Button onClick={survey.continueUnfinished} data-cy="survey-continue">
          Continue
        </Button>
        <Button variant="ghost" onClick={survey.discardUnfinished} data-cy="survey-forget">
          Discard it
        </Button>
      </div>
    </section>
  );
}

function Recorder({ survey }: { survey: Survey }) {
  const r = survey.recorder;
  const target = r.target!;
  const info = TARGET_INFO[target];
  const [confirming, setConfirming] = useState(false);
  const spot = info.maxPoints === 1;
  const walking = r.phase === "walking";
  const quality = r.fix ? gpsQuality(r.fix.accuracy) : null;
  const missing = info.minPoints - r.points.length;
  const discard = () => (r.points.length > 0 ? setConfirming(true) : r.reset());

  return (
    <section className="map-panel field-dock field-dock--card field-dock--recorder" aria-label={info.title} data-cy="survey-recorder">
      <header className="field-dock__header">
        <h2 className="map-panel__title">{info.title}</h2>
        <span className={`field-dock__gps field-dock__gps--${quality ?? "none"}`} data-cy="survey-gps">
          {r.fix ? `GPS ±${Math.round(r.fix.accuracy)} m` : walking ? "Waiting for GPS…" : "GPS off"}
        </span>
      </header>
      <p className="field-dock__howto">{info.howTo}</p>
      <dl className="field-dock__stats" data-cy="survey-stats">
        <div>
          <dt>Points</dt>
          <dd data-cy="survey-points">{r.points.length}</dd>
        </div>
        {!spot && (
          <div>
            <dt>{target === "flood" ? "Around" : "Length"}</dt>
            <dd>{r.points.length > 1 ? formatDistance(r.distanceM) : "—"}</dd>
          </div>
        )}
        {target === "flood" && (
          <div>
            <dt>Area ≈</dt>
            <dd data-cy="survey-area">{r.points.length >= 3 ? formatArea(r.areaM2) : "—"}</dd>
          </div>
        )}
      </dl>
      {r.error && (
        <p className="field-dock__error" role="alert" data-cy="survey-error">
          {r.error}
        </p>
      )}
      {walking && <p className="field-dock__hint">Keep this screen open and walk steadily: a point is kept every few metres, and a weak GPS signal is ignored.</p>}

      <div className="field-dock__row">
        {!spot &&
          (walking ? (
            <Button variant="secondary" onClick={r.pause} data-cy="survey-pause">
              Pause
            </Button>
          ) : (
            <Button icon={<Icon name="crosshair" size={16} />} onClick={r.start} data-cy="survey-start-walk">
              {r.points.length > 0 ? "Resume walking" : "Start walking"}
            </Button>
          ))}
        <Button variant="secondary" icon={<Icon name="pin" size={16} />} loading={r.locating} loadingLabel="Locating…" onClick={r.markHere} data-cy="survey-mark-here">
          {spot ? "Mark here" : "Add a corner here"}
        </Button>
      </div>
      <label className="field-dock__tap">
        <input type="checkbox" checked={r.tapMode} onChange={(event) => r.setTapMode(event.target.checked)} data-cy="survey-tap-mode" />
        <span>Tap the map to add points{spot ? " (the last tap is the spot)" : ""}</span>
      </label>

      <div className="field-dock__row">
        <Button variant="primary" icon={<Icon name="check" size={16} />} disabled={!r.ready} onClick={survey.saving.openForm} data-cy="survey-finish">
          Finish
        </Button>
        <Button variant="ghost" size="sm" disabled={r.points.length === 0} onClick={r.undo} data-cy="survey-undo">
          Undo last
        </Button>
        <Button variant="ghost" size="sm" onClick={discard} data-cy="survey-discard">
          Discard
        </Button>
      </div>
      {!r.ready && missing > 0 && r.points.length > 0 && <p className="field-dock__hint">{missing === 1 ? "One more point" : `${missing} more points`} to finish.</p>}

      <Modal
        open={confirming}
        title="Discard this recording?"
        description={`The ${r.points.length} ${r.points.length === 1 ? "point" : "points"} you have recorded will be thrown away.`}
        onClose={() => setConfirming(false)}
        dataCy="survey-discard-dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep recording
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false);
                r.reset();
              }}
              data-cy="survey-confirm-discard"
            >
              Discard
            </Button>
          </>
        }
      />
    </section>
  );
}
