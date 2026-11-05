import { useEffect } from "react";
import { useMap } from "react-map-gl/mapbox";
import type { ResolvedTheme } from "../../contexts/ThemeContext";
import {
  ARROW_ICON_PREFIX,
  DRAIN_ICON_PIXEL_RATIO,
  DRAIN_TONES,
  drainIconName,
  drawArrowIcon,
  drawDrainIcon,
  parseDrainIconName,
  SPOT_KINDS,
} from "./drain-icons";

const THEMES: readonly ResolvedTheme[] = ["light", "dark"];

/**
 * Gives the map the drainage shapes (drain-icons.ts). A style change (theme, satellite) throws every
 * image away, so they are added on each style load, and any the map still asks for are drawn on request.
 * Renders nothing itself; put it inside the map, before the drainage layers.
 */
export function DrainageIcons() {
  const { current } = useMap();

  useEffect(() => {
    const map = current?.getMap();
    if (!map) return;
    const add = (name: string, image: ImageData | null, pixelRatio: number) => {
      if (image && !map.hasImage(name)) map.addImage(name, image, { pixelRatio });
    };
    const addAll = () => {
      for (const theme of THEMES) {
        for (const kind of SPOT_KINDS) for (const tone of DRAIN_TONES) add(drainIconName(theme, kind, tone), drawDrainIcon(theme, kind, tone), DRAIN_ICON_PIXEL_RATIO);
        add(`${ARROW_ICON_PREFIX}${theme}`, drawArrowIcon(theme), 2);
      }
    };
    const onMissing = (event: { id: string }) => {
      const parsed = parseDrainIconName(event.id);
      if (parsed) add(event.id, drawDrainIcon(parsed.theme, parsed.kind, parsed.tone), DRAIN_ICON_PIXEL_RATIO);
      else if (event.id.startsWith(ARROW_ICON_PREFIX)) {
        const theme = event.id.slice(ARROW_ICON_PREFIX.length);
        if (theme === "light" || theme === "dark") add(event.id, drawArrowIcon(theme), 2);
      }
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
