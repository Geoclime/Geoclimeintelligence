# Phase 2: Admin Geography

## What was built

The platform now knows real places: Nigeria, Rivers State, its 23 Local Government Areas (LGAs) and its wards, each with its true boundary shape. Anyone signed in can list them, open one, get their shapes for a map, and ask "which state, LGA and ward is this point in?". Administrators create countries and load the shapes; nobody types boundaries in by hand, and every shape points at the data source it came from. The loading itself goes through the import pipeline, described in [data-import.md](data-import.md).

## How it works

All paths are relative to `server/`. Requests flow validation → auth → role check → controller → service → repository → PostGIS, as in [architecture.md](architecture.md).

### 1. The tables (migrations, in order)

| Migration | What it does |
|---|---|
| [`1791200000000-EnablePostgisAndCreateDataSources.ts`](../server/src/migrations/1791200000000-EnablePostgisAndCreateDataSources.ts) | Switches on PostGIS and creates a minimal `data_sources` table (provider, dataset name, link, licence, download date, notes) |
| [`1791200100000-CreateCountriesAndAdminUnits.ts`](../server/src/migrations/1791200100000-CreateCountriesAndAdminUnits.ts) | `countries` (ISO code, name, level names, optional rough bounding box) and `admin_units` (the areas) |
| [`1791200200000-AddAdminUnitIndexes.ts`](../server/src/migrations/1791200200000-AddAdminUnitIndexes.ts) | The **GiST spatial index** `idx_admin_units_geom`, indexes on `parent_id` and level, and two unique indexes that stop the same area being loaded twice |
| [`1791200300000-LinkUserScopeToAdminUnits.ts`](../server/src/migrations/1791200300000-LinkUserScopeToAdminUnits.ts) | Turns `users.scope_admin_unit_id` into a real foreign key to `admin_units` |
| [`1791200400000-CreateImportTables.ts`](../server/src/migrations/1791200400000-CreateImportTables.ts) | The import pipeline's tables: see [data-import.md](data-import.md) |

None of them insert data rows: the tables start empty, and countries, sources and areas are all added through the API.

**`admin_units`** is one self-referencing table for every level of every country, as in the Backlog2 ERD: `id`, `country_code`, `parent_id` (another admin unit), `level` (1 state, 2 LGA, 3 ward), `level_name`, `unit_name`, `unit_code` (the source's own code, e.g. `NG033022` or `RVSPHC17`), `geom` (`MultiPolygon`, SRID 4326), `source_id` (required) and `import_run_id` (which import created it). The database also enforces, as a second gate behind the code:
- a level-1 area has no parent, and every deeper area has one;
- every shape is valid and non-empty (`ST_IsValid`);
- the same name under the same parent, or the same code at the same level, can't exist twice;
- `ON DELETE RESTRICT` on parents, sources and user scopes, so nothing can be deleted out from under an area or a scoped user.

**Decision recorded here (Phase 2 guide, decision 2):** the column names follow the Backlog2 ERD (`unit_name`, `geom`, `unit_code`, `country_code`, `source_id`), not the standard's example entity (`name`, `boundary`), because Backlog2 has the extra columns the rules need.

**Why `users.scope_admin_unit_id` uses `ON DELETE RESTRICT`:** a null scope means "unrestricted". If deleting an area set a responder's scope to null, they'd suddenly be allowed everywhere. Refusing the delete is the safe choice.

### 2. The repository (the only code that talks to PostGIS)

[`src/modules/admin-units/admin-unit.repository.ts`](../server/src/modules/admin-units/admin-unit.repository.ts) extends `BaseRepository` and holds every spatial query:
- **`findSummaries` / `findChildren` / `findByLevel`**: paged lists of names, codes, levels and child counts. They **never return shapes**: only a `bbox` and `centroid` summary (backend standard section 10).
- **`findGeometry(id)`**: one shape, as GeoJSON.
- **`findContaining(lon, lat, level?)`**: the point-in-polygon search, `ST_Contains(geom, ST_SetSRID(ST_MakePoint(lon, lat), 4326))`, which uses the GiST index.
- **`findGeoJson({ level, bbox, zoom? })`**: shapes for the map, only those touching the bounding box (`geom && box AND ST_Intersects`). With `zoom`, shapes are simplified to about one screen pixel (`ST_SimplifyPreserveTopology`), which keeps the ward layer small.
- **`isDescendantOrSelf` / `subtreeIds`**: recursive queries over `parent_id`, used for region scoping (below).

Countries live in [`country.repository.ts`](../server/src/modules/admin-units/country.repository.ts). It can't extend `BaseRepository` because a country's key is its ISO code rather than a uuid `id`. When level names are renamed, it updates `admin_units.level_name` in the same transaction.

### 3. The endpoints

All under `/api/v1/`, mounted in [`app.ts`](../server/src/app.ts) after the single `authMiddleware`. "Everyone" means any signed-in user: every API route needs a Firebase token (section 11).

| Method and path | Who | What it returns |
|---|---|---|
| `GET /countries` | Everyone | Every country with its levels and how many areas each level has |
| `GET /countries/:code` | Everyone | One country with its per-level counts |
| `POST /countries` | Administrator | Creates a country: code, name, level names, optional `bbox` |
| `PATCH /countries/:code` | Administrator | Renames the country or its levels, adds levels, sets `bbox`. A level that holds areas can't be removed |
| `GET /admin-units?level=&parentId=&countryCode=&q=` | Everyone | Paged names, codes, levels, child counts. No shapes |
| `GET /admin-units/:id` | Everyone | One area with its parent, its source and its full shape |
| `GET /admin-units/:id/children` | Everyone | The wards of an LGA, or the LGAs of the state |
| `GET /admin-units/geojson?level=&bbox=&zoom=` | Everyone | A map layer. `bbox` is **required**: a request without one gets `400` |
| `GET /admin-units/locate?lon=&lat=` | Everyone | The state, LGA and ward containing the point; `404` if no mapped area does |
| `GET /data-sources`, `POST /data-sources` | Everyone / Administrator | List and add data sources |

The import routes (`/imports/...`) are in [data-import.md](data-import.md). Every route has a Zod schema (`*.validation.ts`), a thin controller and a service. Area reads are **not** narrowed by a user's region scope: the map of areas is shared reference data, and a scope limits what a user may do *to records inside* an area, not which areas exist.

### 4. Region scoping is now real

[`src/common/access/region-access.ts`](../server/src/common/access/region-access.ts) now uses `AdminUnitRepository` as its hierarchy, replacing Phase 1's stand-in, which treated a region as containing only itself. A responder scoped to an LGA can now act on that LGA's wards too. A scope that points at a missing area still fails closed: `subtreeIds` returns an empty list, which matches no rows. `PATCH /users/:id/access` now rejects a `scopeAdminUnitId` that isn't a real area (`400`), and the foreign key backs that up.

### 5. The first Administrator (Phase 2 decision 4)

Set `BOOTSTRAP_ADMIN_EMAIL` in `server/.env` (and on Render). [`AuthService.resolveUser`](../server/src/modules/auth/auth.service.ts) makes that account an Administrator, but only when:
- Firebase says the email is **verified**, so nobody can claim it by signing up with that address before its owner does; and
- **no Administrator exists yet**, so the setting does nothing once the platform has one.

It works whether the account is brand new or already signed in earlier. The web client now only signs an account in once its email is verified, so the row is normally created at that first sign-in, as General Public; rows made before that change may already exist. Every later administrator is promoted on the admin Users page. `npm run user:set-access` still works for recovery.

### 6. Results on the real data

Checked against a scratch PostGIS 3.6 / PostgreSQL 18 database on the project's Aiven service, which was then dropped:
- **Rivers State outline:** 1 area. **LGA sheet:** 23 LGAs, imported straight from the Excel `lga_boundaries` sheet with no conversion. **Wards:** 317 of 318 wards (see below).
- 0 invalid shapes, every shape a MultiPolygon, every row with a `source_id`.
- `locate` for a point in Port Harcourt (7.0134, 4.7774) returns Rivers > Port Harcourt > Phward 17. A point in Lagos, or in London, returns `404`.

**Tests:** [`tests/unit/geography.service.test.ts`](../server/tests/unit/geography.service.test.ts) covers the country and admin-unit services. [`tests/integration/geography.test.ts`](../server/tests/integration/geography.test.ts) covers the routes: who may call what, a map layer with no `bbox` refused, `locate` validation and `404`, and lists that carry no shapes. [`tests/unit/auth.service.test.ts`](../server/tests/unit/auth.service.test.ts) covers the bootstrap rules.

### Flagged for the team (NEEDS VERIFICATION)

- **One ward has no shape.** In the GRID3 wards file, "Omward 5" (Omuma LGA, code `RVSBER05`) has `status: "Invalid"` and no geometry. The import reports it as a failed row ("The shape is missing") rather than inventing one, so 317 wards go live, not 318. Someone should check whether GRID3 or INEC has a shape for it.
- **Ward boundaries are placeholders.** GRID3 marks every ward "Operational Placeholder" and names Obio/Akpor's wards "Obward 1" to "Obward 17". They load as they are (decision 3), with `wardcode` as `unit_code`, and the source is shown on screen.
- **No delete or edit of areas yet.** Correcting an area means a new import; a delete or replace flow isn't built.
- `countries.geom` stays empty. No country outline is loaded in Phase 2 (Backlog2 marks it "nullable until pulled").

## Resources to read

- PostGIS introduction (spatial types and functions): https://postgis.net/workshops/postgis-intro/
- `ST_Contains` (the point-in-polygon test): https://postgis.net/docs/ST_Contains.html
- Spatial indexes (GiST) in PostGIS: https://postgis.net/workshops/postgis-intro/indexing.html
- `ST_SimplifyPreserveTopology`: https://postgis.net/docs/ST_SimplifyPreserveTopology.html
- PostgreSQL recursive queries (`WITH RECURSIVE`, used for region scoping): https://www.postgresql.org/docs/current/queries-with.html
- GeoJSON format (RFC 7946): https://datatracker.ietf.org/doc/html/rfc7946
- EPSG:4326 / WGS 84: https://epsg.io/4326
- geoBoundaries (the LGA and state source): https://www.geoboundaries.org
- GRID3 Nigeria Operational Wards (the ward source): https://data.grid3.org/datasets/0824aded5f5a4d39b10871c667aa8ccf/about

## Explain it like I'm new to this

Think of a set of Russian dolls drawn on a map. The biggest doll is Rivers State; inside it are 23 LGA dolls, and inside each LGA are its ward dolls. The `admin_units` table stores every doll, and each one notes which doll it sits inside (`parent_id`) and its exact outline (`geom`). PostGIS is the part of the database that understands outlines: given a dropped pin, it finds every doll the pin is inside, which is how "Where am I?" works. The GiST index is like a card catalogue that lets it skip straight to the right dolls instead of checking all 341. Because outlines are heavy, the API never sends them in a list. You get the names, and you only get the outlines for the part of the map you're looking at. Every doll also carries a label saying who made it (`source_id`), so nobody mistakes a placeholder for an official boundary.
