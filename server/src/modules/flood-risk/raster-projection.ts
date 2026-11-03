import proj4 from "proj4";
import { ValidationError } from "../../common/errors/app-error";
import type { BBox, LonLat } from "../../common/geo/geo";
import type { ClassRaster } from "./flood-risk.types";

/** Web Mercator's sphere radius in metres, as in EPSG:3857. */
export const EARTH_RADIUS = 6378137;

export const mercatorX = (lon: number) => (lon * Math.PI * EARTH_RADIUS) / 180;
export const mercatorY = (lat: number) => EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
export const lonOfMercatorX = (x: number) => (x / EARTH_RADIUS) * (180 / Math.PI);
export const latOfMercatorY = (y: number) => (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI);

/** The EPSG code's PROJ definition, for WGS 84 / UTM north (326zz) and south (327zz). Anything else is refused. */
export function utmDefinition(epsg: number): string {
  const zone = epsg % 100;
  if (epsg >= 32601 && epsg <= 32660) return `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;
  if (epsg >= 32701 && epsg <= 32760) return `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`;
  throw new ValidationError([
    {
      field: "file",
      message: `The map is in EPSG:${epsg}. Only maps in WGS 84 / UTM (EPSG:326xx or 327xx) can be read for now. Reproject it to its UTM zone first.`,
    },
  ]);
}

/** Converts between WGS 84 longitude/latitude and the raster's UTM eastings/northings. */
export interface UtmConverter {
  /** [longitude, latitude] -> [easting, northing]. */
  toUtm(point: LonLat): [number, number];
  /** [easting, northing] -> [longitude, latitude]. */
  toLonLat(point: [number, number]): LonLat;
}

export function utmConverter(epsg: number): UtmConverter {
  const converter = proj4("EPSG:4326", utmDefinition(epsg));
  return {
    toUtm: (point) => converter.forward(point) as [number, number],
    toLonLat: (point) => converter.inverse(point) as LonLat,
  };
}

/** The longitude/latitude box around the cells that hold a class. */
export function dataBounds(raster: ClassRaster, converter: UtmConverter): BBox {
  const { minCol, maxCol, minRow, maxRow } = raster.block;
  const west = raster.originE + minCol * raster.cellSize;
  const east = raster.originE + (maxCol + 1) * raster.cellSize;
  const north = raster.originN - minRow * raster.cellSize;
  const south = raster.originN - (maxRow + 1) * raster.cellSize;
  // All four corners: a UTM grid is slightly rotated against the meridians, so no single pair gives the box.
  const corners = ([[west, north], [east, north], [east, south], [west, south]] as [number, number][]).map((c) => converter.toLonLat(c));
  const lons = corners.map(([lon]) => lon);
  const lats = corners.map(([, lat]) => lat);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}
