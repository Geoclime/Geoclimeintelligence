import initSqlJs from "sql.js";
import { ValidationError } from "../../common/errors/app-error";
import type { BBox } from "../../common/geo/geo";
import { decodePng, PngError } from "./png-codec";
import type { FloodMosaic, TileSetInfo } from "./satellite-flood.types";
import { latOfPixel, lonOfPixel, pixelX, pixelY, worldPixels } from "./web-mercator";

/**
 * The zoom the mask is read at. Zoom 12 is about 38 m a pixel at Rivers State's latitude: four
 * times coarser than Sentinel-1's 10 m, but fine for a state-wide view and per-ward figures, and it
 * keeps a month to a few hundred KB. A file whose deepest zoom is lower is read at that zoom.
 */
export const MASK_ZOOM = 12;
/** Coarser than this (about 150 m a pixel) is refused: too coarse to measure a ward. */
export const MIN_ZOOM = 10;
/** The mosaic is held in memory while it is checked: Rivers State at zoom 12 is about 14 million. */
export const MAX_MOSAIC_PIXELS = 40_000_000;
/** Among the pixels that show water, at least this share must be one colour, or it isn't a water mask. */
const ONE_COLOUR_SHARE = 0.9;

const SQLITE_MAGIC = "SQLite format 3\u0000";
const MONTH = /(?:^|[^0-9])((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])(?:[^0-9]|$)/;

let sqlJs: ReturnType<typeof initSqlJs> | undefined;

const fileError = (message: string) => new ValidationError([{ field: "file", message }]);

export interface FloodTilesRead {
  info: TileSetInfo;
  mosaic: FloodMosaic;
  /** What the reader noticed or assumed, for the run's warnings. */
  notes: string[];
}

/** "s1_flood_2016_08" -> "2016-08"; null when the text names no month. */
export function monthFrom(text: string | null | undefined): string | null {
  const match = text ? MONTH.exec(text) : null;
  return match ? `${match[1]}-${match[2]}` : null;
}

function parseBounds(text: string | undefined): BBox | null {
  const parts = (text ?? "").split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts as BBox;
  const ok = west >= -180 && east <= 180 && west < east && south >= -85.06 && north <= 85.06 && south < north;
  return ok ? [west, south, east, north] : null;
}

/**
 * Reads a raster MBTiles file (a SQLite database of PNG tiles) of water detected from space, such as
 * the data team's `s1_flood_2016_08.mbtiles`: blue where Sentinel-1 saw water that month,
 * transparent elsewhere. It stitches one zoom level into a single mask cropped to the file's bounds.
 *
 * It refuses, with a plain reason, anything it would otherwise have to guess at: not an MBTiles
 * file, vector or JPEG tiles, tiles too coarse to measure a ward, tiles with no transparency (a
 * basemap) or in several colours (a picture of a map rather than a mask).
 *
 * A missing tile is read as "no water": tile makers leave out empty tiles, and the file can't say
 * whether a gap was dry or not seen.
 */
export async function readFloodTiles(buffer: Buffer, fileName: string): Promise<FloodTilesRead> {
  if (buffer.length < 100 || buffer.subarray(0, 16).toString("latin1") !== SQLITE_MAGIC) {
    throw fileError(`${fileName} isn't an MBTiles file (a .mbtiles file is a SQLite database of map tiles).`);
  }
  const SQL = await (sqlJs ??= initSqlJs());
  let db: initSqlJs.Database;
  try {
    db = new SQL.Database(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  } catch {
    throw fileError(`${fileName} can't be opened: it may have been cut short while downloading. Download it again.`);
  }

  try {
    const hasTiles = db.exec(`SELECT 1 FROM sqlite_master WHERE name = 'tiles' AND type IN ('table', 'view')`).length > 0;
    if (!hasTiles) throw fileError(`${fileName} is a SQLite database but not an MBTiles file: it has no tiles table.`);

    const metadata = new Map<string, string>();
    try {
      for (const [name, value] of db.exec(`SELECT name, value FROM metadata`)[0]?.values ?? []) metadata.set(String(name), String(value ?? ""));
    } catch {
      // No metadata table: everything below is worked out from the tiles themselves.
    }
    const format = metadata.get("format")?.toLowerCase();
    if (format === "pbf" || format === "mvt") throw fileError(`${fileName} holds vector tiles. This import reads raster PNG tiles of water.`);
    if (format && format !== "png") {
      throw fileError(`${fileName} holds ${format.toUpperCase()} tiles. Only PNG tiles can be read: they are transparent where there is no water, which JPEG can't be.`);
    }

    const zooms = (db.exec(`SELECT DISTINCT zoom_level FROM tiles ORDER BY zoom_level`)[0]?.values ?? []).map(([z]) => Number(z));
    if (zooms.length === 0) throw fileError(`${fileName} holds no tiles.`);
    const maxZoom = Math.max(...zooms);
    const readZoom = Math.max(...zooms.filter((z) => z <= MASK_ZOOM), -1);
    if (readZoom < MIN_ZOOM) {
      throw fileError(
        `${fileName} goes down to zoom ${readZoom < 0 ? Math.min(...zooms) : readZoom} only, about ${Math.round(156543 / 2 ** Math.max(readZoom, 0))} m a pixel: ` +
          `too coarse to measure a ward. Export it to zoom ${MIN_ZOOM} or deeper.`,
      );
    }

    const notes: string[] = [];
    const positions = (db.exec(`SELECT tile_column, tile_row FROM tiles WHERE zoom_level = ${readZoom}`)[0]?.values ?? []).map(
      ([col, row]) => [Number(col), Number(row)] as const,
    );
    const tilesAcross = 2 ** readZoom;

    // The tile size comes from the first tile: every tile at this zoom must match it.
    const first = db.exec(`SELECT tile_data FROM tiles WHERE zoom_level = ${readZoom} LIMIT 1`)[0]?.values[0]?.[0];
    const tileSize = first instanceof Uint8Array ? tileWidth(first, fileName, readZoom) : 256;
    const world = worldPixels(readZoom, tileSize);

    // MBTiles counts tile rows from the south (TMS); some tools write them from the north (XYZ).
    // Whichever puts the tiles inside the file's own bounds is the one used.
    let bounds = parseBounds(metadata.get("bounds"));
    let flipRows = true;
    if (bounds) {
      const [west, south, east, north] = bounds;
      const inside = (col: number, y: number) =>
        col >= Math.floor(pixelX(west, world) / tileSize) && col <= Math.floor(pixelX(east, world) / tileSize) &&
        y >= Math.floor(pixelY(north, world) / tileSize) && y <= Math.floor(pixelY(south, world) / tileSize);
      const asTms = positions.filter(([col, row]) => inside(col, tilesAcross - 1 - row)).length;
      const asXyz = positions.filter(([col, row]) => inside(col, row)).length;
      if (asXyz > asTms) {
        flipRows = false;
        notes.push("The tile rows are numbered from the north (XYZ) rather than the MBTiles standard (TMS); they were read that way.");
      }
      if (Math.max(asTms, asXyz) < positions.length / 2) {
        notes.push("Most tiles lie outside the bounds the file gives, so the tiles' own extent was used instead.");
        bounds = null;
      }
    }
    if (!bounds) {
      const cols = positions.map(([col]) => col);
      const ys = positions.map(([, row]) => (flipRows ? tilesAcross - 1 - row : row));
      bounds = [
        lonOfPixel(Math.min(...cols) * tileSize, world),
        latOfPixel((Math.max(...ys) + 1) * tileSize, world),
        lonOfPixel((Math.max(...cols) + 1) * tileSize, world),
        latOfPixel(Math.min(...ys) * tileSize, world),
      ];
    }

    const [west, south, east, north] = bounds;
    const originX = Math.floor(pixelX(west, world));
    const originY = Math.floor(pixelY(north, world));
    const width = Math.ceil(pixelX(east, world)) - originX;
    const height = Math.ceil(pixelY(south, world)) - originY;
    if (width * height > MAX_MOSAIC_PIXELS) {
      throw fileError(`${fileName} covers ${width.toLocaleString("en")} x ${height.toLocaleString("en")} pixels at zoom ${readZoom}: more than one state can be read at once. Export one state per file.`);
    }

    // Stitch the tiles' alpha into one mosaic, and count the colours of the visible pixels.
    const alpha = new Uint8Array(width * height);
    const colours = new Map<number, number>();
    let transparent = 0;
    let tileCount = 0;
    const statement = db.prepare(`SELECT tile_column, tile_row, tile_data FROM tiles WHERE zoom_level = ?`);
    try {
      statement.bind([readZoom]);
      while (statement.step()) {
        const [col, row, data] = statement.get() as [number, number, Uint8Array];
        const y = flipRows ? tilesAcross - 1 - row : row;
        let tile;
        try {
          tile = decodePng(data);
        } catch (err) {
          if (err instanceof PngError) throw fileError(`The tile at zoom ${readZoom}, column ${col}, row ${row} of ${fileName} ${err.message}.`);
          throw err;
        }
        if (tile.width !== tileSize || tile.height !== tileSize) {
          throw fileError(`${fileName} mixes tile sizes at zoom ${readZoom} (${tileSize} and ${tile.width} pixels).`);
        }
        tileCount++;
        const left = col * tileSize - originX;
        const top = y * tileSize - originY;
        for (let ty = 0; ty < tileSize; ty++) {
          const my = top + ty;
          if (my < 0 || my >= height) continue;
          for (let tx = 0; tx < tileSize; tx++) {
            const mx = left + tx;
            if (mx < 0 || mx >= width) continue;
            const i = ty * tileSize + tx;
            const a = tile.alpha[i]!;
            if (a === 0) {
              transparent++;
              continue;
            }
            alpha[my * width + mx] = a;
            if (a >= 64) colours.set(tile.rgb[i]!, (colours.get(tile.rgb[i]!) ?? 0) + 1);
          }
        }
      }
    } finally {
      statement.free();
    }

    if (tileCount > 0 && transparent === 0) {
      throw fileError(`${fileName} has no transparent pixels, so it looks like a basemap rather than a water mask (transparent where no water was seen).`);
    }
    const visible = [...colours.values()].reduce((sum, n) => sum + n, 0);
    const topColour = Math.max(0, ...colours.values());
    if (visible > 0 && topColour / visible < ONE_COLOUR_SHARE) {
      throw fileError(`${fileName} draws its pixels in several colours, so it looks like a picture of a map rather than a water mask in one colour.`);
    }

    // Tile makers soften edges when they build the coarser zooms: a pixel is water when it is at least
    // half as opaque as the file's water colour.
    let maxAlpha = 0;
    for (const a of alpha) if (a > maxAlpha) maxAlpha = a;
    const threshold = Math.max(1, Math.ceil(maxAlpha / 2));
    const mask = new Uint8Array(width * height);
    let waterPixels = 0;
    for (let i = 0; i < alpha.length; i++) {
      if (alpha[i]! >= threshold) {
        mask[i] = 1;
        waterPixels++;
      }
    }
    if (waterPixels === 0) notes.push("No water is shown anywhere in this month's tiles.");
    if (maxZoom > readZoom) notes.push(`The file goes down to zoom ${maxZoom}; it was read at zoom ${readZoom}, which is what the map keeps.`);

    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    const name = metadata.get("name") ?? null;
    return {
      info: {
        name,
        description: metadata.get("description") ?? null,
        yearMonth: monthFrom(name) ?? monthFrom(fileName),
        maxZoom,
        readZoom,
        tileCount,
      },
      mosaic: {
        zoom: readZoom,
        tileSize,
        originX,
        originY,
        width,
        height,
        mask,
        waterPixels,
        bounds: [
          round(lonOfPixel(originX, world)),
          round(latOfPixel(originY + height, world)),
          round(lonOfPixel(originX + width, world)),
          round(latOfPixel(originY, world)),
        ],
      },
      notes,
    };
  } finally {
    db.close();
  }
}

function tileWidth(data: Uint8Array, fileName: string, zoom: number): number {
  try {
    const tile = decodePng(data);
    if (tile.width !== tile.height) throw fileError(`${fileName} has tiles that aren't square at zoom ${zoom}.`);
    return tile.width;
  } catch (err) {
    if (err instanceof PngError) throw fileError(`The first tile at zoom ${zoom} of ${fileName} ${err.message}. Only PNG tiles can be read.`);
    throw err;
  }
}
