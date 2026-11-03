import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/common/errors/app-error";
import { readClassRaster } from "../../src/modules/flood-risk/geotiff-reader";
import { FLOOD_RISK_CLASSES, type ClassRaster } from "../../src/modules/flood-risk/flood-risk.types";
import { buildOverlay, METRES_PER_PIXEL } from "../../src/modules/flood-risk/overlay-image";
import { dataBounds, mercatorX, mercatorY, utmConverter } from "../../src/modules/flood-risk/raster-projection";
import { countClassesIn, meanClassOf, percentHighOf } from "../../src/modules/flood-risk/zonal-stats";
import { cellRectangle, ORIGIN } from "../flood-risk-fakes";
import { buildClassTiff, decodePalettePng } from "../raster-fixtures";

// The GeoTIFF reader, the picture the map draws and the cell counting, on small rasters that are
// built here, so none of it needs the real 2 million cell file.

const WIDTH = 60;
const HEIGHT = 50;

/** Classes 1..5 in diagonal bands, with the top-left 5 x 5 corner and a column of cells left as no data. */
function bands(): number[] {
  return Array.from({ length: WIDTH * HEIGHT }, (_, i) => {
    const col = i % WIDTH;
    const row = Math.floor(i / WIDTH);
    if (col < 5 && row < 5) return -9999;
    if (col === 30) return -9999;
    return 1 + (Math.floor(col / 4) + Math.floor(row / 3)) % 5;
  });
}

async function readBands(): Promise<ClassRaster> {
  return readClassRaster(await buildClassTiff({ width: WIDTH, height: HEIGHT, ...ORIGIN, values: bands(), nodata: -9999, float: true }));
}

async function readError(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ValidationError);
  return (error as ValidationError).errors?.[0]?.message ?? "";
}

describe("reading a classified GeoTIFF", () => {
  it("reads the classes, where the grid sits and how many cells hold each class", async () => {
    const raster = await readBands();
    expect([raster.width, raster.height, raster.cellSize, raster.epsg]).toEqual([WIDTH, HEIGHT, 100, 32632]);
    expect([raster.originE, raster.originN]).toEqual([ORIGIN.originE, ORIGIN.originN]);
    expect(raster.classes[0]).toBe(0); // the no-data corner
    expect(raster.classes[30]).toBe(0); // the no-data column
    expect(raster.classes[5 * WIDTH + 6]).toBe(1 + (Math.floor(6 / 4) + Math.floor(5 / 3)) % 5);
    const classified = WIDTH * HEIGHT - 25 - HEIGHT; // the 5 x 5 corner, and the whole no-data column (col 30 is outside the corner)
    expect(raster.classCells.reduce((a, b) => a + b, 0)).toBe(classified);
    expect(raster.block).toEqual({ minCol: 0, maxCol: WIDTH - 1, minRow: 0, maxRow: HEIGHT - 1 });
  });

  it("reads whole-number classes stored as bytes, with 0 as no data", async () => {
    const values = [0, 1, 2, 3, 4, 5];
    const raster = await readClassRaster(await buildClassTiff({ width: 3, height: 2, ...ORIGIN, values }));
    expect(Array.from(raster.classes)).toEqual(values);
    expect(raster.classCells).toEqual([1, 1, 1, 1, 1]);
  });

  it("refuses a file that is not a GeoTIFF", async () => {
    expect(await readError(readClassRaster(Buffer.from("this is not a tiff, just words")))).toMatch(/isn't a GeoTIFF/);
  });

  it("refuses the continuous index or a factor score, naming the cell and the value", async () => {
    const values = [1, 2, 3.5, 4, 5, 1];
    const message = await readError(readClassRaster(await buildClassTiff({ width: 3, height: 2, ...ORIGIN, values, float: true })));
    expect(message).toMatch(/Row 1, column 3 holds 3\.5/);
    expect(message).toMatch(/classified map/);
    expect(await readError(readClassRaster(await buildClassTiff({ width: 2, height: 1, ...ORIGIN, values: [1, 6] })))).toMatch(/holds 6/);
  });

  it("refuses a map with no coordinate system, or one that is not UTM", async () => {
    expect(await readError(readClassRaster(await buildClassTiff({ width: 2, height: 1, ...ORIGIN, values: [1, 2], withoutCrs: true })))).toMatch(/no projected coordinate system/);
    expect(await readError(readClassRaster(await buildClassTiff({ width: 2, height: 1, ...ORIGIN, values: [1, 2], epsg: 3857 })))).toMatch(/Only maps in WGS 84 \/ UTM/);
  });

  it("refuses a map with no classified cell at all", async () => {
    expect(await readError(readClassRaster(await buildClassTiff({ width: 2, height: 2, ...ORIGIN, values: [-9999, -9999, -9999, -9999], nodata: -9999, float: true })))).toMatch(
      /no classified cells/,
    );
  });
});

describe("the picture the map draws", () => {
  it("is a palette PNG in the class colours, with no data transparent", async () => {
    const overlay = await buildOverlay(await readBands());
    const png = decodePalettePng(overlay.png);
    expect([png.width, png.height, png.colourType]).toEqual([overlay.width, overlay.height, 3]);
    expect(png.palette).toEqual(["#000000", ...FLOOD_RISK_CLASSES.map((c) => c.color)]);
    expect(png.firstAlpha).toBe(0);
    // A 60 x 50 map of 100 m cells on 50 m pixels is about 120 x 100, plus the one-pixel border.
    expect(png.width).toBeGreaterThan(118);
    expect(png.width).toBeLessThan(126);
    expect(png.height).toBeGreaterThan(98);
    expect(png.height).toBeLessThan(106);
  });

  it("surrounds the cells that hold data, in longitude and latitude", async () => {
    const raster = await readBands();
    const overlay = await buildOverlay(raster);
    const [west, south, east, north] = dataBounds(raster, utmConverter(raster.epsg));
    expect(overlay.west).toBeLessThanOrEqual(west);
    expect(overlay.east).toBeGreaterThanOrEqual(east);
    expect(overlay.south).toBeLessThanOrEqual(south);
    expect(overlay.north).toBeGreaterThanOrEqual(north);
    // 250 km west of the zone's centre meridian (9 E) at 4.7 N is 6.747 E; 6 km further east is 6.801 E.
    expect(overlay.west).toBeGreaterThan(6.74);
    expect(overlay.west).toBeLessThan(6.75);
    expect(overlay.east).toBeGreaterThan(6.8);
    expect(overlay.east).toBeLessThan(6.81);
  });

  it("puts every class where the source has it, using only the corners Mapbox is given", async () => {
    const raster = await readBands();
    const overlay = await buildOverlay(raster);
    const png = decodePalettePng(overlay.png);
    const converter = utmConverter(raster.epsg);

    // Mapbox stretches the picture across its four corners, linearly in Web Mercator.
    const x0 = mercatorX(overlay.west);
    const x1 = mercatorX(overlay.east);
    const y0 = mercatorY(overlay.north);
    const y1 = mercatorY(overlay.south);
    let checked = 0;
    let agree = 0;
    for (let y = 0; y < png.height; y += 3) {
      for (let x = 0; x < png.width; x += 3) {
        const mx = x0 + ((x + 0.5) / png.width) * (x1 - x0);
        const my = y0 + ((y + 0.5) / png.height) * (y1 - y0);
        const lon = (mx / 6378137) * (180 / Math.PI);
        const lat = (2 * Math.atan(Math.exp(my / 6378137)) - Math.PI / 2) * (180 / Math.PI);
        const [easting, northing] = converter.toUtm([lon, lat]);
        const col = Math.floor((easting - raster.originE) / raster.cellSize);
        const row = Math.floor((raster.originN - northing) / raster.cellSize);
        const expected = col >= 0 && col < raster.width && row >= 0 && row < raster.height ? raster.classes[row * raster.width + col]! : 0;
        checked++;
        if (png.indices[y * png.width + x] === expected) agree++;
      }
    }
    // The few that differ sit on a cell edge, where rounding the corners to a tenth of a metre can tip a pixel.
    expect(agree / checked).toBeGreaterThan(0.995);
  });

  it("uses pixels half the size of a source cell, so each cell is a crisp block", () => {
    expect(METRES_PER_PIXEL).toBe(50);
  });
});

describe("counting cells inside an area", () => {
  it("counts the classes whose cell centres fall inside a rectangle of cells", async () => {
    const raster = await readBands();
    const counts = countClassesIn(raster, cellRectangle(10, 10, 20, 15), utmConverter(raster.epsg));
    const expected = [0, 0, 0, 0, 0];
    for (let row = 10; row < 15; row++) for (let col = 10; col < 20; col++) {
      const value = raster.classes[row * WIDTH + col]!;
      if (value > 0) expected[value - 1]!++;
    }
    expect(counts).toEqual(expected);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(50);
  });

  it("leaves a hole out, and skips cells that hold no data", async () => {
    const raster = await readBands();
    const converter = utmConverter(raster.epsg);
    const outer = cellRectangle(0, 0, 20, 20);
    const hole = cellRectangle(5, 5, 15, 15).coordinates[0]!;
    const withHole = { type: "Polygon" as const, coordinates: [outer.coordinates[0]!, hole] };
    const whole = countClassesIn(raster, outer, converter);
    const inHole = countClassesIn(raster, cellRectangle(5, 5, 15, 15), converter);
    const ring = countClassesIn(raster, withHole, converter);
    expect(ring).toEqual(whole.map((n, i) => n - inHole[i]!));
    // The no-data corner (5 x 5) and the no-data column (col 30, outside this area) don't count.
    expect(whole.reduce((a, b) => a + b, 0)).toBe(20 * 20 - 25);
  });

  it("adds up the parts of a multipolygon, and marks the cells it covers", async () => {
    const raster = await readBands();
    const converter = utmConverter(raster.epsg);
    const a = cellRectangle(10, 20, 14, 24).coordinates;
    const b = cellRectangle(40, 20, 44, 24).coordinates;
    const covered = new Uint8Array(raster.classes.length);
    const counts = countClassesIn(raster, { type: "MultiPolygon", coordinates: [a, b] }, converter, covered);
    expect(counts.reduce((x, y) => x + y, 0)).toBe(32);
    expect(covered.reduce((x, y) => x + y, 0)).toBe(32);
    expect(covered[20 * WIDTH + 10]).toBe(1);
    expect(covered[20 * WIDTH + 14]).toBe(0);
  });

  it("counts nothing for an area the map doesn't reach", async () => {
    const raster = await readBands();
    expect(countClassesIn(raster, cellRectangle(200, 200, 210, 210), utmConverter(raster.epsg))).toEqual([0, 0, 0, 0, 0]);
  });

  it("gives each cell to one of two neighbouring areas, never both", async () => {
    const raster = await readBands();
    const converter = utmConverter(raster.epsg);
    const left = countClassesIn(raster, cellRectangle(10, 20, 25, 30), converter);
    const right = countClassesIn(raster, cellRectangle(25, 20, 40, 30), converter);
    const both = countClassesIn(raster, cellRectangle(10, 20, 40, 30), converter);
    expect(left.map((n, i) => n + right[i]!)).toEqual(both);
  });
});

describe("the figures of an area", () => {
  it("works out the share that is high or very high, and the mean class", () => {
    expect(percentHighOf([10, 10, 10, 10, 10])).toBe(40);
    expect(percentHighOf([0, 0, 0, 0, 0])).toBeNull();
    expect(percentHighOf([0, 0, 0, 1, 2])).toBe(100);
    expect(meanClassOf([0, 0, 0, 0, 4])).toBe(5);
    expect(meanClassOf([1, 0, 0, 0, 1])).toBe(3);
    expect(meanClassOf([0, 0, 0, 0, 0])).toBeNull();
  });
});
