import type { DrainageKind } from "../types/field-survey.types";

/**
 * What each kind of drainage is, in plain words, so the person recording knows what they are marking.
 * `example` is the thing people on the ground usually call it; `how` says how it is recorded.
 */
export const DRAINAGE_KIND_INFO: Record<DrainageKind, { definition: string; example: string; how: string }> = {
  open_drain: {
    definition: "A channel that carries water along the ground, open to the sky.",
    example: "A roadside gutter, a drainage channel, a ditch or a canal.",
    how: "Walk along it from one end to the other.",
  },
  covered_drain: {
    definition: "The same kind of channel, but roofed over with slabs or a lid, so you can't see the water.",
    example: "A covered gutter, or a box drain under a pavement.",
    how: "Walk along the line it follows.",
  },
  culvert: {
    definition: "A pipe or small tunnel that carries water under a road, railway or bank.",
    example: "Usually an opening on each side of a road, where a stream or channel passes under it.",
    how: "Stand at it and mark the one spot.",
  },
  outfall: {
    definition: "The place where a drain empties into a river, creek, lagoon or a larger drain.",
    example: "The mouth of a gutter at the water's edge.",
    how: "Stand at the mouth and mark the one spot.",
  },
  inlet: {
    definition: "The grate or opening where water from the street first enters a drain.",
    example: "A gully, a catch basin or a street grate.",
    how: "Stand at it and mark the one spot.",
  },
  retention_pond: {
    definition: "A pond or basin built to hold storm water and let it out slowly, or soak away.",
    example: "A basin beside an estate road, or a detention pond.",
    how: "Stand at it and mark the one spot.",
  },
};

/** Roof gutters and a building's own pipes are not recorded on the map. */
export const NOT_RECORDED_NOTE = "Roof gutters on buildings aren't recorded here: only drainage that serves a street, a road or an area.";
