import type { MultiPolygon, Polygon, Position } from "geojson";
import { CLASS_COUNT, type ClassCells, type ClassRaster } from "./flood-risk.types";
import type { UtmConverter } from "./raster-projection";

/** The edges of a polygon's rings in cell coordinates: x is the column, y is the row, both fractional. */
interface Edges {
  x1: Float64Array;
  y1: Float64Array;
  x2: Float64Array;
  y2: Float64Array;
  minRow: number;
  maxRow: number;
}

function edgesOf(rings: Position[][], raster: ClassRaster, converter: UtmConverter): Edges {
  const points = rings.map((ring) =>
    ring.map(([lon, lat]) => {
      const [easting, northing] = converter.toUtm([lon!, lat!]);
      return [(easting - raster.originE) / raster.cellSize, (raster.originN - northing) / raster.cellSize] as const;
    }),
  );
  const count = points.reduce((sum, ring) => sum + Math.max(ring.length - 1, 0), 0);
  const edges: Edges = {
    x1: new Float64Array(count),
    y1: new Float64Array(count),
    x2: new Float64Array(count),
    y2: new Float64Array(count),
    minRow: Infinity,
    maxRow: -Infinity,
  };
  let at = 0;
  for (const ring of points) {
    for (let i = 1; i < ring.length; i++, at++) {
      const [x1, y1] = ring[i - 1]!;
      const [x2, y2] = ring[i]!;
      edges.x1[at] = x1;
      edges.y1[at] = y1;
      edges.x2[at] = x2;
      edges.y2[at] = y2;
      edges.minRow = Math.min(edges.minRow, y1, y2);
      edges.maxRow = Math.max(edges.maxRow, y1, y2);
    }
  }
  return edges;
}

/**
 * Counts the cells of each class whose centre lies inside the area. It fills the shape one row of
 * cells at a time (the even-odd rule over every ring, so holes are left out). A cell belongs to
 * the area when its centre does, so two neighbouring areas never share a cell.
 *
 * `covered`, when given, is marked 1 for every cell the area contains, so a caller can tell which
 * classified cells fall outside every area.
 */
export function countClassesIn(
  raster: ClassRaster,
  geometry: Polygon | MultiPolygon,
  converter: UtmConverter,
  covered?: Uint8Array,
): ClassCells {
  const counts = [0, 0, 0, 0, 0] as ClassCells;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const { width, height, classes } = raster;

  for (const rings of polygons) {
    const edges = edgesOf(rings, raster, converter);
    if (edges.x1.length === 0) continue;
    const firstRow = Math.max(0, Math.floor(edges.minRow - 0.5));
    const lastRow = Math.min(height - 1, Math.ceil(edges.maxRow - 0.5));
    const crossings: number[] = [];
    for (let row = firstRow; row <= lastRow; row++) {
      const y = row + 0.5;
      crossings.length = 0;
      for (let e = 0; e < edges.x1.length; e++) {
        const y1 = edges.y1[e]!;
        const y2 = edges.y2[e]!;
        // Half-open, so a vertex exactly on the row's centre line is crossed once, not twice.
        if ((y1 <= y) !== (y2 <= y)) crossings.push(edges.x1[e]! + ((y - y1) * (edges.x2[e]! - edges.x1[e]!)) / (y2 - y1));
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const from = Math.max(0, Math.ceil(crossings[k]! - 0.5));
        const to = Math.min(width - 1, Math.ceil(crossings[k + 1]! - 0.5) - 1);
        for (let col = from; col <= to; col++) {
          const at = row * width + col;
          if (covered) covered[at] = 1;
          const value = classes[at]!;
          if (value > 0 && value <= CLASS_COUNT) counts[value - 1] = counts[value - 1]! + 1;
        }
      }
    }
  }
  return counts;
}

export const totalOf = (cells: ClassCells): number => cells.reduce((sum, n) => sum + n, 0);

/** The share of classified cells that are high or very high, 0 to 100; null when there are none. */
export function percentHighOf(cells: ClassCells): number | null {
  const total = totalOf(cells);
  return total === 0 ? null : Math.round(((cells[3] + cells[4]) / total) * 1e4) / 100;
}

/** The mean class, 1 to 5, to two decimals; null when there are no cells. */
export function meanClassOf(cells: ClassCells): number | null {
  const total = totalOf(cells);
  if (total === 0) return null;
  const sum = cells.reduce((acc, n, i) => acc + n * (i + 1), 0);
  return Math.round((sum / total) * 100) / 100;
}
