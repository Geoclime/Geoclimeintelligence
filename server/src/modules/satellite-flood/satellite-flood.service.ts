import type { AuthUser } from "../../common/access/auth-user";
import { NotFoundError, UnprovenDataError, ValidationError } from "../../common/errors/app-error";
import type { BBox } from "../../common/geo/geo";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import { toRef, type IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { CountryRepository } from "../admin-units/country.repository";
import type { ICountryRepository } from "../admin-units/country.types";
import { DataSourceRepository } from "../data-sources/data-source.repository";
import { toDataSourceDto, type DataSourceDto, type IDataSourceRepository } from "../data-sources/data-source.types";
import { ImportRepository } from "../data-sources/imports/import.repository";
import type { IImportRepository, ImportRunDto, StagedRowInput, UploadedFile } from "../data-sources/imports/import.types";
import { readFloodTiles } from "./mbtiles-reader";
import { buildMaskImage, imagePixelMetres, measureWater, waterKm2 } from "./measure";
import { SatelliteFloodRepository } from "./satellite-flood.repository";
import {
  WATER_COLOUR,
  type AreaSatelliteFloodDto,
  type ISatelliteFloodRepository,
  type SatelliteFloodLayerDto,
  type SatelliteFloodLayerRecord,
  type SatelliteFloodListDto,
  type SatelliteFloodStagedFields,
} from "./satellite-flood.types";
import type { StartSatelliteFloodImportBody } from "./satellite-flood.validation";

/** The tiles have to line up with the areas: covering less than this share of the LGAs means the wrong state or file. */
const COVERAGE_FAILS = 0.5;
/** An area (or the LGAs together) covered less than this gets a warning. */
const COVERAGE_WARNS = 0.95;

const yieldToServer = () => new Promise<void>((resolve) => setImmediate(resolve));
const percent = (part: number, whole: number) => (whole <= 0 ? 0 : Math.round((part / whole) * 1e4) / 100);
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const km2Text = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 1 });

function thisMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Monthly flood extent seen from space: importing it (file -> measure -> staged, like every other
 * import) and reading it back. Like the flood risk map, live months are shared reference data for
 * every signed-in user; staged months, waiting for review, are the administrator's alone.
 */
export class SatelliteFloodService {
  private static _instance?: SatelliteFloodService;
  static get Instance(): SatelliteFloodService {
    return (this._instance ??= new SatelliteFloodService(
      SatelliteFloodRepository.Instance,
      ImportRepository.Instance,
      CountryRepository.Instance,
      DataSourceRepository.Instance,
      AdminUnitRepository.Instance,
    ));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly layers: ISatelliteFloodRepository,
    private readonly imports: Pick<IImportRepository, "createCheckedRun">,
    private readonly countries: Pick<ICountryRepository, "findByCode">,
    private readonly sources: Pick<IDataSourceRepository, "findById">,
    private readonly units: Pick<IAdminUnitRepository, "findSummaryById">,
  ) {}

  /**
   * Creates a run from one month's tiles: stitches them into a mask, measures the water inside every
   * live LGA and ward, and leaves it all staged for review. Nothing is live until the run is
   * promoted, like every import.
   */
  async startImport(file: UploadedFile, input: StartSatelliteFloodImportBody, actor: AuthUser): Promise<ImportRunDto> {
    if (!(await this.sources.findById(input.sourceId))) throw new UnprovenDataError();

    const country = await this.countries.findByCode(input.countryCode);
    if (!country) {
      throw new ValidationError([{ field: "countryCode", message: `No country with code ${input.countryCode}. Create it on the Countries page first.` }]);
    }
    const areas = await this.layers.findAreasToMeasure(country.countryCode);
    if (areas.length === 0) {
      throw new ValidationError([
        { field: "countryCode", message: `${country.countryName} has no LGAs live yet. The water is measured per LGA and ward: import and promote them first.` },
      ]);
    }

    const { info, mosaic, notes } = await readFloodTiles(file.buffer, file.originalName);

    // The month: from the form if given, else from the file's name. If both say, they must agree.
    if (input.yearMonth && info.yearMonth && input.yearMonth !== info.yearMonth) {
      throw new ValidationError([
        { field: "yearMonth", message: `The file is for ${info.yearMonth} (from its name), but ${input.yearMonth} was entered. Leave the month blank, or check the file.` },
      ]);
    }
    const yearMonth = input.yearMonth ?? info.yearMonth;
    if (!yearMonth) {
      throw new ValidationError([
        { field: "yearMonth", message: "Which month is this? Neither the file nor its name says (such as s1_flood_2016_08.mbtiles): enter it as YYYY-MM." },
      ]);
    }
    if (yearMonth > thisMonth()) throw new ValidationError([{ field: "yearMonth", message: `${yearMonth} is in the future.` }]);

    const countryBox = country.bbox && country.bbox.length === 4 ? (country.bbox as BBox) : null;
    const warnings: string[] = [];
    const [west, south, east, north] = mosaic.bounds;
    if (countryBox) {
      if (east < countryBox[0] || west > countryBox[2] || north < countryBox[1] || south > countryBox[3]) {
        throw new ValidationError([{ field: "file", message: `The tiles lie outside ${country.countryName}'s bounding box: is it the right country?` }]);
      }
    } else {
      warnings.push(`${country.countryName} has no rough bounding box, so the tiles' position was not checked against it. Add one on the country's edit page.`);
    }

    // Measure the water inside every area; mark the pixels the top level (LGAs) covers.
    const topLevel = Math.min(...areas.map((area) => area.level));
    const covered = new Uint8Array(mosaic.mask.length);
    const rows: StagedRowInput<SatelliteFloodStagedFields>[] = [];
    let topFlooded = 0;
    let topMeasured = 0;
    let topArea = 0;
    for (const [index, area] of areas.entries()) {
      const water = measureWater(mosaic, area.geometry, area.level === topLevel ? covered : undefined);
      if (area.level === topLevel) {
        topFlooded += water.floodedKm2;
        topMeasured += water.measuredKm2;
        topArea += area.areaKm2;
      }
      const coverage = area.areaKm2 > 0 ? water.measuredKm2 / area.areaKm2 : 0;
      const rowWarnings =
        water.measuredKm2 === 0
          ? ["The tiles don't reach this area, so nothing was measured here."]
          : coverage < COVERAGE_WARNS
            ? [`The tiles cover only ${percent(water.measuredKm2, area.areaKm2)}% of this area; the share flooded is of that part.`]
            : [];
      rows.push({
        rowNumber: index + 1,
        raw: { area: area.unitName, level: area.levelName, parent: area.parentName, month: yearMonth },
        geomSource: null,
        geomFormat: null,
        fields: {
          adminUnitId: area.id,
          unitName: area.unitName,
          unitCode: area.unitCode,
          levelName: area.levelName,
          parentName: area.parentName,
          yearMonth,
          floodedKm2: water.floodedKm2,
          measuredKm2: water.measuredKm2,
          areaKm2: round3(area.areaKm2),
          percentFlooded: water.measuredKm2 > 0 ? percent(water.floodedKm2, water.measuredKm2) : null,
        },
        errors: [],
        warnings: rowWarnings,
      });
      if (index % 8 === 7) await yieldToServer();
    }

    const topName = areas.find((area) => area.level === topLevel)?.levelName ?? "area";
    const coverage = topArea > 0 ? topMeasured / topArea : 0;
    if (coverage < COVERAGE_FAILS) {
      throw new ValidationError([
        {
          field: "file",
          message: `The tiles cover only ${percent(topMeasured, topArea)}% of ${country.countryName}'s ${topName}s, so they don't line up with the boundaries. Check that it is the right state.`,
        },
      ]);
    }
    if (coverage < COVERAGE_WARNS) {
      warnings.push(`The tiles cover ${percent(topMeasured, topArea)}% of the ${topName}s; the rest was not seen, and is not counted as dry.`);
    }

    const allWater = waterKm2(mosaic);
    const outside = round3(Math.max(0, allWater - topFlooded));
    if (outside > 0) {
      warnings.push(
        `${km2Text(outside)} km² of the water in the tiles lies outside every ${topName} (the sea, or neighbouring states inside the tiles' rectangle). ` +
          "It is drawn on the map but not counted in any area.",
      );
    }
    const image = await buildMaskImage(mosaic);
    warnings.unshift(
      `Read ${info.tileCount.toLocaleString("en")} tiles at zoom ${info.readZoom} (about ${imagePixelMetres(mosaic, mosaic.width)} m a pixel) for ${yearMonth}: ` +
        `${km2Text(topFlooded)} km² of water inside the ${topName}s (${percent(topFlooded, topMeasured)}% of the part covered), measured in ${areas.length} areas.`,
      "Water here is everything the radar saw as open water that month, including rivers, creeks and other permanent water, not only floods.",
      ...notes,
    );

    const live = (await this.layers.findLiveByCountry(country.countryCode)).find((layer) => layer.yearMonth === yearMonth);
    if (live) warnings.push(`${yearMonth} is already live (imported ${live.createdAt.toISOString().slice(0, 10)}). Promoting this run replaces it.`);

    const title = (input.title ?? info.name ?? file.originalName.replace(/\.[^.]+$/, "")).slice(0, 200);
    return this.imports.createCheckedRun(
      {
        target: "satellite_flood_layers",
        fileName: file.originalName.slice(0, 255),
        fileType: "mbtiles",
        sheetName: null,
        options: { countryCode: country.countryCode, dataType: "DERIVED", title, yearMonth },
        columnMapping: {},
        sourceId: input.sourceId,
        createdBy: actor.id,
        warnings,
      },
      rows,
      null,
      {
        kind: "satellite_flood",
        countryCode: country.countryCode,
        sourceId: input.sourceId,
        yearMonth,
        title,
        zoom: mosaic.zoom,
        image,
        floodedKm2: round3(topFlooded),
        coveredKm2: round3(Math.max(topMeasured, topFlooded)),
        createdBy: actor.id,
      },
    );
  }

  /** Every live month of the country, newest first; an empty list when none has been promoted. */
  async live(countryCode: string): Promise<SatelliteFloodListDto> {
    const layers = await this.layers.findLiveByCountry(countryCode);
    const sources = new Map<string, DataSourceDto>();
    const months: SatelliteFloodLayerDto[] = [];
    for (const layer of layers) months.push(await this.toDto(layer, sources));
    return { countryCode, months };
  }

  /** The month an import run staged (or made live), for the review screen. */
  async forRun(runId: string): Promise<SatelliteFloodLayerDto> {
    const layer = await this.layers.findByRunId(runId);
    if (!layer) throw new NotFoundError("Satellite flood month for this import");
    return this.toDto(layer);
  }

  /** The picture. A live month is for everyone signed in; a staged or retired one only for administrators. */
  async image(layerId: string, actor: AuthUser): Promise<Buffer> {
    const layer = await this.layers.findLayerById(layerId);
    if (!layer || (layer.status !== "live" && actor.role !== "administrator")) throw new NotFoundError("Satellite flood month");
    const png = await this.layers.findImage(layerId);
    if (!png) throw new NotFoundError("Satellite flood month");
    return png;
  }

  /** One LGA's or ward's live months, oldest first; an empty list when none were measured. */
  async area(adminUnitId: string): Promise<AreaSatelliteFloodDto> {
    const unit = await this.units.findSummaryById(adminUnitId);
    if (!unit) throw new NotFoundError("Admin unit");
    return { adminUnit: toRef(unit), months: await this.layers.findAreaMonths(adminUnitId) };
  }

  private async toDto(layer: SatelliteFloodLayerRecord, cache = new Map<string, DataSourceDto>()): Promise<SatelliteFloodLayerDto> {
    let source = cache.get(layer.sourceId);
    if (!source) {
      const record = await this.sources.findById(layer.sourceId);
      if (!record) throw new UnprovenDataError();
      source = toDataSourceDto(record);
      cache.set(layer.sourceId, source);
    }
    return {
      id: layer.id,
      countryCode: layer.countryCode,
      status: layer.status,
      dataType: layer.dataType,
      yearMonth: layer.yearMonth,
      title: layer.title,
      coordinates: [
        [layer.west, layer.north],
        [layer.east, layer.north],
        [layer.east, layer.south],
        [layer.west, layer.south],
      ],
      image: { width: layer.imageWidth, height: layer.imageHeight },
      zoom: layer.zoom,
      pixelMetres: pixelMetresOf(layer),
      colour: WATER_COLOUR,
      floodedKm2: layer.floodedKm2,
      coveredKm2: layer.coveredKm2,
      percentFlooded: percent(layer.floodedKm2, layer.coveredKm2),
      source,
      promotedAt: layer.promotedAt ? layer.promotedAt.toISOString() : null,
      createdAt: layer.createdAt.toISOString(),
    };
  }
}

/** About how many metres a pixel of the stored picture is, at its middle latitude. */
function pixelMetresOf(layer: SatelliteFloodLayerRecord): number {
  const middle = ((layer.south + layer.north) / 2) * (Math.PI / 180);
  const metresAcross = ((layer.east - layer.west) / 360) * 2 * Math.PI * 6378137 * Math.cos(middle);
  return Math.round((metresAcross / layer.imageWidth) * 10) / 10;
}
