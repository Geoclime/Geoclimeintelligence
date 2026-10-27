import { DataSourceRepository } from "../data-sources/data-source.repository";
import { toDataSourceDto, type DataSourceDto, type IDataSourceRepository } from "../data-sources/data-source.types";
import type { MapLayerId } from "./layer-rules";
import type {
  IRoadRepository,
  ISettlementRepository,
  IWaterwayRepository,
  LayerGeoJsonQuery,
  LayerSummary,
  MapLayerInfoDto,
  RoadFeatureCollection,
  SettlementFeatureCollection,
  WaterwayFeatureCollection,
} from "./map-layer.types";
import { RoadRepository } from "./road.repository";
import { SettlementPointRepository } from "./settlement-point.repository";
import { WaterwayRepository } from "./waterway.repository";

const LAYER_LABELS: Readonly<Record<MapLayerId, string>> = {
  roads: "Roads",
  waterways: "Waterways",
  settlements: "Settlements",
};

/**
 * Read-only map layers for every signed-in user. Like admin areas, roads, waterways and
 * settlements are shared reference data (the map itself), not region-owned records, so reads
 * are not narrowed by a user's region scope. They are written only by the loader script, which
 * is Administrator-only by needing database credentials (AI rule 9's documented exception).
 */
export class MapLayerService {
  private static _instance?: MapLayerService;
  static get Instance(): MapLayerService {
    return (this._instance ??= new MapLayerService(
      RoadRepository.Instance,
      WaterwayRepository.Instance,
      SettlementPointRepository.Instance,
      DataSourceRepository.Instance,
    ));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly roads: IRoadRepository,
    private readonly waterways: IWaterwayRepository,
    private readonly settlements: ISettlementRepository,
    private readonly sources: Pick<IDataSourceRepository, "findById">,
  ) {}

  /** Each layer with its size and the sources behind it: what the screen shows as provenance. */
  async catalog(): Promise<MapLayerInfoDto[]> {
    const [roads, waterways, settlements] = await Promise.all([
      this.roads.summarise(),
      this.waterways.summarise(),
      this.settlements.summarise(),
    ]);
    const summaries: [MapLayerId, LayerSummary][] = [
      ["roads", roads],
      ["waterways", waterways],
      ["settlements", settlements],
    ];
    return Promise.all(
      summaries.map(async ([id, summary]) => ({
        id,
        label: LAYER_LABELS[id],
        featureCount: summary.featureCount,
        sources: await this.resolveSources(summary.sourceIds),
      })),
    );
  }

  roadsGeoJson(query: LayerGeoJsonQuery): Promise<RoadFeatureCollection> {
    return this.roads.findGeoJson(query);
  }

  waterwaysGeoJson(query: LayerGeoJsonQuery): Promise<WaterwayFeatureCollection> {
    return this.waterways.findGeoJson(query);
  }

  settlementsGeoJson(query: LayerGeoJsonQuery): Promise<SettlementFeatureCollection> {
    return this.settlements.findGeoJson(query);
  }

  private async resolveSources(ids: string[]): Promise<DataSourceDto[]> {
    const found = await Promise.all(ids.map((id) => this.sources.findById(id)));
    return found.flatMap((source) => (source ? [toDataSourceDto(source)] : []));
  }
}
