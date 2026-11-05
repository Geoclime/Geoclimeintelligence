import type { ResolvedTheme } from "../../contexts/ThemeContext";
import type { DrainageKind } from "../../types/field-survey.types";
import type { ConditionTone } from "../../utils/field-survey";
import { mapPalette } from "./map-style";

/**
 * The shapes drainage spots are drawn with, so a culvert, an outfall, an inlet and a pond can be told
 * apart without opening them, and none of them can be mistaken for a facility's round dot:
 *   culvert: a pipe on its side, with its mouth drawn;  outfall: a triangle pointing where water leaves;
 *   inlet: a square grate;  retention pond: a circle with a wave in it.
 * Each is filled with the condition's colour and edged with the casing colour. Images are drawn on a
 * canvas in the browser, named `drain-<theme>-<kind>-<tone>`, and added to the map when it asks for them.
 */

export type SpotKind = Exclude<DrainageKind, "open_drain" | "covered_drain">;
export const SPOT_KINDS: readonly SpotKind[] = ["culvert", "outfall", "inlet", "retention_pond"];
export const DRAIN_TONES: readonly ConditionTone[] = ["good", "warn", "bad"];
export const ARROW_ICON_PREFIX = "drain-arrow-";

/** 24 CSS pixels, drawn at twice that so it is sharp on a phone. */
const SIZE = 48;
export const DRAIN_ICON_PIXEL_RATIO = 2;

export function drainIconName(theme: ResolvedTheme, kind: SpotKind, tone: ConditionTone): string {
  return `drain-${theme}-${kind}-${tone}`;
}

/** Reads a name back, for the map's "missing image" event. Null for a name that isn't one of ours. */
export function parseDrainIconName(name: string): { theme: ResolvedTheme; kind: SpotKind; tone: ConditionTone } | null {
  const match = /^drain-(light|dark)-(culvert|outfall|inlet|retention_pond)-(good|warn|bad)$/.exec(name);
  return match ? { theme: match[1] as ResolvedTheme, kind: match[2] as SpotKind, tone: match[3] as ConditionTone } : null;
}

function trace(ctx: CanvasRenderingContext2D, kind: SpotKind) {
  ctx.beginPath();
  switch (kind) {
    case "culvert":
      ctx.roundRect(5, 14, 38, 20, 10);
      break;
    case "outfall":
      ctx.moveTo(7, 10);
      ctx.lineTo(41, 10);
      ctx.lineTo(24, 41);
      ctx.closePath();
      break;
    case "inlet":
      ctx.rect(9, 9, 30, 30);
      break;
    case "retention_pond":
      ctx.arc(24, 24, 17, 0, Math.PI * 2);
      break;
  }
}

/** The detail drawn over the fill in the casing colour: the pipe's mouth, the grate's bars, the pond's wave. */
function detail(ctx: CanvasRenderingContext2D, kind: SpotKind) {
  ctx.beginPath();
  if (kind === "culvert") ctx.arc(14, 24, 5, 0, Math.PI * 2);
  if (kind === "inlet") {
    for (const x of [17, 24, 31]) {
      ctx.moveTo(x, 13);
      ctx.lineTo(x, 35);
    }
  }
  if (kind === "retention_pond") {
    ctx.moveTo(13, 25);
    ctx.bezierCurveTo(17, 19, 20, 19, 24, 25);
    ctx.bezierCurveTo(28, 31, 31, 31, 35, 25);
  }
  ctx.stroke();
}

/** One icon as raw pixels, or null where there is no canvas (tests, old browsers): the map then simply has no icon. */
export function drawDrainIcon(theme: ResolvedTheme, kind: SpotKind, tone: ConditionTone): ImageData | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const palette = mapPalette(theme);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  trace(ctx, kind);
  ctx.fillStyle = palette.drain[tone];
  ctx.fill();
  ctx.strokeStyle = palette.drainCasing;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.lineWidth = 2.5;
  detail(ctx, kind);
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/** A small chevron drawn along a drain to show which way the water goes, in the casing colour. */
export function drawArrowIcon(theme: ResolvedTheme): ImageData | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.strokeStyle = mapPalette(theme).drainCasing;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(8, 5);
  ctx.lineTo(16, 12);
  ctx.lineTo(8, 19);
  ctx.stroke();
  return ctx.getImageData(0, 0, 24, 24);
}
