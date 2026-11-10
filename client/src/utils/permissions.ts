import type { AuthUser, Permission } from "../types/auth.types";

/**
 * What the built-in roles may do when the backend doesn't say (an older backend sends no
 * `permissions`). Mirrors DEFAULT_ROLE_PERMISSIONS in server/src/common/access/permissions.ts.
 */
const DEFAULTS: Readonly<Record<string, readonly Permission[]>> = {
  researcher: ["ai.use", "ai.own_keys"],
  emergency_responder: [
    "survey.record_flood", "survey.recede_flood", "survey.record_drain", "survey.inspect_drain",
    "survey.delete_own", "survey.view_people", "photos.add", "photos.view", "reports.review", "households.view",
    "ai.use", "ai.own_keys",
  ],
  government_official: [
    "survey.record_flood", "survey.recede_flood", "survey.record_drain", "survey.inspect_drain",
    "survey.delete_own", "survey.view_people", "photos.add", "photos.view", "reports.review", "alerts.issue", "households.view",
    "ai.use", "ai.own_keys",
  ],
};

/**
 * Whether the signed-in person's role may do this. Administrators may do everything. This only decides
 * what the screen offers: the backend checks the same permission on every request regardless.
 */
export function can(user: Pick<AuthUser, "role" | "permissions"> | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === "administrator") return true;
  return (user.permissions ?? DEFAULTS[user.role] ?? []).includes(permission);
}

/** What the map's field survey lets this person do, worked out once for the screen. */
export interface SurveyAbilities {
  recordFlood: boolean;
  recedeFlood: boolean;
  recordDrain: boolean;
  inspectDrain: boolean;
  deleteOwn: boolean;
  deleteAny: boolean;
  /** See who recorded, inspected or called something over. */
  viewPeople: boolean;
  addPhotos: boolean;
  viewPhotos: boolean;
  deleteAnyPhoto: boolean;
  importDrainage: boolean;
  /** The id of the person, so their own records and photos can be offered for deleting. */
  userId: string | null;
}

export function surveyAbilities(user: Pick<AuthUser, "id" | "role" | "permissions"> | null | undefined): SurveyAbilities {
  return {
    recordFlood: can(user, "survey.record_flood"),
    recedeFlood: can(user, "survey.recede_flood"),
    recordDrain: can(user, "survey.record_drain"),
    inspectDrain: can(user, "survey.inspect_drain"),
    deleteOwn: can(user, "survey.delete_own"),
    deleteAny: can(user, "survey.delete_any"),
    viewPeople: can(user, "survey.view_people"),
    addPhotos: can(user, "photos.add"),
    viewPhotos: can(user, "photos.view"),
    deleteAnyPhoto: can(user, "photos.delete_any"),
    importDrainage: can(user, "drainage.import"),
    userId: user?.id ?? null,
  };
}

/** Nothing allowed: for read-only maps (a place's page) and signed-out views. */
export const READ_ONLY: SurveyAbilities = surveyAbilities(null);

/** True when someone may record anything at all, so the Field survey button is worth showing. */
export function mayRecordAnything(abilities: SurveyAbilities): boolean {
  return abilities.recordFlood || abilities.recordDrain || abilities.importDrainage;
}
