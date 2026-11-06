import { EARTH_RADIUS } from "../flood-risk/raster-projection";

/**
 * The slippy-map pixel grid that map tiles are cut from (XYZ and MBTiles alike): at zoom z the
 * world is `tileSize * 2^z` pixels across, x runs east from 180° W and y runs south from about 85° N.
 */
export const worldPixels = (zoom: number, tileSize: number) => tileSize * 2 ** zoom;

export const pixelX = (lon: number, world: number) => ((lon + 180) / 360) * world;

export function pixelY(lat: number, world: number): number {
  const phi = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * world;
}

export const lonOfPixel = (x: number, world: number) => (x / world) * 360 - 180;

export const latOfPixel = (y: number, world: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world))) * 180) / Math.PI;

/** The ground size of one pixel, in metres, at a latitude: Web Mercator stretches by 1 / cos(latitude). */
export const pixelMetresAt = (lat: number, world: number) => ((2 * Math.PI * EARTH_RADIUS) / world) * Math.cos((lat * Math.PI) / 180);
