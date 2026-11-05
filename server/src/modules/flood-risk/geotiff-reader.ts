import { fromArrayBuffer } from "geotiff";
import { ValidationError } from "../../common/errors/app-error";
import { CLASS_COUNT, type ClassCells, type ClassRaster } from "./flood-risk.types";
import { utmDefinition } from "./raster-projection";

/** More cells than this (6,000 x 6,000) is refused: the grid is held in memory while it is checked. */
export const MAX_CELLS = 36_000_000;

const fileError = (message: string) => new ValidationError([{ field: "file", message }]);

/**
 * Reads a classified flood risk map: one band, 1 (very low) to 5 (very high), with no-data cells
 * left out, in a WGS 84 / UTM grid of square cells. It refuses anything else with a plain reason,
 * rather than guessing: a continuous index, a map in another CRS, a file that isn't a GeoTIFF.
 */
export async function readClassRaster(buffer: Buffer): Promise<ClassRaster> {
  let tiff;
  try {
    tiff = await fromArrayBuffer(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  } catch {
    throw fileError("This isn't a GeoTIFF the server can read. Upload the classified map (flood_risk_map.tif), as a .tif file.");
  }
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  if (width * height > MAX_CELLS) {
    throw fileError(`The map is ${width} x ${height} cells; the most that can be read is ${MAX_CELLS.toLocaleString("en")} cells.`);
  }
  if (image.getSamplesPerPixel() !== 1) throw fileError("The map must have a single band holding the risk class.");

  const epsg = image.getGeoKeys()?.ProjectedCSTypeGeoKey;
  if (!epsg || epsg === 32767) {
    throw fileError("The map has no projected coordinate system (CRS), so it can't be placed. Save it with its CRS, in WGS 84 / UTM.");
  }
  utmDefinition(epsg);

  let box: number[];
  let resolution: number[];
  try {
    box = image.getBoundingBox();
    resolution = image.getResolution();
  } catch {
    throw fileError("The map's position couldn't be read. A rotated or unreferenced GeoTIFF can't be used.");
  }
  const [minE, , , maxN] = box as [number, number, number, number];
  const cellX = Math.abs(resolution[0] ?? 0);
  const cellY = Math.abs(resolution[1] ?? 0);
  if (!(cellX > 0) || Math.abs(cellX - cellY) > cellX * 1e-6) throw fileError("The map's cells must be square.");

  const [band] = (await image.readRasters({ interleave: false })) as ArrayLike<number>[];
  if (!band || band.length !== width * height) throw fileError("The map's cell values couldn't be read.");
  const nodata = image.getGDALNoData();

  const classes = new Uint8Array(width * height);
  const classCells = [0, 0, 0, 0, 0] as ClassCells;
  let minCol = width;
  let maxCol = -1;
  let minRow = height;
  let maxRow = -1;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const value = band[row * width + col]!;
      if (Number.isNaN(value) || value === nodata || value === 0) continue;
      if (!Number.isInteger(value) || value < 1 || value > CLASS_COUNT) {
        throw fileError(
          `Row ${row + 1}, column ${col + 1} holds ${value}, which is not a flood risk class. This reads the classified map ` +
            "(1 = very low to 5 = very high, such as flood_risk_map.tif), not the continuous index or a factor score.",
        );
      }
      classes[row * width + col] = value;
      classCells[value - 1]!++;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
    }
  }
  if (maxCol < 0) throw fileError("The map holds no classified cells: every cell is no data.");

  return {
    width,
    height,
    originE: minE,
    originN: maxN,
    cellSize: cellX,
    epsg,
    classes,
    classCells,
    block: { minCol, maxCol, minRow, maxRow },
  };
}
