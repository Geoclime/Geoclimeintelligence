import type { FeatureCollection } from "geojson";
import { useEffect } from "react";
import { Layer, Source, useMap } from "react-map-gl/mapbox";
import type { ResolvedTheme } from "../../contexts/ThemeContext";
import type { HouseholdFeatureCollection } from "../../types/household.types";
import type { MapPalette } from "./map-style";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** The layer a click on a household lands on. */
export const HOUSEHOLD_LAYER = "households-points";

/** Your own households in the brand teal; everyone else's (staff only) in slate. */
const COLOURS: Record<ResolvedTheme, { mine: string; other: string; edge: string }> = {
  light: { mine: "#0e6b6f", other: "#475467", edge: "#ffffff" },
  dark: { mine: "#3fb5b9", other: "#98a2b3", edge: "#101828" },
};

export const householdIconName = (theme: ResolvedTheme, mine: boolean) => `household-${theme}-${mine ? "mine" : "other"}`;

/** A small house (a square with a roof), drawn on a canvas: no facility, drain or settlement is that shape. */
function drawHouse(theme: ResolvedTheme, mine: boolean): ImageData | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 40;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const colours = COLOURS[theme];
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(20, 5);
  ctx.lineTo(36, 18);
  ctx.lineTo(32, 18);
  ctx.lineTo(32, 35);
  ctx.lineTo(8, 35);
  ctx.lineTo(8, 18);
  ctx.lineTo(4, 18);
  ctx.closePath();
  ctx.fillStyle = mine ? colours.mine : colours.other;
  ctx.fill();
  ctx.strokeStyle = colours.edge;
  ctx.lineWidth = 3;
  ctx.stroke();
  // The door.
  ctx.fillStyle = colours.edge;
  ctx.fillRect(17, 24, 6, 11);
  return ctx.getImageData(0, 0, 40, 40);
}

/** Adds the house shapes to the map, again after every style change, and on request. */
function HouseholdIcons() {
  const { current } = useMap();
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return;
    const add = (name: string, theme: ResolvedTheme, mine: boolean) => {
      const image = drawHouse(theme, mine);
      if (image && !map.hasImage(name)) map.addImage(name, image, { pixelRatio: 2 });
    };
    const addAll = () => {
      for (const theme of ["light", "dark"] as const) for (const mine of [true, false]) add(householdIconName(theme, mine), theme, mine);
    };
    const onMissing = (event: { id: string }) => {
      const match = /^household-(light|dark)-(mine|other)$/.exec(event.id);
      if (match) add(event.id, match[1] as ResolvedTheme, match[2] === "mine");
    };
    if (map.isStyleLoaded()) addAll();
    map.on("style.load", addAll);
    map.on("styleimagemissing", onMissing);
    return () => {
      map.off("style.load", addAll);
      map.off("styleimagemissing", onMissing);
    };
  }, [current]);
  return null;
}

/**
 * Households: the viewer's own homes, and (for staff with households.view) everyone's. A house shape,
 * teal for your own and slate for other people's, with your own labelled from street level. Always
 * mounted, so its place in the draw order never changes.
 */
export function HouseholdLayer({ palette, data }: { palette: MapPalette; data: HouseholdFeatureCollection | null }) {
  return (
    <>
      <HouseholdIcons />
      <Source id="households" type="geojson" data={data ?? EMPTY}>
        <Layer
          id={HOUSEHOLD_LAYER}
          type="symbol"
          layout={{
            "icon-image": ["case", ["get", "mine"], householdIconName(palette.name, true), householdIconName(palette.name, false)],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.55, 17, 1.05],
            "icon-allow-overlap": true,
            "symbol-sort-key": ["case", ["get", "mine"], 0, 1],
          }}
        />
        <Layer
          id="households-labels"
          type="symbol"
          minzoom={15}
          filter={["get", "mine"]}
          layout={{
            "text-field": ["get", "label"],
            "text-size": 11,
            "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
            "text-anchor": "top",
            "text-offset": [0, 1],
            "text-optional": true,
          }}
          paint={{ "text-color": palette.label, "text-halo-color": palette.labelHalo, "text-halo-width": 1.5 }}
        />
      </Source>
    </>
  );
}
