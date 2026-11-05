import { useMemo } from "react";
import { useSurveyAbilities } from "../../hooks/useCan";
import type { SelectedSurvey } from "../../types/field-survey.types";
import { READ_ONLY } from "../../utils/permissions";
import { DrainagePopup } from "./DrainagePopup";
import { FloodExtentPopup } from "./FloodExtentPopup";

/**
 * The popup of the flood or drain clicked on a place's own map: the same details as on the main map,
 * read-only. Staff who may see names and photos see them here too; marking a flood receded,
 * re-inspecting a drain, adding photos or deleting is done on the main map.
 */
export function AreaSurveyPopup({ selected, onClose }: { selected: SelectedSurvey | null; onClose: () => void }) {
  const mine = useSurveyAbilities();
  const abilities = useMemo(() => ({ ...READ_ONLY, viewPeople: mine.viewPeople, viewPhotos: mine.viewPhotos, userId: mine.userId }), [mine]);
  if (!selected) return null;
  return selected.type === "flood" ? (
    <FloodExtentPopup key={selected.properties.id} flood={selected} abilities={abilities} onClose={onClose} />
  ) : (
    <DrainagePopup key={selected.properties.id} drain={selected} abilities={abilities} onClose={onClose} />
  );
}
