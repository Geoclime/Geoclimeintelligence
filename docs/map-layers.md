# Map Layers: Roads, Waterways and Settlements

## What was built

The map can now show what lies inside the boundaries: **roads**, **waterways** (rivers, creeks and water bodies) and **settlements** (named villages and towns). The backend part is:

- **Three tables** from the Backlog2 ERD: `roads`, `waterways` and `settlement_points`. Every row points at a real data source.
- **Four read endpoints**, open to any signed-in user:
  - `GET /api/v1/map-layers`: each layer, how many features it holds and where its data came from;
  - `GET /api/v1/roads/geojson`, `GET /api/v1/waterways/geojson`, `GET /api/v1/settlements/geojson`: the shapes inside a visible area.
- **Thinning by zoom and a hard cap**, so a whole-state view never sends all 47,507 road segments.
- **Two scripts, `npm run layers:load` and `npm run layers:clear`**, that load the data team's delivery zip and the GRID3 settlement file into those tables, and remove a country's roads and waterways when they need to be reloaded or the country deleted. There are no write endpoints.
- **A clearer country delete:** deleting a country that still holds roads or waterways now returns `409` with a plain message, instead of a raw database error.

The web client side (toggles, legend, the "Data sources" panel) is in [features/map-layers.md](features/map-layers.md).

## What a settlement is

A **settlement** is a named place where people live: a village, hamlet or town. On the map it is a point with a name, such as "Okrika" or "Bori". Roads and waterways show the terrain. Settlements show where people are, which is what lets the platform later relate climate hazards (a flood-prone river, a ward) to the communities they affect. This layer only supplies the data for that. It doesn't do the analysis.

- **Source.** The GRID3 settlement-names dataset for Nigeria ([`rivers_state_settlement_names.geojson`](../rivers_state_settlement_names.geojson), 1,149 points for Rivers State). Each point carries GRID3's own id (`set_id`), a name, a ward code, a "primary" flag and an origin, which records who GRID3 got the point from (OSGOF, OCHA, INEC polling units and so on).
- **Storage.** One row per point in `settlement_points` ([`settlement-point.entity.ts`](../server/src/modules/map-layers/settlement-point.entity.ts)): `settlement_name`, `is_primary` (the ward's main community), `data_origin`, a `Point` geometry and a required `source_id`.
- **Link to a ward.** `admin_unit_id` points at the ward the settlement sits in. The loader finds it by matching the file's ward code to an imported ward. The link may be null: if the ward isn't loaded yet, the settlement is still stored, and the next loader run links it.
- **Served by** `GET /api/v1/settlements/geojson?bbox=&zoom=`, with properties `id`, `name` and `isPrimary`. It is never thinned by zoom, and a reply holds at most 5,000, primary settlements first.

**How it differs from roads and waterways.** Roads and waterways belong to a **country**: `layers:clear` deletes them by country, and they stop the country from being deleted. Settlements belong to **wards**. Clearing and re-importing wards never deletes them (they become unlinked until the next load), `layers:clear` doesn't touch them, and they don't block a country delete.

## How it works

All paths are relative to `server/`. The module is [`src/modules/map-layers/`](../server/src/modules/map-layers/). Requests flow validation → auth → controller → service → repository → PostGIS, as in [architecture.md](architecture.md).

### 1. The tables

[`1791400000000-CreateMapLayerTables.ts`](../server/src/migrations/1791400000000-CreateMapLayerTables.ts) creates three tables and inserts no rows. Apply it with `npm run migration:run` ([database-and-migrations.md](database-and-migrations.md)).

| Table | Key columns | Shape | Unique key |
|---|---|---|---|
| `roads` | `country_code`, `osm_id`, `name`, `road_class` (the OSM `highway` tag), `class_rank` (1 to 8), `surface`, `smoothness`, `width`, `lanes`, `oneway`, `is_bridge` | `MultiLineString`, 4326 | `osm_id` |
| `waterways` | `country_code`, `osm_id`, `name`, `waterway_type` (raw OSM tag), `water_tag`, `water_class` (`river`, `creek` or `other`), `class_basis` (how the class was decided), `tunnel`, `covered`, `width` | `MultiLineString` or `MultiPolygon`, 4326 | `osm_id` |
| `settlement_points` | `admin_unit_id` (the ward, may be null), `source_settlement_code` (GRID3 `set_id`), `source_ward_code`, `settlement_name`, `is_primary`, `data_origin` | `Point`, 4326 | `source_settlement_code` |

Every table has `source_id` (required, `ON DELETE RESTRICT`), `created_at` and `updated_at`. Each also has the same second gate as `admin_units`: a `CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom))` and a **GiST index** on `geom`. Other indexes: `roads (country_code, class_rank)`, `waterways (country_code, water_class)` and `settlement_points (admin_unit_id)`.

The tables differ from the ERD sketch in two deliberate ways:
- **`settlement_points.admin_unit_id` is nullable, `ON DELETE SET NULL`.** Clearing and re-importing the wards (on the Countries page) never fails and never deletes settlements. The next loader run links them again.
- **`roads.class_rank` is stored.** The zoom filter becomes a plain indexed comparison rather than a lookup on every row.

`roads` and `waterways` reference `countries (country_code)` with `ON DELETE RESTRICT`. That's what the country-delete change in section 5 deals with.

### 2. Thinning by zoom, and the cap

The rules are pure functions in [`layer-rules.ts`](../server/src/modules/map-layers/layer-rules.ts). The repositories turn them into SQL.

**Roads.** Each OSM road type has a rank, and a zoom shows ranks up to a limit:

| Zoom | Least important rank shown | Adds |
|---|---|---|
| below 9 | 2 | motorway, trunk, primary (and their links) |
| 9 | 3 | secondary |
| 10 | 4 | tertiary |
| 11 | 5 | unclassified |
| 12 | 6 | residential, living street |
| 13 | 7 | service |
| 14 and up, or no zoom | 8 | everything else (track, path, footway...) |

**Waterways.** Rivers below zoom 9, rivers and creeks at zoom 9 and 10, everything from zoom 11 (or with no zoom).

**Settlements.** No thinning: points are small, and Rivers State has 1,149.

**Simplification.** With a zoom, road and waterway shapes are simplified to about one screen pixel (`ST_SimplifyPreserveTopology`, tolerance `180 / (512 × 2^zoom)` degrees). That's the same rule the admin-unit layers use. Points are never simplified.

**The cap.** No reply holds more than 12,000 roads, 6,000 waterways or 5,000 settlements. The query reads one extra row only to learn whether the cap was hit, and the reply then says `"truncated": true`. Rows are ordered so the cap drops the least important first:
- roads by `class_rank`;
- waterways rivers → creeks → other;
- settlements primary first, then by name.

### 3. The endpoints

All under `/api/v1/`, mounted in [`app.ts`](../server/src/app.ts) after the single `authMiddleware`. Routes are in [`map-layer.routes.ts`](../server/src/modules/map-layers/map-layer.routes.ts).

| Method and path | Who | What it returns |
|---|---|---|
| `GET /map-layers` | Everyone | Each layer's `id`, `label`, `featureCount` and `sources` (the full data-source records behind its rows) |
| `GET /roads/geojson?bbox=&zoom=` | Everyone | Roads in the box. Properties: `id`, `name`, `roadClass`, `surface`, `oneway`, `isBridge` |
| `GET /waterways/geojson?bbox=&zoom=` | Everyone | Waterways in the box. Properties: `id`, `name`, `waterClass`, `waterwayType`, `tunnel` |
| `GET /settlements/geojson?bbox=&zoom=` | Everyone | Settlements in the box. Properties: `id`, `name`, `isPrimary` |

- `bbox` is **required** (`minLon,minLat,maxLon,maxLat`, EPSG:4326, min < max). Without it the request gets `400` "bbox is required: map layers are only served for a visible area", and never reaches the database ([`map-layer.validation.ts`](../server/src/modules/map-layers/map-layer.validation.ts)).
- `zoom` is optional, 0 to 24. Leaving it out means no thinning and no simplification, but the cap still applies.
- A GeoJSON reply is a `FeatureCollection` with one extra field, `truncated`, inside the usual envelope ([errors-and-responses.md](errors-and-responses.md)).

```http
GET /api/v1/roads/geojson?bbox=6.9,4.7,7.1,4.9&zoom=12
Authorization: Bearer <firebase-id-token>
```

```json
{ "success": true, "message": "OK",
  "data": { "type": "FeatureCollection", "truncated": false,
            "features": [ { "type": "Feature", "id": "…", "geometry": { "type": "MultiLineString", "coordinates": [ … ] },
                            "properties": { "id": "…", "name": "Aba Road", "roadClass": "trunk", "surface": "asphalt", "oneway": null, "isBridge": false } } ] } }
```

Like admin areas, these layers are shared reference data, so reads are **not** narrowed by a user's region scope ([`map-layer.service.ts`](../server/src/modules/map-layers/map-layer.service.ts)).

### 4. The loader script, `npm run layers:load`

These files can't go through the Imports screen, which takes boundary polygons up to 20,000 rows ([data-import.md](data-import.md)). They are lines and points, and the roads file alone has 47,507 features. So [`src/scripts/load-map-layers.ts`](../server/src/scripts/load-map-layers.ts) loads them directly. It needs `DATABASE_URL`, which in practice limits it to administrators. Like the first-admin script, it's the documented exception to AI rule 9.

```bash
# from server/
npm run layers:load -- --zip ../rivers_map_layers_2026-10-27.zip --dry-run
npm run layers:load -- --zip ../rivers_map_layers_2026-10-27.zip
npm run layers:load -- --settlements ../rivers_state_settlement_names.geojson --settlements-source <data-source-uuid>
```

| Flag | Meaning |
|---|---|
| `--zip` | The delivery zip: `provenance.json` plus the roads, waterways and waterway-polygon GeoJSON files |
| `--settlements` | The GRID3 settlement-names GeoJSON |
| `--settlements-source` | The id of that file's data source. Add it first on **Imports → New import → Add a source** |
| `--country` | Country code, default `NGA` |
| `--ward-level` | The admin level that holds wards, default `3` |
| `--dry-run` | Do everything, then roll back. You see the counts, and nothing is kept |

**What it does** ([`map-layer-loader.service.ts`](../server/src/modules/map-layers/map-layer-loader.service.ts)):

1. **Provenance first** ([`map-layer-provenance.ts`](../server/src/modules/map-layers/map-layer-provenance.ts)):
   - It opens the zip (the 100 MB unpacked limit guards against a zip bomb) and reads `provenance.json`.
   - A zip with no provenance, or with a layer the provenance doesn't list, is refused, so nothing reaches the map unsourced.
   - Each entry becomes a data source. For example, `HDX dataset 'Roads of Nigeria' (OpenStreetMap contributors)` becomes provider **"OpenStreetMap contributors via HDX"** and dataset **"Roads of Nigeria (HDX)"**.
   - The licence and download date are copied as written. A missing licence, URL or `YYYY-MM-DD` date stops the load: nothing is guessed.
   - The waterway lines and areas come from one dataset, so they share one source row.
   - The notes record the clipping boundary (geoBoundaries, CC BY 4.0).
2. **Every file is read and checked before the database is touched** ([`map-layer-rows.ts`](../server/src/modules/map-layers/map-layer-rows.ts)):
   - A file that isn't a `FeatureCollection`, or that declares a CRS other than WGS84, is refused. The CRS check `assertWgs84Crs` is now shared with the import pipeline's [`geojson-reader.ts`](../server/src/modules/data-sources/imports/readers/geojson-reader.ts).
   - Features missing their id, class, name, ward code or shape are left out and counted by reason.
   - GRID3's single-space "no value" is read as blank.
   - Text that doesn't fit its column is refused, never cut short.
   - A duplicate id in the file is reported, not silently skipped.
3. **One transaction, in batches of 1,000** ([`map-layer-load.repository.ts`](../server/src/modules/map-layers/map-layer-load.repository.ts)). PostGIS applies the same shape rules as the import pipeline: readable, right type, repaired if invalid, real coordinates, inside the country's rough bounding box. Then:
   - Rows are inserted with `ON CONFLICT DO NOTHING`, so **running it twice is harmless**: stored rows are counted as "already there" and never overwritten.
   - Each settlement's ward is looked up by its GRID3 ward code (`unit_code` at `--ward-level`).
   - A settlement with no matching ward is still stored, unlinked. A later run links it once the ward exists. That is the only update the loader ever makes.
   - Any failure rolls everything back.

The script prints a report per layer: features in the file, source id (and whether this run recorded it), added, already there, left out by reason and, for settlements, linked later and no ward found.

### 5. Clearing layers and deleting a country

**`npm run layers:clear`** ([`src/scripts/clear-map-layers.ts`](../server/src/scripts/clear-map-layers.ts)) is the reverse of `layers:load`: it removes a country's roads and/or waterways in one transaction (`MapLayerLoaderService.clear`). Use it to reload a layer from scratch, or before deleting a country.

```bash
# from server/
npm run layers:clear -- --country NGA --dry-run
npm run layers:clear -- --country NGA --yes
npm run layers:clear -- --country NGA --layers waterways --yes
```

| Flag | Meaning |
|---|---|
| `--country` | Country code (required; there is no default for a delete) |
| `--layers` | Comma-separated, from `roads`, `waterways`. Default: both |
| `--dry-run` | Delete, count, then roll back: shows what would go and keeps everything |
| `--yes` | Required for a real run, so a mistyped command can't delete by accident |

Data source records are kept (other rows or history may still cite them), and settlements are not touched: they belong to wards, not to the country.

**Country delete.** `CountryRepository.deleteIfEmpty` ([`country.repository.ts`](../server/src/modules/admin-units/country.repository.ts)) already refused a country with areas. Now a foreign-key violation from `roads` or `waterways` also returns "not deleted", and `CountryService` answers `409` with "Nigeria now has areas or map layer data (roads, waterways), so it can't be deleted". Settlements don't block it: they hang off wards, not the country. Run `npm run layers:clear -- --country <code> --yes` first if a country that holds roads or waterways needs to be deleted.

### 6. Tests

| File | Covers |
|---|---|
| [`tests/integration/map-layers.test.ts`](../server/tests/integration/map-layers.test.ts) | The four endpoints: catalogue with sources, bbox and zoom validation (`400`), `truncated`, sign-in required (`401`) |
| [`tests/unit/map-layer-rules.test.ts`](../server/tests/unit/map-layer-rules.test.ts) | Road ranks, what each zoom shows, the caps, simplification |
| [`tests/unit/map-layer-rows.test.ts`](../server/tests/unit/map-layer-rows.test.ts) | Reading files (no row cap, CRS), building rows, reject reasons, duplicates, GRID3 blanks |
| [`tests/unit/map-layer-provenance.test.ts`](../server/tests/unit/map-layer-provenance.test.ts) | Opening the zip, reading `provenance.json`, turning entries into sources, refusing unsourced layers |
| [`tests/unit/map-layer-loader.test.ts`](../server/tests/unit/map-layer-loader.test.ts) | Batching, running twice, dry run, one transaction for zip and settlements, clearing layers (`clear`), bad requests |
| [`tests/unit/map-layer.service.test.ts`](../server/tests/unit/map-layer.service.test.ts) | The catalogue and source lookup |

The in-memory fakes are in [`tests/map-layer-fakes.ts`](../server/tests/map-layer-fakes.ts). Run them with `npm test` ([testing.md](testing.md)).

## Resources to read

- PostGIS `ST_MakeEnvelope`, `&&` and `ST_Intersects`: https://postgis.net/docs/ST_MakeEnvelope.html, https://postgis.net/docs/geometry_overlaps.html
- PostGIS `ST_SimplifyPreserveTopology`: https://postgis.net/docs/ST_SimplifyPreserveTopology.html
- PostGIS spatial indexes (GiST): https://postgis.net/workshops/postgis-intro/indexing.html
- PostgreSQL `INSERT ... ON CONFLICT`: https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT
- OSM `highway` values (what the road ranks are built from): https://wiki.openstreetmap.org/wiki/Key:highway
- HDX / HOT OSM exports: https://data.humdata.org/dataset/hotosm_nga_roads
- ODbL attribution (why the provider name is shown on the map): https://www.openstreetmap.org/copyright
- GRID3 Nigeria settlement names: https://grid3.org/
- Node `util.parseArgs` (the script's flags): https://nodejs.org/api/util.html#utilparseargsconfig

## Explain it like I'm new to this

Think of a paper road atlas. The whole-country page shows only the motorways and big rivers. Turn to a city page and you see every street and stream. The atlas doesn't print all 47,507 streets on the country page, because nobody could read it. The server works the same way. The map tells it "this is the patch I'm looking at, and this is how close I am", and the server sends only what's worth drawing at that distance, up to a fixed maximum. If even that's too much, it says "I cut this short, zoom in."

Every page of a good atlas also has small print saying who surveyed it and when. Here, every road, river and village row points at a data source record, and the loader refuses any file that doesn't say where it came from. Loading is like restocking a shelf from a delivery crate: the loader checks the packing slip (`provenance.json`) first, puts each item on the shelf once, and skips anything that's already there. If anything in the crate is damaged, the whole crate goes back and the shelf is left as it was.
