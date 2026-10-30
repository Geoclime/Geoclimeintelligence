import { NotFoundError } from "../../common/errors/app-error";
import type { BBox } from "../../common/geo/geo";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import { AdminUnitService } from "../admin-units/admin-unit.service";
import { toRef, type AdminUnitRef, type IAdminUnitRepository, type LocateResult } from "../admin-units/admin-unit.types";
import { DataSourceRepository } from "../data-sources/data-source.repository";
import type { IDataSourceRepository } from "../data-sources/data-source.types";
import { SettlementPointRepository } from "../map-layers/settlement-point.repository";
import { MapLayerService } from "../map-layers/map-layer.service";
import { RainfallRepository } from "../rainfall/rainfall.repository";
import { RainfallService } from "../rainfall/rainfall.service";
import type {
  IAreaStatistics,
  ICommunitySearch,
  IRainfallCoverage,
  PublicAreaDto,
  PublicOverviewDto,
  PublicOutlineDto,
  PublicSearchDto,
  PublicSourceDto,
} from "./public.types";
import type { PublicLocateQuery, PublicSearchQuery } from "./public.validation";

/** How long the overview and the outline are reused before they are read again. */
export const PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;

/** The level drawn on the landing page: LGAs in Nigeria. */
const OUTLINE_LEVEL = 2;
/** Shapes are simplified as for a map at this zoom: about 300 m, plenty for a drawing ~500 px wide. */
const OUTLINE_ZOOM = 7;
/** The containing areas walked upwards from a ward; hierarchies are shallow (section 10). */
const MAX_PARENT_DEPTH = 6;

const AREA_HITS = 8;
const COMMUNITY_HITS = 6;

interface Cached<T> {
  value: T;
  expiresAt: number;
}

export interface PublicServiceDeps {
  units: Pick<IAdminUnitRepository, "findSummaries" | "findSummaryById" | "findGeoJson"> & IAreaStatistics;
  areas: Pick<AdminUnitService, "locate">;
  layers: Pick<MapLayerService, "catalog">;
  rainfall: Pick<RainfallService, "series">;
  coverage: IRainfallCoverage;
  communities: ICommunitySearch;
  sources: Pick<IDataSourceRepository, "findById">;
  now?: () => number;
}

/**
 * The reads behind the public landing page, for visitors who have not signed in. Like the rest of
 * the geography, these are shared reference data (section 7: areas, layers and rainfall are not
 * region-owned records), so exposing them needs no region check. Only summaries leave here: names,
 * counts, simplified outlines and rainfall. Full-detail shapes and map layers stay behind sign-in.
 */
export class PublicService {
  private static _instance?: PublicService;
  static get Instance(): PublicService {
    return (this._instance ??= new PublicService({
      units: AdminUnitRepository.Instance,
      areas: AdminUnitService.Instance,
      layers: MapLayerService.Instance,
      rainfall: RainfallService.Instance,
      coverage: RainfallRepository.Instance,
      communities: SettlementPointRepository.Instance,
      sources: DataSourceRepository.Instance,
    }));
  }

  private readonly cache = new Map<string, Cached<unknown>>();
  private readonly now: () => number;

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(private readonly deps: PublicServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** The landing page's counters and credits. Cached: an import shows up within five minutes. */
  overview(): Promise<PublicOverviewDto> {
    return this.cached("overview", async () => {
      const [levels, layers, rainfall, states] = await Promise.all([
        this.deps.units.summariseLevels(),
        this.deps.layers.catalog(),
        this.deps.coverage.findCoverage(),
        this.deps.units.findSummaries({ level: 1, page: 1, pageSize: 100 }),
      ]);

      const sources = new Map<string, PublicSourceDto>();
      for (const layer of layers) for (const source of layer.sources) sources.set(source.id, toPublicSource(source));
      const otherIds = [...levels.flatMap((l) => l.sourceIds), ...(rainfall?.sourceIds ?? [])].filter((id) => !sources.has(id));
      const found = await Promise.all([...new Set(otherIds)].map((id) => this.deps.sources.findById(id)));
      for (const source of found) if (source) sources.set(source.id, toPublicSource(source));

      return {
        states: states.items.map(({ id, countryCode, unitName, levelName }) => ({ id, countryCode, unitName, levelName })),
        areas: levels.map(({ level, levelName, count }) => ({ level, levelName, count })),
        layers: layers.map(({ id, label, featureCount }) => ({ id, label, featureCount })),
        rainfall: rainfall ? { firstMonth: rainfall.firstMonth, lastMonth: rainfall.lastMonth, areaCount: rainfall.areaCount } : null,
        sources: [...sources.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.datasetName.localeCompare(b.datasetName)),
        generatedAt: new Date(this.now()).toISOString(),
      };
    });
  }

  /** The LGAs, simplified, over the extent of every state. Empty before any area is loaded. */
  outline(): Promise<PublicOutlineDto> {
    return this.cached("outline", async () => {
      const { items: states } = await this.deps.units.findSummaries({ level: 1, page: 1, pageSize: 50 });
      const bbox = unionBBox(states.map((s) => s.bbox));
      if (!bbox) return { bbox: null, areas: { type: "FeatureCollection", features: [] } };
      const areas = await this.deps.units.findGeoJson({ level: OUTLINE_LEVEL, bbox, zoom: OUTLINE_ZOOM });
      return { bbox, areas };
    });
  }

  /** Areas and communities whose names contain the search. */
  async search({ q }: PublicSearchQuery): Promise<PublicSearchDto> {
    const [{ items }, communities] = await Promise.all([
      this.deps.units.findSummaries({ q, page: 1, pageSize: AREA_HITS }),
      this.deps.communities.searchByName(q, COMMUNITY_HITS),
    ]);
    const parentIds = [...new Set(items.flatMap((unit) => (unit.parentId ? [unit.parentId] : [])))];
    const parents = await Promise.all(parentIds.map((id) => this.deps.units.findSummaryById(id)));
    const parentNames = new Map(parents.flatMap((p) => (p ? [[p.id, p.unitName] as const] : [])));

    return {
      areas: items.map((unit) => ({ ...toRef(unit), parentName: unit.parentId ? (parentNames.get(unit.parentId) ?? null) : null })),
      communities,
    };
  }

  /** One area, the areas containing it, and the rainfall nearest to it in the hierarchy. */
  async area(id: string): Promise<PublicAreaDto> {
    const unit = await this.deps.units.findSummaryById(id);
    if (!unit) throw new NotFoundError("Area");

    const parents: AdminUnitRef[] = [];
    let parentId = unit.parentId;
    while (parentId && parents.length < MAX_PARENT_DEPTH) {
      const parent = await this.deps.units.findSummaryById(parentId);
      if (!parent) break;
      parents.push(toRef(parent));
      parentId = parent.parentId;
    }

    // A ward has no rainfall of its own (CHIRPS is summarised per LGA), so the nearest area above
    // it that has some is used, and the reply says which one that is.
    let rainfall: PublicAreaDto["rainfall"] = null;
    for (const candidate of [unit, ...parents]) {
      const series = await this.deps.rainfall.series({ adminUnitId: candidate.id });
      if (series.months.length > 0) {
        rainfall = series;
        break;
      }
    }

    const { parentId: ownParent, childCount, bbox, centroid } = unit;
    return { area: { ...toRef(unit), parentId: ownParent, childCount, bbox, centroid }, parents, rainfall };
  }

  /**
   * The state, LGA and ward containing a point. The wards (GRID3 placeholders) and the LGAs
   * (geoBoundaries) come from different sources and don't always line up: about 1 ward in 11 lies
   * mostly outside the LGA it belongs to. A ward that isn't filed under the LGA containing the
   * point is left out, so the answer never names an LGA and a ward from a different LGA together.
   */
  async locate({ lon, lat }: PublicLocateQuery): Promise<LocateResult> {
    const result = await this.deps.areas.locate({ lon, lat });
    const lga = result.units.find((u) => u.level === 2);
    const ward = result.units.find((u) => u.level === 3);
    if (!lga || !ward) return result;
    const wardSummary = await this.deps.units.findSummaryById(ward.id);
    return wardSummary?.parentId === lga.id ? result : { ...result, units: result.units.filter((u) => u.id !== ward.id) };
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as Cached<T> | undefined;
    if (hit && hit.expiresAt > this.now()) return hit.value;
    const value = await load();
    this.cache.set(key, { value, expiresAt: this.now() + PUBLIC_CACHE_TTL_MS });
    return value;
  }
}

function toPublicSource(source: PublicSourceDto): PublicSourceDto {
  const { id, provider, datasetName, url, license } = source;
  return { id, provider, datasetName, url, license };
}

/** The smallest box around every box given; null for none. */
export function unionBBox(boxes: BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}
