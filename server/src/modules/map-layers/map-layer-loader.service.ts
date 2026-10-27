import { ValidationError } from "../../common/errors/app-error";
import type { BBox } from "../../common/geo/geo";
import { CountryRepository } from "../admin-units/country.repository";
import type { ICountryRepository } from "../admin-units/country.types";
import { readGeoPackage } from "./gpkg-reader";
import { parseLayerGeoJson, prepareInfrastructure, prepareRoads, prepareSettlements, prepareWaterways, type LayerFeature } from "./map-layer-rows";
import { findEntry, openLayerZip, sourceFromEntry } from "./map-layer-provenance";
import { MapLayerLoadRepository } from "./map-layer-load.repository";
import { facilityFiles } from "./osm-extract";
import type {
  BatchResult,
  ILayerLoadStore,
  LayerLoadTx,
  NewLayerSource,
  PreparedRows,
  RejectCounts,
} from "./map-layer-loader.types";

/** Rows per database statement: about half a megabyte of GeoJSON, well inside any limit. */
export const LOAD_BATCH_SIZE = 1_000;

export interface LoadRequest {
  countryCode: string;
  /** The admin level that holds wards (3 for Nigeria): where each settlement's ward code is looked up. */
  wardLevel: number;
  /** A delivery zip: provenance.json beside the roads, waterways and waterway-polygon files. */
  zip?: Buffer;
  /** A standalone roads GeoJSON file, with the id of the data source already recorded for it. */
  roads?: { fileName: string; buffer: Buffer; sourceId: string };
  /** A standalone waterways (lines or polygons) GeoJSON file, with the id of the data source already recorded for it. */
  waterways?: { fileName: string; buffer: Buffer; sourceId: string };
  /** The GRID3 settlement-names file, with the id of the data source already recorded for it. */
  settlements?: { fileName: string; buffer: Buffer; sourceId: string };
  /**
   * Geofabrik's OpenStreetMap extract (the zipped folder of GeoPackages, or one facility .gpkg),
   * with the id of the data source already recorded for it. Only the facility files are read.
   */
  infrastructure?: { fileName: string; buffer: Buffer; sourceId: string };
  /** Run every step, then roll the transaction back, so nothing is kept. */
  dryRun: boolean;
}

export interface LayerReport {
  layer: "roads" | "waterways" | "waterway areas" | "settlements" | "infrastructure";
  file: string;
  /** The data source the rows point at, and whether this run had to record it. */
  sourceId: string | null;
  sourceCreated: boolean;
  featuresInFile: number;
  /** Rows left out before the database saw them, and rows PostGIS refused, by reason. */
  rejected: RejectCounts;
  inserted: number;
  alreadyPresent: number;
  relinked: number;
  unlinked: number;
}

export interface LoadReport {
  dryRun: boolean;
  layers: LayerReport[];
}

/** The layers layers:clear can remove. */
export const CLEARABLE_LAYERS = ["roads", "waterways", "settlements", "infrastructure"] as const;
export type ClearableLayer = (typeof CLEARABLE_LAYERS)[number];

export interface ClearRequest {
  countryCode: string;
  layers: ClearableLayer[];
  /** Delete, count, then roll back, so nothing is removed. */
  dryRun: boolean;
}

export interface ClearReport {
  dryRun: boolean;
  /** How many rows each layer lost (or would lose, on a dry run). */
  deleted: Partial<Record<ClearableLayer, number>>;
}

/** Thrown after a dry run's last step so the transaction rolls back; never leaves this file. */
class DryRunRollback extends Error {}

interface LayerPlan {
  layer: LayerReport["layer"];
  file: string;
  featuresInFile: number;
  prepared: PreparedRows<unknown>;
  /** The source to record, or the id of one that already exists. */
  source: { record: NewLayerSource } | { existingId: string };
  /** The request field (and script flag) naming an existing source, for the error when it doesn't exist. */
  sourceField: string;
  insert(tx: LayerLoadTx, sourceId: string): Promise<BatchResult>;
}

/**
 * Loads the data team's roads, waterways and settlement files into PostGIS (npm run
 * layers:load). Everything is read and checked before the database is touched; every write then
 * happens in one transaction, so a failure leaves the database exactly as it was. Loading a file
 * twice is harmless: rows already stored are counted and left alone, never overwritten.
 */
export class MapLayerLoaderService {
  private static _instance?: MapLayerLoaderService;
  static get Instance(): MapLayerLoaderService {
    return (this._instance ??= new MapLayerLoaderService(MapLayerLoadRepository.Instance, CountryRepository.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly store: ILayerLoadStore,
    private readonly countries: Pick<ICountryRepository, "findByCode">,
  ) {}

  async load(request: LoadRequest): Promise<LoadReport> {
    if (!request.zip && !request.roads && !request.waterways && !request.settlements && !request.infrastructure) {
      throw new ValidationError([
        { message: "Nothing to load: give a delivery zip, a roads file, a waterways file, a settlements file, an OpenStreetMap extract for infrastructure, or a combination." },
      ]);
    }
    const country = await this.countries.findByCode(request.countryCode);
    if (!country) {
      throw new ValidationError([
        { field: "country", message: `No country with code ${request.countryCode}. Create it on the Countries page first.` },
      ]);
    }
    const bbox: BBox | null = country.bbox && country.bbox.length === 4 ? (country.bbox as BBox) : null;

    // Read and check every file first: a bad file fails here, with the database untouched.
    const plans = [
      ...this.zipPlans(request, country.countryCode, bbox),
      ...this.roadPlans(request, country.countryCode, bbox),
      ...this.waterwayPlans(request, country.countryCode, bbox),
      ...this.settlementPlans(request, country.countryCode, bbox),
      ...(await this.infrastructurePlans(request, country.countryCode, bbox)),
    ];
    const report: LoadReport = { dryRun: request.dryRun, layers: [] };

    try {
      await this.store.inTransaction(async (tx) => {
        for (const plan of plans) report.layers.push(await this.run(tx, plan));
        if (request.dryRun) throw new DryRunRollback();
      });
    } catch (err) {
      if (!(err instanceof DryRunRollback)) throw err;
    }
    return report;
  }

  /**
   * Removes a country's roads, waterways or infrastructure (npm run layers:clear), so a layer can be loaded
   * again from scratch, or the country deleted (its foreign keys refuse while they exist). One
   * transaction. Data source records are kept: other rows, or the history, may still cite them.
   * Settlements are not touched: they belong to wards, not to the country.
   */
  async clear(request: ClearRequest): Promise<ClearReport> {
    const layers = [...new Set(request.layers)];
    if (layers.length === 0) {
      throw new ValidationError([{ field: "layers", message: `Name at least one layer to clear: ${CLEARABLE_LAYERS.join(", ")}.` }]);
    }
    const country = await this.countries.findByCode(request.countryCode);
    if (!country) {
      throw new ValidationError([{ field: "country", message: `No country with code ${request.countryCode}.` }]);
    }

    const report: ClearReport = { dryRun: request.dryRun, deleted: {} };
    try {
      await this.store.inTransaction(async (tx) => {
        for (const layer of layers) {
          report.deleted[layer] = await deleteLayer(tx, layer, country.countryCode);
        }
        if (request.dryRun) throw new DryRunRollback();
      });
    } catch (err) {
      if (!(err instanceof DryRunRollback)) throw err;
    }
    return report;
  }

  private async run(tx: LayerLoadTx, plan: LayerPlan): Promise<LayerReport> {
    let sourceId: string;
    let sourceCreated = false;
    if ("existingId" in plan.source) {
      if (!(await tx.sourceExists(plan.source.existingId))) {
        throw new ValidationError([
          {
            field: plan.sourceField,
            message: `No data source with id ${plan.source.existingId}. Add the ${plan.layer} file's source on Imports > Add a source first, then pass its id.`,
          },
        ]);
      }
      sourceId = plan.source.existingId;
    } else {
      const ensured = await tx.ensureSource(plan.source.record);
      sourceId = ensured.id;
      sourceCreated = ensured.created;
    }

    const total = await plan.insert(tx, sourceId);
    return {
      layer: plan.layer,
      file: plan.file,
      sourceId,
      sourceCreated,
      featuresInFile: plan.featuresInFile,
      rejected: mergeCounts(plan.prepared.rejected, total.rejected),
      inserted: total.inserted,
      alreadyPresent: total.alreadyPresent,
      relinked: total.relinked,
      unlinked: total.unlinked,
    };
  }

  private zipPlans(request: LoadRequest, countryCode: string, bbox: BBox | null): LayerPlan[] {
    if (!request.zip) return [];
    const zip = openLayerZip(request.zip);
    const clippedWith = zip.entries.find((entry) => entry.layer === "state_boundary") ?? null;
    const plan = <T>(
      layer: "roads" | "waterways" | "waterway_polygons",
      label: LayerPlan["layer"],
      prepare: (features: LayerFeature[]) => PreparedRows<T>,
      insert: (tx: LayerLoadTx, rows: T[], context: { countryCode: string; bbox: BBox | null; sourceId: string }) => Promise<BatchResult>,
    ): LayerPlan => {
      const entry = findEntry(zip.entries, layer);
      const features = parseLayerGeoJson(zip.read(entry.file), entry.file);
      const prepared = prepare(features);
      return {
        layer: label,
        file: entry.file,
        featuresInFile: features.length,
        prepared,
        source: { record: sourceFromEntry(entry, clippedWith) },
        sourceField: "zip",
        insert: (tx, sourceId) => inBatches(prepared.rows, (batch) => insert(tx, batch, { countryCode, bbox, sourceId })),
      };
    };

    return [
      plan("roads", "roads", prepareRoads, (tx, rows, context) => tx.insertRoads(rows, context)),
      plan("waterways", "waterways", prepareWaterways, (tx, rows, context) => tx.insertWaterways(rows, context)),
      plan("waterway_polygons", "waterway areas", prepareWaterways, (tx, rows, context) => tx.insertWaterways(rows, context)),
    ];
  }

  private roadPlans(request: LoadRequest, countryCode: string, bbox: BBox | null): LayerPlan[] {
    const file = request.roads;
    if (!file) return [];
    const features = parseLayerGeoJson(file.buffer, file.fileName);
    const prepared = prepareRoads(features);
    return [
      {
        layer: "roads",
        file: file.fileName,
        featuresInFile: features.length,
        prepared,
        source: { existingId: file.sourceId },
        sourceField: "roads-source",
        insert: (tx, sourceId) =>
          inBatches(prepared.rows, (batch) => tx.insertRoads(batch, { countryCode, bbox, sourceId })),
      },
    ];
  }

  private waterwayPlans(request: LoadRequest, countryCode: string, bbox: BBox | null): LayerPlan[] {
    const file = request.waterways;
    if (!file) return [];
    const features = parseLayerGeoJson(file.buffer, file.fileName);
    const prepared = prepareWaterways(features);
    return [
      {
        layer: "waterways",
        file: file.fileName,
        featuresInFile: features.length,
        prepared,
        source: { existingId: file.sourceId },
        sourceField: "waterways-source",
        insert: (tx, sourceId) =>
          inBatches(prepared.rows, (batch) => tx.insertWaterways(batch, { countryCode, bbox, sourceId })),
      },
    ];
  }

  private settlementPlans(request: LoadRequest, countryCode: string, bbox: BBox | null): LayerPlan[] {
    const file = request.settlements;
    if (!file) return [];
    const features = parseLayerGeoJson(file.buffer, file.fileName);
    const prepared = prepareSettlements(features);
    return [
      {
        layer: "settlements",
        file: file.fileName,
        featuresInFile: features.length,
        prepared,
        source: { existingId: file.sourceId },
        sourceField: "settlements-source",
        insert: (tx, sourceId) =>
          inBatches(prepared.rows, (batch) =>
            tx.insertSettlements(batch, { countryCode, bbox, sourceId, wardLevel: request.wardLevel }),
          ),
      },
    ];
  }

  /** One plan per facility GeoPackage (points of interest, places of worship, transport; points and areas). */
  private async infrastructurePlans(request: LoadRequest, countryCode: string, bbox: BBox | null): Promise<LayerPlan[]> {
    const upload = request.infrastructure;
    if (!upload) return [];
    const plans: LayerPlan[] = [];
    for (const file of facilityFiles(upload.buffer, upload.fileName)) {
      const features = await readGeoPackage(file.buffer, file.fileName);
      const prepared = prepareInfrastructure(features);
      plans.push({
        layer: "infrastructure",
        file: file.fileName,
        featuresInFile: features.length,
        prepared,
        source: { existingId: upload.sourceId },
        sourceField: "infrastructure-source",
        insert: (tx, sourceId) =>
          inBatches(prepared.rows, (batch) =>
            tx.insertInfrastructure(batch, { countryCode, bbox, sourceId, wardLevel: request.wardLevel }),
          ),
      });
    }
    return plans;
  }
}

function deleteLayer(tx: LayerLoadTx, layer: ClearableLayer, countryCode: string): Promise<number> {
  switch (layer) {
    case "roads":
      return tx.deleteRoads(countryCode);
    case "waterways":
      return tx.deleteWaterways(countryCode);
    case "settlements":
      return tx.deleteSettlements();
    case "infrastructure":
      return tx.deleteInfrastructure(countryCode);
  }
}

/** Sends rows in batches and adds the batches' results together. */
async function inBatches<T>(rows: T[], insert: (batch: T[]) => Promise<BatchResult>): Promise<BatchResult> {
  const total: BatchResult = { received: 0, inserted: 0, alreadyPresent: 0, relinked: 0, unlinked: 0, rejected: {} };
  for (let start = 0; start < rows.length; start += LOAD_BATCH_SIZE) {
    const result = await insert(rows.slice(start, start + LOAD_BATCH_SIZE));
    total.received += result.received;
    total.inserted += result.inserted;
    total.alreadyPresent += result.alreadyPresent;
    total.relinked += result.relinked;
    total.unlinked += result.unlinked;
    total.rejected = mergeCounts(total.rejected, result.rejected);
  }
  return total;
}

function mergeCounts(a: RejectCounts, b: RejectCounts): RejectCounts {
  const merged: RejectCounts = { ...a };
  for (const [reason, count] of Object.entries(b)) merged[reason] = (merged[reason] ?? 0) + count;
  return merged;
}
