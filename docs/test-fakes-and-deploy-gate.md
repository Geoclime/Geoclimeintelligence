# Keeping the Test Fakes in Step with the Code (and Why Render Needs It)

## What was built

A repair, not a feature. The API's wetlands layer (`GET /api/v1/wetlands/geojson`) was in the code but not on the deployed server: the map showed "Route GET /api/v1/wetlands/geojson not found". The cause was that Render refused to deploy.

Render's build runs `npm run typecheck && npm test` first ([`render.yaml`](../render.yaml)). The typecheck failed with **30 errors, all in `server/tests/`**, none in `server/src/`. The role, audit-log, photo, field-survey and wetlands work had added constructor arguments, repository methods and fields, and the test stand-ins (the "fakes") had not been updated. A failed build keeps the old version running, so everything since the last good deploy was missing from the live API.

This change brings the fakes and the test calls up to date, so the typecheck passes again (`tsc --noEmit` ends with no errors). It adds no test cases and changes nothing under `server/src/`.

## How it works

All paths are relative to `server/tests/`.

**1. New shared stand-ins in [`fakes.ts`](../server/tests/fakes.ts).**
- `fakeAudit()`: stands in for the activity log. It keeps every entry a service wrote, so a test can read them back.
- `fakePhotos()`: stands in for photo storage. Removing a record's photos always works.
- `fakeRoles()`: stands in for the `roles` table. It knows the five built-in roles, and only `emergency_responder` and `government_official` can be limited to an area, as in the migration `CreateRolePermissions`.

**2. Repository fakes.**
- [`field-survey-fakes.ts`](../server/tests/field-survey-fakes.ts):
  - `households` added to the empty flood impact;
  - the flood fake gained `findPeople` and `impactFeatures`;
  - the drainage fake gained `inspect`, `findInspections`, `findPeople` and `importMany`, and lost `update`, which the real repository no longer has;
  - drains now carry `flowDirection`, `diameterM`, `material` and `barrels`.
- [`map-layer-fakes.ts`](../server/tests/map-layer-fakes.ts): the recording repository and the loader transaction fake now handle wetlands (`insertWetlands`, `deleteWetlands`).

**3. The calls that build services.** `FacilityService`, `FloodExtentService` and `DrainageService` take an audit log and photo store. `UserService` takes a roles lookup and an audit log. The unit and integration tests now pass the fakes in. Facility `update` and `remove` now pass an actor, because they record who did it.

**4. Two expectations that changed with the code.** The layer list now has six layers, so the two catalog tests expect `wetlands` last. The drainage repository test now calls `inspect(...)` and reads `{ drain, inspectionId }`.

**Three run-time failures the compiler couldn't see.** A first `npm test` after the type repair gave 541 passed, 3 failed and 1 skipped. The three failures were old expectations, not broken code:
- The catalog test still expected five layers. It is six since wetlands, so it now expects 6.
- Two tests (one unit, one integration) said an empty drain inspection is refused. That rule was dropped on purpose in commit `f791343`: `PATCH /api/v1/drainage/:id` with nothing but the place is now "a check that found it as it was", so it is accepted. The tests now expect that (`true` and `200`).

**What has not been checked.** After these three edits, only the typecheck was re-run. A final `npm test` is the check that settles whether Render's build passes.

## Resources to read

- Vitest guide: https://vitest.dev/guide/
- TypeScript's `noEmit` option (what `npm run typecheck` does): https://www.typescriptlang.org/tsconfig/#noEmit
- [deployment-render.md](deployment-render.md): the build command, the migration step, and why a failed build keeps the old version live.
- [testing.md](testing.md): how the fakes are used.

I could not reach Render's own documentation site from this machine, so no link to it is given.

## Explain it like I'm new to this

Think of a restaurant that will only open a new menu once the inspector's checklist passes. You added new dishes (roles, audit log, wetlands), but the checklist still described the old kitchen: it asked about equipment that had been replaced and didn't mention the new stations. The inspector failed the check, so the restaurant kept serving the old menu, and customers asking for wetlands were told "we don't serve that." Nothing was wrong with the new dishes. The checklist was out of date. This change rewrites the checklist so it describes today's kitchen.
