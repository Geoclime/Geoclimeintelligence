import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import type { AuthUser } from "../../common/access/auth-user";
import { NotFoundError, UnprovenDataError, ValidationError } from "../../common/errors/app-error";
import type { BBox } from "../../common/geo/geo";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import { toRef, type IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { CountryRepository } from "../admin-units/country.repository";
import type { ICountryRepository } from "../admin-units/country.types";
import { DataSourceRepository } from "../data-sources/data-source.repository";
import { toDataSourceDto, type IDataSourceRepository } from "../data-sources/data-source.types";
import { ImportRepository } from "../data-sources/imports/import.repository";
import type { IImportRepository, ImportRunDto, StagedRowInput, UploadedFile } from "../data-sources/imports/import.types";
import { readClassRaster } from "./geotiff-reader";
import {
  FLOOD_RISK_CLASSES,
  type AreaFloodRiskDto,
  type FloodRiskClassDto,
  type FloodRiskLayerDto,
  type FloodRiskLayerRecord,
  type FloodRiskPointDto,
  type FloodRiskStagedFields,
  type IFloodRiskRepository,
} from "./flood-risk.types";
import type { AtPointQuery, StartFloodRiskImportBody } from "./flood-risk.validation";
import { FloodRiskRepository } from "./flood-risk.repository";
import { buildOverlay } from "./overlay-image";
import { dataBounds, utmConverter } from "./raster-projection";
import { countClassesIn, meanClassOf, percentHighOf, totalOf } from "./zonal-stats";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** A map has to line up with the areas: more than this share outside every LGA means a wrong CRS or the wrong state. */
const OUTSIDE_FAILS = 0.5;
const OUTSIDE_WARNS = 0.05;

const yieldToServer = () => new Promise<void>((resolve) => setImmediate(resolve));
const km2 = (cells: number, cellSize: number) => Math.round(((cells * cellSize * cellSize) / 1e6) * 100) / 100;
const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1e4) / 100);

/**
 * The flood risk map: importing it (file -> measure -> staged, like every other import) and reading
 * it back. Like the areas it is drawn over, the live map is shared reference data for every signed-in
 * user. Staged maps, waiting for review, are the administrator's alone.
 */
export class FloodRiskService {
  private static _instance?: FloodRiskService;
  static get Instance(): FloodRiskService {
    return (this._instance ??= new FloodRiskService(
      FloodRiskRepository.Instance,
      ImportRepository.Instance,
      CountryRepository.Instance,
      DataSourceRepository.Instance,
      AdminUnitRepository.Instance,
    ));
  }

  /** The grid of the layer last asked about, kept so a click doesn't unzip two megabytes each time. */
  private gridCache?: { layerId: string; classes: Uint8Array };

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly layers: IFloodRiskRepository,
    private readonly imports: Pick<IImportRepository, "createCheckedRun">,
    private readonly countries: Pick<ICountryRepository, "findByCode">,
    private readonly sources: Pick<IDataSourceRepository, "findById">,
    private readonly units: Pick<IAdminUnitRepository, "findSummaryById">,
  ) {}

  /**
   * Creates a run from a classified GeoTIFF: reads it, counts the cells of each class inside every
   * live LGA and ward, draws the picture, and leaves it all staged for review. Nothing is live until
   * the run is promoted, like every import.
   */
  async startImport(file: UploadedFile, input: StartFloodRiskImportBody, actor: AuthUser): Promise<ImportRunDto> {
    if (!(await this.sources.findById(input.sourceId))) throw new UnprovenDataError();

    const country = await this.countries.findByCode(input.countryCode);
    if (!country) {
      throw new ValidationError([{ field: "countryCode", message: `No country with code ${input.countryCode}. Create it on the Countries page first.` }]);
    }
    const areas = await this.layers.findAreasToMeasure(country.countryCode);
    if (areas.length === 0) {
      throw new ValidationError([
        { field: "countryCode", message: `${country.countryName} has no LGAs live yet. The map is measured per LGA and ward: import and promote them first.` },
      ]);
    }

    const raster = await readClassRaster(file.buffer);
    const converter = utmConverter(raster.epsg);
    const bounds = dataBounds(raster, converter);
    const countryBox = country.bbox && country.bbox.length === 4 ? (country.bbox as BBox) : null;
    const warnings: string[] = [];
    if (countryBox) {
      if (bounds[0] < countryBox[0] || bounds[1] < countryBox[1] || bounds[2] > countryBox[2] || bounds[3] > countryBox[3]) {
        throw new ValidationError([
          {
            field: "file",
            message: `The map lies outside ${country.countryName}'s bounding box. Check its coordinate system: is it the right country, and in the right UTM zone?`,
          },
        ]);
      }
    } else {
      warnings.push(`${country.countryName} has no rough bounding box, so the map's position was not checked against it. Add one on the country's edit page.`);
    }

    // Count the cells of each class inside every area; mark the cells the top level (LGAs) covers.
    const topLevel = Math.min(...areas.map((area) => area.level));
    const covered = new Uint8Array(raster.classes.length);
    const rows: StagedRowInput<FloodRiskStagedFields>[] = [];
    for (const [index, area] of areas.entries()) {
      const classCells = countClassesIn(raster, area.geometry, converter, area.level === topLevel ? covered : undefined);
      const totalCells = totalOf(classCells);
      rows.push({
        rowNumber: index + 1,
        raw: { area: area.unitName, level: area.levelName, parent: area.parentName },
        geomSource: null,
        geomFormat: null,
        fields: {
          adminUnitId: area.id,
          unitName: area.unitName,
          unitCode: area.unitCode,
          levelName: area.levelName,
          parentName: area.parentName,
          classCells,
          totalCells,
          percentHigh: percentHighOf(classCells),
          meanClass: meanClassOf(classCells),
        },
        errors: [],
        warnings: totalCells === 0 ? ["The map has no data inside this area (open water, or beyond the map's edge)."] : [],
      });
      if (index % 8 === 7) await yieldToServer();
    }

    const classified = totalOf(raster.classCells);
    let outside = 0;
    for (let i = 0; i < covered.length; i++) if (raster.classes[i]! > 0 && covered[i] === 0) outside++;
    const outsideShare = outside / classified;
    const topName = areas.find((area) => area.level === topLevel)?.levelName ?? "area";
    if (outsideShare > OUTSIDE_FAILS) {
      throw new ValidationError([
        {
          field: "file",
          message:
            `${percent(outside, classified)}% of the map's classified cells lie outside every ${topName}, so it does not line up with the boundaries. ` +
            "Check that it is the right state, and in the right coordinate system.",
        },
      ]);
    }
    if (outside > 0) {
      warnings.push(
        `${outside.toLocaleString("en")} classified cells (${percent(outside, classified)}%) lie outside every ${topName}` +
          (outsideShare > OUTSIDE_WARNS ? ": check the map's position on the review screen." : ", such as coast or border slivers."),
      );
    }
    warnings.unshift(
      `Read a ${raster.width.toLocaleString("en")} x ${raster.height.toLocaleString("en")} map of ${raster.cellSize} m cells (EPSG:${raster.epsg}): ` +
        `${km2(classified, raster.cellSize).toLocaleString("en")} km2 classified, measured in ${areas.length} areas.`,
    );

    const image = await buildOverlay(raster, converter);
    const title = (input.title ?? file.originalName.replace(/\.[^.]+$/, "")).slice(0, 200);
    return this.imports.createCheckedRun(
      {
        target: "flood_risk_layers",
        fileName: file.originalName.slice(0, 255),
        fileType: "geotiff",
        sheetName: null,
        options: { countryCode: country.countryCode, dataType: "DERIVED", title },
        columnMapping: {},
        sourceId: input.sourceId,
        createdBy: actor.id,
        warnings,
      },
      rows,
      null,
      {
        countryCode: country.countryCode,
        sourceId: input.sourceId,
        title,
        sourceCrs: `EPSG:${raster.epsg}`,
        cellSize: raster.cellSize,
        gridWidth: raster.width,
        gridHeight: raster.height,
        originE: raster.originE,
        originN: raster.originN,
        gridGz: await gzipAsync(raster.classes),
        classCells: raster.classCells,
        image,
        createdBy: actor.id,
      },
    );
  }

  /** The country's live map, or null when none has been promoted yet (so the screen shows no toggle for it). */
  async live(countryCode: string): Promise<FloodRiskLayerDto | null> {
    const layer = await this.layers.findLiveByCountry(countryCode);
    return layer ? this.toDto(layer) : null;
  }

  /** The map an import run staged (or made live), for the review screen. */
  async forRun(runId: string): Promise<FloodRiskLayerDto> {
    const layer = await this.layers.findByRunId(runId);
    if (!layer) throw new NotFoundError("Flood risk map for this import");
    return this.toDto(layer);
  }

  /** The picture. A live map is for everyone signed in; a staged or retired one only for administrators. */
  async image(layerId: string, actor: AuthUser): Promise<Buffer> {
    const layer = await this.layers.findLayerById(layerId);
    if (!layer || (layer.status !== "live" && actor.role !== "administrator")) throw new NotFoundError("Flood risk map");
    const png = await this.layers.findImage(layerId);
    if (!png) throw new NotFoundError("Flood risk map");
    return png;
  }

  /** How at risk one LGA or ward is, in the live map; null when the area wasn't measured or there is no live map. */
  async area(adminUnitId: string): Promise<AreaFloodRiskDto | null> {
    const unit = await this.units.findSummaryById(adminUnitId);
    if (!unit) throw new NotFoundError("Admin unit");
    const layer = await this.layers.findLiveByCountry(unit.countryCode);
    if (!layer) return null;

    const figures = await this.layers.findFiguresAtLevel(layer.id, unit.level);
    const own = figures.find((f) => f.adminUnitId === adminUnitId);
    if (!own) return null;
    const total = totalOf(own.classCells);
    if (total === 0) return null;

    const high = percentHighOf(own.classCells) ?? 0;
    const peers = figures.filter((f) => totalOf(f.classCells) > 0);
    return {
      layerId: layer.id,
      adminUnit: toRef(unit),
      totalAreaKm2: km2(total, layer.cellSizeM),
      classes: FLOOD_RISK_CLASSES.map((risk, i) => ({
        ...risk,
        areaKm2: km2(own.classCells[i]!, layer.cellSizeM),
        percent: percent(own.classCells[i]!, total),
      })),
      percentHighOrVeryHigh: high,
      meanClass: meanClassOf(own.classCells) ?? 0,
      rank: { position: 1 + peers.filter((f) => (percentHighOf(f.classCells) ?? 0) > high).length, of: peers.length },
    };
  }

  /** The class under a point in the country's live map; null when there is no live map. */
  async at(query: AtPointQuery): Promise<FloodRiskPointDto | null> {
    const layer = await this.layers.findLiveByCountry(query.countryCode);
    if (!layer) return null;
    const classes = await this.gridOf(layer);
    const [easting, northing] = utmConverter(Number(layer.sourceCrs.replace("EPSG:", ""))).toUtm([query.lon, query.lat]);
    const col = Math.floor((easting - layer.originE) / layer.cellSizeM);
    const row = Math.floor((layer.originN - northing) / layer.cellSizeM);
    const inside = col >= 0 && col < layer.gridWidth && row >= 0 && row < layer.gridHeight;
    const value = inside ? classes[row * layer.gridWidth + col]! : 0;
    const risk = FLOOD_RISK_CLASSES.find((c) => c.value === value);
    return { layerId: layer.id, class: risk ? { value: risk.value, label: risk.label, color: risk.color } : null };
  }

  private async gridOf(layer: FloodRiskLayerRecord): Promise<Uint8Array> {
    if (this.gridCache?.layerId === layer.id) return this.gridCache.classes;
    const gz = await this.layers.findGrid(layer.id);
    if (!gz) throw new NotFoundError("Flood risk map");
    const classes = new Uint8Array(await gunzipAsync(gz));
    this.gridCache = { layerId: layer.id, classes };
    return classes;
  }

  private async toDto(layer: FloodRiskLayerRecord): Promise<FloodRiskLayerDto> {
    const source = await this.sources.findById(layer.sourceId);
    if (!source) throw new UnprovenDataError();
    const classes: FloodRiskClassDto[] = FLOOD_RISK_CLASSES.map((risk, i) => ({ ...risk, areaKm2: km2(layer.classCells[i]!, layer.cellSizeM) }));
    return {
      id: layer.id,
      countryCode: layer.countryCode,
      status: layer.status,
      dataType: layer.dataType,
      title: layer.title,
      coordinates: [
        [layer.west, layer.north],
        [layer.east, layer.north],
        [layer.east, layer.south],
        [layer.west, layer.south],
      ],
      image: { width: layer.imageWidth, height: layer.imageHeight },
      cellSizeMetres: layer.cellSizeM,
      sourceCrs: layer.sourceCrs,
      classes,
      totalAreaKm2: Math.round(classes.reduce((sum, c) => sum + c.areaKm2, 0) * 100) / 100,
      source: toDataSourceDto(source),
      promotedAt: layer.promotedAt ? layer.promotedAt.toISOString() : null,
      createdAt: layer.createdAt.toISOString(),
    };
  }
}
