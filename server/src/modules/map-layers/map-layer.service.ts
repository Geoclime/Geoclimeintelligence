import { DataSourceRepository } from "../data-sources/data-source.repository";
import { toDataSourceDto, type DataSourceDto, type IDataSourceRepository } from "../data-sources/data-source.types";
import { BuildingRepository } from "./building.repository";
import { InfrastructureRepository } from "./infrastructure.repository";
import type { MapLayerId } from "./layer-rules";
import type {
  BuildingFeatureCollection,
  IBuildingRepository,
  IInfrastructureRepository,
  InfrastructureFeatureCollection,
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
  infrastructure: "Infrastructure",
  buildings: "Buildings",
};

/** The repository behind each layer. */
export interface MapLayerRepositories {
  roads: IRoadRepository;
  waterways: IWaterwayRepository;
  settlements: ISettlementRepository;
  infrastructure: IInfrastructureRepository;
  buildings: IBuildingRepository;
}

/**
 * Read-only map layers for every signed-in user. Like admin areas, roads, waterways, settlements,
 * infrastructure and buildings are shared reference data (the map itself), not region-owned records, so
 * reads are not narrowed by a user's region scope. They are written only by the loader, which is
 * Administrator-only (the script needs database credentials; the upload route needs the role).
 */
export class MapLayerService {
  private static _instance?: MapLayerService;
  static get Instance(): MapLayerService {
    return (this._instance ??= new MapLayerService(
      {
        roads: RoadRepository.Instance,
        waterways: WaterwayRepository.Instance,
        settlements: SettlementPointRepository.Instance,
        infrastructure: InfrastructureRepository.Instance,
        buildings: BuildingRepository.Instance,
      },
      DataSourceRepository.Instance,
    ));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly layers: MapLayerRepositories,
    private readonly sources: Pick<IDataSourceRepository, "findById">,
  ) {}

  /** Each layer with its size and the sources behind it: what the screen shows as provenance. */
  async catalog(): Promise<MapLayerInfoDto[]> {
    const ids: MapLayerId[] = ["roads", "waterways", "settlements", "infrastructure", "buildings"];
    const summaries: LayerSummary[] = await Promise.all(ids.map((id) => this.layers[id].summarise()));
    return Promise.all(
      ids.map(async (id, index) => ({
        id,
        label: LAYER_LABELS[id],
        featureCount: summaries[index]!.featureCount,
        sources: await this.resolveSources(summaries[index]!.sourceIds),
      })),
    );
  }

  roadsGeoJson(query: LayerGeoJsonQuery): Promise<RoadFeatureCollection> {
    return this.layers.roads.findGeoJson(query);
  }

  waterwaysGeoJson(query: LayerGeoJsonQuery): Promise<WaterwayFeatureCollection> {
    return this.layers.waterways.findGeoJson(query);
  }

  settlementsGeoJson(query: LayerGeoJsonQuery): Promise<SettlementFeatureCollection> {
    return this.layers.settlements.findGeoJson(query);
  }

  infrastructureGeoJson(query: LayerGeoJsonQuery): Promise<InfrastructureFeatureCollection> {
    return this.layers.infrastructure.findGeoJson(query);
  }

  buildingsGeoJson(query: LayerGeoJsonQuery): Promise<BuildingFeatureCollection> {
    return this.layers.buildings.findGeoJson(query);
  }

  private async resolveSources(ids: string[]): Promise<DataSourceDto[]> {
    const found = await Promise.all(ids.map((id) => this.sources.findById(id)));
    return found.flatMap((source) => (source ? [toDataSourceDto(source)] : []));
  }
}
