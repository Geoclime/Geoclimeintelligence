# Activity Log, Editable Roles and Survey Photos

## What was built

Three things that let the platform be trusted with work done by many people in the field:

- **An activity log.** Every change to the record of the ground is written down: who did it, what role they had, when, where (LGA and ward) and what changed. That covers floods recorded, called over, put back and deleted; drains recorded, inspected, imported and deleted; places saved by hand, changed and deleted; photos added and deleted; and every change to roles and to people's access. The log can't be edited or deleted, not even by an administrator, because the database refuses. Staff with the **See the activity log** permission read it at **Activity log** in the sidebar, filter it and export it as CSV.
- **Every drain inspection is kept.** "I checked it" used to overwrite the drain's condition and forget who looked. Now each check is its own record: who checked, their role, the condition before and after, what they wrote, and, if their phone shared it, where they stood and how far that was from the drain. Staff see a drain's **inspection history** in its popup, and who recorded and last checked it. A flood's popup says who recorded it and who called it over. Names are shown to staff only: anyone whose role holds **See who recorded and inspected** (responders, officials and administrators, as seeded).
- **Roles an administrator can edit.** What a role may do is now a set of named permissions, not something written into the code. On **Administration → Roles** an administrator sees every role against every permission, changes what any role except Administrator may do, and creates new roles (a "Drainage inspector" who can inspect and photograph drains but not call floods over, say). New roles are given to people on the Users screen like any other, and can be allowed to be limited to one area.
- **Photos.** A flood, a drain, one inspection of a drain, or a place saved by hand can each have up to five photos. They are taken in the recording forms, in a drain's inspection, or added later from a popup. They are seen by staff only (**See photos**), never on the public alert map, and every form says "Avoid faces and number plates." Imported OpenStreetMap facilities don't take photos in this version.

### The permissions

| Permission | Lets a role | Seeded to |
|---|---|---|
| Record floods (`survey.record_flood`) | Walk or draw a flood's edge | Responder, Official |
| Call a flood over (`survey.recede_flood`) | Mark it receded, or put it back | Responder, Official |
| Record drainage (`survey.record_drain`) | Record drains and spots | Responder, Official |
| Inspect drains (`survey.inspect_drain`) | "I checked it" | Responder, Official |
| Delete own records (`survey.delete_own`) | Delete floods and drains they recorded | Responder, Official |
| Delete anyone's records (`survey.delete_any`) | Delete any flood or drain | nobody (administrators only) |
| See who recorded and inspected (`survey.view_people`) | Names on floods and drains; inspection history | Responder, Official |
| Import drainage plans (`drainage.import`) | Load a GeoJSON drainage plan | nobody (administrators only) |
| Add photos (`photos.add`) | Add photos | Responder, Official |
| See photos (`photos.view`) | See photos | Responder, Official |
| Delete anyone's photos (`photos.delete_any`) | Delete any photo (everyone may delete their own) | nobody (administrators only) |
| Save places by hand (`places.manage`) | Save, edit and delete facilities | nobody (administrators only) |
| Review flood reports (`reports.review`) | The review queue | Responder, Official |
| Issue flood alerts (`alerts.issue`) | Issue, change, end and delete alerts | Official |
| See the activity log (`audit.view`) | Read and export the log | nobody (administrators only) |

The seed is exactly what each role could do before permissions existed, so introducing them changed nobody's access. Administrators hold every permission, always. Three powers can't be given to any role: managing users and their access, editing roles and permissions, and countries, data sources and imports. Otherwise whoever could edit roles could grant themselves anything.

## How it works

Paths are relative to `server/` unless they start with `client/`.

### 1. The tables

| Migration | Adds |
|---|---|
| [`1793000000000-CreateAuditTrail.ts`](../server/src/migrations/1793000000000-CreateAuditTrail.ts) | `audit_events` (append-only), `drain_inspections`, `drainage_features.last_checked_by`, `flood_extents.receded_by`, `reopened_by`, `reopened_at` |
| [`1793100000000-CreateRolePermissions.ts`](../server/src/migrations/1793100000000-CreateRolePermissions.ts) | `roles.is_system`, `roles.can_be_scoped`, `role_permissions` (seeded), and a trigger in place of the `ck_users_scope_only_for_staff` CHECK |
| [`1793200000000-CreateMapPhotos.ts`](../server/src/migrations/1793200000000-CreateMapPhotos.ts) | `map_photos`: one row per photo, belonging to exactly one flood, drain, inspection or place |

- **Append-only.** A trigger on `audit_events` refuses every `UPDATE` and `DELETE`. The one exception is the database's own: when an account is deleted, its `actor_id` becomes null. Each row keeps a copy of the person's name, email and role, so it still reads afterwards.
- **An inspection can't happen without its record.** `DrainageRepository.inspect` changes the drain and inserts its `drain_inspections` row in one SQL statement. The distance from the inspector to the drain is measured in PostGIS, on the spheroid.
- **Region scope is a property of the role.** `roles.can_be_scoped` says whether a role's users may be limited to an area. The trigger `trg_users_scope_allowed` refuses a scope on a role that doesn't allow it, which is the second gate after `assertScopeAllowedForRole`.

### 2. Checking permissions

- [`common/access/permissions.ts`](../server/src/common/access/permissions.ts) is the list of permissions, with their labels and the built-in defaults.
- [`common/access/permission-resolver.ts`](../server/src/common/access/permission-resolver.ts) answers "may this role do this?". It reads `role_permissions` once and keeps the answer for 30 seconds. Editing a role on this server clears it at once. If the database can't be read, the built-in roles fall back to the seed and any other role holds nothing.
- [`middleware/require-permission.middleware.ts`](../server/src/middleware/require-permission.middleware.ts): `requirePermission("survey.inspect_drain")` on a route, in place of `authorise(...roles)`. The field survey, flood report, alert and saved-place routes use it. User, country, data-source and import routes stay `authorise("administrator")`, by design.
- What used to be a fixed list of reviewer roles now follows `reports.review`: who may review a report, who joins the review room for live updates, who gets the review-queue notification, and which staff an alert reaches.
- `GET /api/v1/auth/me` (and the other profile replies) now carry `permissions`, so the web app shows only what the person can use ([`client/src/utils/permissions.ts`](../client/src/utils/permissions.ts), `useCan()`). The server checks every request regardless.

### 3. The API

| Route | Who | Does |
|---|---|---|
| `GET /api/v1/roles` | Signed in | Every role, with its permissions and how many people hold it |
| `GET /api/v1/roles/permissions` | Signed in | The permission list, grouped, and the administrator-only powers |
| `POST /api/v1/roles`, `PATCH /api/v1/roles/:code`, `DELETE /api/v1/roles/:code` | Administrator | Create, change, delete. Administrator can't be changed; built-in roles can't be deleted; a role anyone holds can't be deleted (`409`) |
| `GET /api/v1/audit-events?page=&action=&from=&to=&q=&areaId=&actorId=` | `audit.view` | The log, newest first |
| `GET /api/v1/audit-events/export.csv` | `audit.view` | The whole filtered log (up to 50,000 rows) as CSV, safe to open in Excel |
| `GET /api/v1/drainage/:id/inspections`, `GET /api/v1/drainage/:id/people`, `GET /api/v1/flood-extents/:id/people` | `survey.view_people` | Inspection history; who recorded and last checked; who called a flood over |
| `PATCH /api/v1/drainage/:id` | `survey.inspect_drain` | An inspection. Optional `inspectionNote` and `at: { longitude, latitude, accuracyM }`; replies with `inspectionId` |
| `GET /api/v1/photos?subjectType=&subjectId=`, `GET /api/v1/photos/:id/file` | `photos.view` | A thing's photos; one photo (a redirect to a signed Cloudinary link, or the bytes) |
| `POST /api/v1/photos` (multipart `file`, `subjectType`, `subjectId`, optional `caption`, `takenAt`, `longitude`, `latitude`, `accuracyM`) | `photos.add` | Adds one photo. `409` past five; `403` for an imported facility |
| `DELETE /api/v1/photos/:id` | The uploader, or `photos.delete_any` | Deletes it and its file |

### 4. Photos

- **Storage.** Photos are stored the way flood-report media is ([flood-alerts-and-reports.md](flood-alerts-and-reports.md)): as authenticated Cloudinary assets, reached only through signed links. Without Cloudinary (`CLOUDINARY_URL` empty) they are kept in the database, 2 MB at most. **Turn Cloudinary on in production before people start adding photos, and check the plan's storage limit.** A photo's file type is checked from its first bytes, not taken on trust.
- **Saving.** The browser shrinks each photo and strips its metadata, including the GPS tag. Where the phone was is asked for separately, and kept only if it answers within a few seconds. Photos are sent after the flood, drain or place is saved, one at a time. A failed upload is reported and can be retried from the popup, and it never costs the record itself.
- **Deleting.** Deleting a flood, drain or place removes its photos' files first. The rows go with it in the database.

### 5. The client

- **Roles screen.** [`pages/admin/RolesPage.tsx`](../client/src/pages/admin/RolesPage.tsx) and [`components/roles/RoleFormDialog.tsx`](../client/src/components/roles/RoleFormDialog.tsx). The Users screen's role picker lists every role, including new ones, and whether each may be limited to an area.
- **Activity log.** [`pages/activity/ActivityLogPage.tsx`](../client/src/pages/activity/ActivityLogPage.tsx), with filters held in the address so a view can be shared.
- **Photos.** [`components/photos/`](../client/src/components/photos/): `PhotoPicker` for the forms, `PhotoGallery`, and `PhotoSection` for the popups.
- **Drain popup.** [`components/map/DrainagePopup.tsx`](../client/src/components/map/DrainagePopup.tsx): **I checked it** opens a short form (condition, what you found, "record where I'm standing", photos). **Inspection history** lists every check.

## Known limits

- **The test suite wasn't updated** in this change, by request. The server's in-memory fakes and the services' constructors gained new members (photos, audit, permissions), so several server test files no longer compile until they are updated. The client's `map-url.test.ts` needs `wetlands` in its layer lists. The Cypress drain-inspection steps need to press **I checked it** before **Save inspection**.
- **Migrations haven't been run against a database.** Run them against a staging copy first: `npm run migration:run`.
- **Writing the log after the change.** An activity-log write happens after the change it records (except an inspection, which is in the same statement). If the write fails, the change stands and the failure is logged with the whole entry, so it can be put right by hand.
- **Permission edits take up to 30 seconds** to reach another server instance, if more than one is running.

## Resources to read

- PostgreSQL triggers: https://www.postgresql.org/docs/current/plpgsql-trigger.html
- OWASP authorization ("deny by default", least privilege): https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP CSV injection (why log exports escape `=`, `+`, `-`, `@`): https://owasp.org/www-community/attacks/CSV_Injection
- Cloudinary authenticated delivery: https://cloudinary.com/documentation/control_access_to_media

## Explain it like I'm new to this

Think of a site office. There is a **logbook** on the desk: whoever does something writes their name, the time and what they did, in pen. Pages are never torn out. That's the activity log.

Each drain has its own **inspection card** too. Every visit adds a line: who came, what they found, and how far away they were standing when they looked. Before, the card was a whiteboard that the next person wiped. Now nothing is lost.

**Roles** are job descriptions, and **permissions** are the keys on each person's key ring. The office manager (the administrator) used to have the key rings fixed at the factory. Now they can add or take away a key for every holder of a job description at once, or write a new job description. They can never hand out the key to the key cabinet itself.

**Photos** go in a locked folder only staff can open. They are never pinned to the public noticeboard, because they can show people's faces and homes.
