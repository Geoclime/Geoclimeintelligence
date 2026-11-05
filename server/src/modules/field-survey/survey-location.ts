import type { AuthUser } from "../../common/access/auth-user";
import { PermissionResolver } from "../../common/access/permission-resolver";
import type { RegionAccess } from "../../common/access/region-access";
import { ForbiddenError, ValidationError } from "../../common/errors/app-error";
import type { LonLat } from "../../common/geo/geo";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { DEFAULT_WARD_LEVEL } from "../map-layers/layer-rules";
import { meanPoint } from "./survey-rules";

/** Where a survey is: its country, ward and LGA, and the area its region scope is checked against. */
export interface SurveyPlace {
  countryCode: string;
  wardId: string | null;
  lgaId: string | null;
  /** The smallest area found: the ward, else the LGA, else the state. */
  regionId: string;
}

/**
 * The areas a survey is in, found from the middle of its points (or, if that falls in no mapped area,
 * its first point, which is where the walk began). A survey outside every mapped area is refused:
 * every record belongs to a country, and a region-scoped user needs an area to be scoped against.
 */
export async function locateSurvey(units: Pick<IAdminUnitRepository, "findContaining">, points: readonly LonLat[]): Promise<SurveyPlace> {
  const [middleLon, middleLat] = meanPoint(points);
  let containing = await units.findContaining(middleLon, middleLat);
  if (containing.length === 0 && points[0]) containing = await units.findContaining(points[0][0], points[0][1]);

  const top = containing[0];
  if (!top) {
    throw new ValidationError([{ field: "points", message: "That spot is outside every mapped area, so it can't be saved. Record it inside the boundaries." }]);
  }
  const ward = containing.find((unit) => unit.level === DEFAULT_WARD_LEVEL) ?? null;
  const lga = containing.find((unit) => unit.level === 2) ?? null;
  return { countryCode: top.countryCode, wardId: ward?.id ?? null, lgaId: lga?.id ?? null, regionId: (ward ?? lga ?? top).id };
}

/** A region-scoped user may only act on a record inside their region. Unscoped users (and administrators) always may. */
export async function assertRecordInRegion(
  regions: Pick<RegionAccess, "assert">,
  actor: AuthUser,
  record: { wardId: string | null; lgaId: string | null },
): Promise<void> {
  const area = record.wardId ?? record.lgaId;
  if (area) await regions.assert(actor, area);
  else if (actor.scopeAdminUnitId) throw new ForbiddenError();
}

/**
 * Who may delete a flood or drain: anyone whose role holds survey.delete_any (administrators always),
 * or the person who recorded it, if their role holds survey.delete_own. Nobody else's work disappears by accident.
 */
export async function assertMayDelete(
  actor: AuthUser,
  recordedBy: string | null,
  permissions: Pick<PermissionResolver, "has"> = PermissionResolver.Instance,
): Promise<void> {
  if (await permissions.has(actor, "survey.delete_any")) return;
  if (recordedBy === actor.id && (await permissions.has(actor, "survey.delete_own"))) return;
  throw new ForbiddenError("Only the person who recorded this, or someone allowed to delete anyone's records, can delete it");
}
