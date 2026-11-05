/**
 * What a role may do, one named permission at a time (docs/audit-and-permissions.md). The code
 * checks permissions, never role names, so an administrator can change what a role may do, or
 * create a new role, on the Roles screen without a code change.
 *
 * - The list below is fixed in code: the code has to know what it is guarding.
 * - Which roles hold which permissions is data (`role_permissions`), seeded by migration
 *   CreateRolePermissions to exactly what each built-in role could do before permissions existed,
 *   so introducing them changed nothing for anyone.
 * - Administrators hold every permission, always: their row is never read and can't be edited.
 * - Some powers stay with administrators only and can't be given to any role (ADMIN_ONLY below):
 *   managing users and roles, and the platform's reference data. Otherwise whoever could edit roles
 *   could grant themselves anything.
 */

export interface PermissionInfo {
  /** The heading it is listed under on the Roles screen. */
  group: "Field survey" | "Photos" | "Places" | "Reports and alerts" | "Oversight";
  label: string;
  description: string;
}

export const PERMISSION_INFO = {
  "survey.record_flood": { group: "Field survey", label: "Record floods", description: "Walk or draw a flood's edge on the map." },
  "survey.recede_flood": { group: "Field survey", label: "Call a flood over", description: "Mark a flood receded, or put it back as still going." },
  "survey.record_drain": { group: "Field survey", label: "Record drainage", description: "Record drains, culverts, outfalls, inlets and ponds." },
  "survey.inspect_drain": { group: "Field survey", label: "Inspect drains", description: "Say what condition a recorded drain is in now (\"I checked it\")." },
  "survey.delete_own": { group: "Field survey", label: "Delete own records", description: "Delete floods and drains they recorded themselves." },
  "survey.delete_any": { group: "Field survey", label: "Delete anyone's records", description: "Delete floods and drains whoever recorded them." },
  "survey.view_people": {
    group: "Field survey",
    label: "See who recorded and inspected",
    description: "See the names of the people who recorded, inspected or called over floods and drains, and a drain's inspection history.",
  },
  "drainage.import": { group: "Field survey", label: "Import drainage plans", description: "Load drains and culverts from a GeoJSON drainage plan file." },
  "photos.add": { group: "Photos", label: "Add photos", description: "Add photos to floods, drains, inspections and places saved by hand." },
  "photos.view": { group: "Photos", label: "See photos", description: "See the photos on floods, drains, inspections and places." },
  "photos.delete_any": { group: "Photos", label: "Delete anyone's photos", description: "Delete photos whoever added them (everyone may delete their own)." },
  "places.manage": { group: "Places", label: "Save places by hand", description: "Save, edit and delete facilities the OpenStreetMap import missed." },
  "households.view": {
    group: "Places",
    label: "See households",
    description: "See everyone's households on the map, with who added them and how many live there, for planning and rescue. Everyone always sees their own.",
  },
  "reports.review": { group: "Reports and alerts", label: "Review flood reports", description: "See the review queue, publish or reject community flood reports." },
  "alerts.issue": { group: "Reports and alerts", label: "Issue flood alerts", description: "Issue, change, end and delete official flood alerts." },
  "audit.view": { group: "Oversight", label: "See the activity log", description: "Read and export the log of who recorded, inspected, changed or deleted what." },
} as const satisfies Record<string, PermissionInfo>;

export type Permission = keyof typeof PERMISSION_INFO;
export const PERMISSIONS = Object.keys(PERMISSION_INFO) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSION_INFO, value);
}

/** Never assignable to a role: only administrators manage users, roles, countries, data sources and imports. */
export const ADMIN_ONLY_POWERS = ["Manage users and their access", "Edit roles and permissions", "Countries, data sources and imports"] as const;

/**
 * What each built-in role holds when nothing else is known: the seed of migration CreateRolePermissions,
 * which is what each role could do before permissions existed. PermissionResolver falls back to it only
 * when the database can't be read (as in unit tests); a custom role then holds nothing.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<string, readonly Permission[]>> = {
  general_public: [],
  researcher: [],
  emergency_responder: [
    "survey.record_flood",
    "survey.recede_flood",
    "survey.record_drain",
    "survey.inspect_drain",
    "survey.delete_own",
    "survey.view_people",
    "photos.add",
    "photos.view",
    "reports.review",
    "households.view",
  ],
  government_official: [
    "survey.record_flood",
    "survey.recede_flood",
    "survey.record_drain",
    "survey.inspect_drain",
    "survey.delete_own",
    "survey.view_people",
    "photos.add",
    "photos.view",
    "reports.review",
    "alerts.issue",
    "households.view",
  ],
};
