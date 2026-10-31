import { AppError } from "../../common/errors/app-error";
import { BaseRepository } from "../../common/repository/base.repository";
import { Infrastructure } from "./infrastructure.entity";
import type { FacilityChanges, FacilityDto, IFacilityRepository, ManualFacilitySource, NewFacility } from "./map-layer.types";

// Places an administrator saves from the map. Same table as the imported facilities, but only rows
// with origin = 'manual' are ever changed or deleted here, so an OpenStreetMap row can't be edited
// through this route even with its id in hand. The point is built in PostGIS (section 8).

/** What every write hands back: the row as the client needs it, with the point as plain numbers. */
const RETURNING = `
  id, name, facility_type AS "facilityType", osm_class AS "osmClass", note, origin,
  ST_X(geom) AS longitude, ST_Y(geom) AS latitude, admin_unit_id AS "adminUnitId", created_at AS "createdAt"`;

type FacilityRow = Omit<FacilityDto, "createdAt"> & { createdAt: Date };

function toDto(row: FacilityRow): FacilityDto {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export class FacilityRepository extends BaseRepository<Infrastructure> implements IFacilityRepository {
  private static _instance?: FacilityRepository;
  static get Instance(): FacilityRepository {
    return (this._instance ??= new FacilityRepository());
  }

  protected readonly entity = Infrastructure;

  async ensureManualSource(input: ManualFacilitySource): Promise<string> {
    // One source for every place saved by hand, found by who and what it is, not by date: it is
    // a standing record, so a later save must not make a second one.
    const [found]: { id: string }[] = await this.repo.query(
      `SELECT id FROM data_sources WHERE provider = $1 AND dataset_name = $2 ORDER BY created_at LIMIT 1`,
      [input.provider, input.datasetName],
    );
    if (found) return found.id;
    const [created]: { id: string }[] = await this.repo.query(
      `INSERT INTO data_sources (provider, dataset_name, url, license, downloaded_on, notes, created_by)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6) RETURNING id`,
      [input.provider, input.datasetName, input.url, input.license, input.notes, input.createdBy],
    );
    if (!created) throw new AppError(500, "The data source for saved places could not be created");
    return created.id;
  }

  async create(input: NewFacility): Promise<FacilityDto> {
    const [row]: FacilityRow[] = await this.repo.query(
      `INSERT INTO infrastructure (country_code, admin_unit_id, osm_id, from_area, name, facility_type, osm_class,
                                   note, origin, created_by, geom, source_id)
       VALUES ($1::char(3), $2::uuid, NULL, false, $3, $4, $5, $6, 'manual', $7::uuid,
               ST_SetSRID(ST_MakePoint($8::float8, $9::float8), 4326), $10::uuid)
       RETURNING ${RETURNING}`,
      [
        input.countryCode, input.adminUnitId, input.name, input.facilityType, input.osmClass,
        input.note, input.createdBy, input.longitude, input.latitude, input.sourceId,
      ],
    );
    if (!row) throw new AppError(500, "The place could not be saved");
    return toDto(row);
  }

  async update(id: string, changes: FacilityChanges): Promise<FacilityDto | null> {
    const rows: FacilityRow[] = await this.repo.query(
      `UPDATE infrastructure
          SET name = $2, facility_type = $3, osm_class = $4, note = $5, updated_at = now()
        WHERE id = $1 AND origin = 'manual'
        RETURNING ${RETURNING}`,
      [id, changes.name, changes.facilityType, changes.osmClass, changes.note],
    );
    return rows[0] ? toDto(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const rows: unknown[] = await this.repo.query(`DELETE FROM infrastructure WHERE id = $1 AND origin = 'manual' RETURNING 1`, [id]);
    return rows.length > 0;
  }
}
