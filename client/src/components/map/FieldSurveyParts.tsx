import type { useFieldSurvey } from "../../hooks/useFieldSurvey";
import type { SurveyAbilities } from "../../utils/permissions";
import { DeleteSurveyDialog } from "./DeleteSurveyDialog";
import { DrainagePopup } from "./DrainagePopup";
import { DrainageFormDialog } from "./DrainageFormDialog";
import { FloodExtentFormDialog } from "./FloodExtentFormDialog";
import { FloodExtentPopup } from "./FloodExtentPopup";
import type { MapPalette } from "./map-style";
import { SurveyDraftLayer } from "./SurveyLayers";

type Survey = ReturnType<typeof useFieldSurvey>;

interface SurveyOnMapProps {
  survey: Survey;
  palette: MapPalette;
  abilities: SurveyAbilities;
  /** Changes when a boundary layer arrives, remounting the walk so it stays on top (as for the pinned place). */
  layerKey: string;
  /** The flood whose reach is drawn over the map, and the switch for it. */
  impactFloodId?: string | null;
  onToggleImpact?: (floodId: string) => void;
}

/** What goes on the map itself: the walk in progress, and the popup of the flood or drain that was clicked. */
export function SurveyOnMap({ survey, palette, abilities, layerKey, impactFloodId = null, onToggleImpact }: SurveyOnMapProps) {
  const { recorder, selection } = survey;
  const selected = selection.selected;
  return (
    <>
      {recorder.target && <SurveyDraftLayer key={`draft-${layerKey}`} palette={palette} target={recorder.target} points={recorder.points} me={recorder.fix?.point ?? null} />}
      {selected?.type === "flood" && (
        <FloodExtentPopup
          key={selected.properties.id}
          flood={selected}
          abilities={abilities}
          onRecede={selection.recede}
          onReopen={selection.reopen}
          onDelete={() => selection.askRemove(selected)}
          showingImpact={impactFloodId === selected.properties.id}
          onToggleImpact={onToggleImpact ? () => onToggleImpact(selected.properties.id) : undefined}
          onClose={selection.closeSelected}
        />
      )}
      {selected?.type === "drain" && (
        <DrainagePopup
          key={selected.properties.id}
          drain={selected}
          abilities={abilities}
          onInspect={selection.inspect}
          onDelete={() => selection.askRemove(selected)}
          onClose={selection.closeSelected}
        />
      )}
    </>
  );
}

/** The dialogs of field survey, outside the map: the form that saves a finished recording, and the confirmation before a delete. */
export function FieldSurveyForms({ survey, abilities }: { survey: Survey; abilities: SurveyAbilities }) {
  const { recorder, saving, selection } = survey;
  const { target } = recorder;
  return (
    <>
      {saving.formOpen && target === "flood" && (
        <FloodExtentFormDialog
          key={saving.formKey}
          areaM2={recorder.areaM2}
          perimeterM={recorder.distanceM}
          pointCount={recorder.points.length}
          method={recorder.method}
          canAddPhotos={abilities.addPhotos}
          onClose={saving.closeForm}
          onSubmit={saving.saveFlood}
        />
      )}
      {saving.formOpen && (target === "drain-line" || target === "drain-spot") && (
        <DrainageFormDialog
          key={saving.formKey}
          target={target}
          distanceM={recorder.distanceM}
          canAddPhotos={abilities.addPhotos}
          onClose={saving.closeForm}
          onSubmit={saving.saveDrain}
        />
      )}
      <DeleteSurveyDialog selected={selection.removing} onClose={selection.closeRemove} onConfirm={selection.confirmRemove} />
    </>
  );
}
