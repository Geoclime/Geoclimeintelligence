import type { SelectedSurvey } from "../../types/field-survey.types";
import { DrainagePopup } from "./DrainagePopup";
import { FloodExtentPopup } from "./FloodExtentPopup";

/**
 * The popup of the flood or drain clicked on a place's own map: the same details as on the main map,
 * read-only. Marking a flood receded, re-inspecting a drain or deleting either is for staff, on the main map.
 */
export function AreaSurveyPopup({ selected, onClose }: { selected: SelectedSurvey | null; onClose: () => void }) {
  if (!selected) return null;
  return selected.type === "flood" ? (
    <FloodExtentPopup key={selected.properties.id} flood={selected} canRecord={false} onClose={onClose} />
  ) : (
    <DrainagePopup key={selected.properties.id} drain={selected} canRecord={false} onClose={onClose} />
  );
}
