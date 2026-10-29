# Buildings Layer: Outlines from OpenStreetMap

## What was built

The map can now draw **every mapped building in Rivers State**: 414,556 outlines from the data team's Geofabrik OpenStreetMap extract. Buildings are the platform's exposure layer. Once a flood zone or a ward is known, they answer "what is in it?". Each building is linked to its ward, so "how many buildings are in this ward?" is one indexed query.

The backend part is:

- **One table, `buildings`**, the Backlog2 ERD's BUILDINGS. Every row has a data source, a country, a ward link and its outline.
- **Loading, two ways:** **Imports → New import → Map layer: Buildings** in the web app, or `npm run layers:load -- --buildings <extract zip> --buildings-source <id>`. Buildings are streamed, so a load peaks at about 280 MB of memory and fits on Render's free plan (see section 4).
- **Recovery of cut-short GeoPackages.** One of the two buildings files arrived without its last 4.7 MB. Its rows were all there; only its index was missing. The reader now recovers such a file and says so in the load report.
- **A read endpoint, `GET /api/v1/buildings/geojson?bbox=&zoom=`**, which serves outlines only at street level (zoom 15 and up), plus a `buildings` entry in `GET /api/v1/map-layers`.
- **Clearing:** `npm run layers:clear -- --layers buildings`. A country that still has buildings can't be deleted (`409`), like the other layers.

On the client, the home map has a **Buildings** toggle and legend row. Below zoom 15 the toggle says "Zoom in to street level to see them", and nothing is fetched.

### What's in the files

| File | Rows | Notes |
|---|---|---|
| `gis_osm_buildings_a_free_1_rivers.gpkg` | 258,270 | Cut short: 59.9 of 64.4 MB arrived. GDAL's own count (`gpkg_ogr_contents`) is 258,270, and all 258,270 rows were recovered, numbered 1 to 258,270 with no gaps. The missing tail held the spatial index and part of the table of contents |
| `gis_osm_buildings_a_free_2_rivers.gpkg` | 156,286 | Complete |

Geofabrik splits buildings into numbered parts once a file would get too large; the parts don't overlap. Every row is `fclass = building`. About 2% carry a more specific OSM tag in `type`, kept as `building_type`: house (3,556), residential (1,959), construction (1,300), apartments (301), school (144)... About 900 have a name.

## How it works

Paths are relative to `server/`. The module is [`src/modules/map-layers/`](../server/src/modules/map-layers/).

### 1. The table

[`1791500100000-CreateBuildingsTable.ts`](../server/src/migrations/1791500100000-CreateBuildingsTable.ts). Apply it with `npm run migration:run`.

| Column | Meaning |
|---|---|
| `country_code` | Required. References `countries`, `ON DELETE RESTRICT` |
| `admin_unit_id` | The ward covering a point inside the outline (`ST_PointOnSurface`), so a building on a ward line counts once. Nullable, `ON DELETE SET NULL` |
| `osm_id` | OpenStreetMap's id. **Unique**: loading twice adds nothing |
| `name`, `building_type` | Usually null |
| `geom` | `MultiPolygon`, 4326. A repaired outline can come out in two parts, so the column takes both |
| `source_id` | Required, `ON DELETE RESTRICT` |

It has the usual validity `CHECK` and GiST index, plus indexes on `admin_unit_id` (for per-ward counts) and `country_code` (for clearing).

### 2. Reading a cut-short GeoPackage

A GeoPackage is a SQLite database. SQLite can't open a file whose end is missing: page 1 holds the start of its table of contents, and the rest is in the missing tail, so even listing the tables fails with "database disk image is malformed". The rows themselves are stored on their own pages, and most of those arrived.

[`gpkg-reader.ts`](../server/src/modules/map-layers/gpkg-reader.ts) compares the size recorded in the file's header with the bytes that arrived. When the file is short, it hands it to [`gpkg-recover.ts`](../server/src/modules/map-layers/gpkg-recover.ts), which reads it the way SQLite's own `.recover` command does:

1. Every **table leaf page** that is present is decoded into records. A record whose data continues on a page that is missing is counted as damaged and left out.
2. Among those records it finds the GeoPackage's bookkeeping rows: `gpkg_contents` (which table holds features), `gpkg_geometry_columns` (its geometry column and CRS) and `gpkg_spatial_ref_sys` (what that CRS is). It also finds the table's `CREATE TABLE` statement, which SQLite itself reads to get the column names.
3. Every record with exactly that layout and a GeoPackage geometry is a feature row. Duplicates (a freed copy of a page) are dropped by row id.
4. GDAL's count (`gpkg_ogr_contents.feature_count`, or `sqlite_sequence`) says how many rows there should be.

The reader then decides:

| What was recovered | What happens |
|---|---|
| Every row the file records | Loaded. The report notes: "…was cut short (59.9 of 64.4 MB), but all 258,270 of its rows were in the part that arrived; only its index was missing." |
| Fewer rows, or an unknown count | Refused: "…only X of Y rows could be recovered. Ask for a fresh copy, or load what is there on purpose with `--accept-partial`". With `--accept-partial` it loads, and the note says how many are missing |
| The bookkeeping or `CREATE TABLE` itself is in the missing part | Refused: the file can't be recovered |

The CRS rule doesn't change: a recovered file must still be EPSG:4326.

### 3. Rows and inserts

- [`osm-extract.ts`](../server/src/modules/map-layers/osm-extract.ts) `osmFiles("buildings", …)` takes only `gis_osm_buildings_a_free_<n>.gpkg` from the extract (about 97 MB unpacked, under the 100 MB `IMPORT_MAX_UNZIPPED_MB` default; raise it if a later extract is bigger).
- [`map-layer-rows.ts`](../server/src/modules/map-layers/map-layer-rows.ts) `prepareBuildings` needs an `osm_id` and a shape, and keeps `name` and `type`.
- [`map-layer-load.repository.ts`](../server/src/modules/map-layers/map-layer-load.repository.ts) `insertBuildings` runs the same PostGIS checks as every layer (readable, polygon, repaired if invalid, real coordinates, inside the country's box). It then stores the outline as a 2D MultiPolygon and links the ward covering `ST_PointOnSurface(outline)`. A building already stored is counted and left alone; one stored without a ward is linked once its ward exists.
- 414,556 rows go in about 415 batches of 1,000, in one transaction (`--dry-run` rolls it back).

### 4. Streaming, so the Imports screen can take it

Holding all 414,000 decoded shapes at once peaks around 870 MB, more than the 512 MB the API has on Render's free plan. So buildings are never held all at once:

- [`osm-extract.ts`](../server/src/modules/map-layers/osm-extract.ts) lists the zip's building files without unpacking them; each file is unpacked only when it is read, and dropped after.
- [`gpkg-reader.ts`](../server/src/modules/map-layers/gpkg-reader.ts) `openGeoPackage` hands out features one at a time (a SQLite cursor for an intact file; for a cut-short one, `gpkg-recover.ts` counts the rows first, then decodes the pages again as they are read).
- [`map-layer-loader.service.ts`](../server/src/modules/map-layers/map-layer-loader.service.ts) `streamBuildings` reads each file **twice**. The first pass, before the database is opened, checks every row and keeps only the counts and reasons, so a bad file is still refused with nothing written. The second pass, inside the transaction, fills and inserts one batch of 1,000 at a time.

Measured on the real extract: the whole load, including the 58 MB upload held in memory, peaks at about **280 MB** and takes about 11 seconds before the database work. Facilities stay on the simpler read-it-all path: they are about a megabyte.

The browser waits up to 20 minutes for a buildings upload (other layers: 3), since inserting 414,000 outlines and finding each one's ward takes minutes on the database.

### 5. The endpoint

`GET /api/v1/buildings/geojson?bbox=&zoom=`, for any signed-in user, with `bbox` required ([map-layers.md](map-layers.md) section 3).

- **Below zoom 15** the reply is an empty collection, and the database isn't queried.
- **From zoom 15** (or with no zoom) it returns the outlines in the box, at most **10,000**, with `truncated: true` if there were more. A zoom-15 view of central Port Harcourt holds a few thousand.
- Properties: `id`, `name`, `buildingType`. Coordinates have 6 decimals (about 10 cm). Outlines are not simplified: at street level they're already a few pixels across.

### 6. Loading it

1. Apply the migration (`npm run migration:run` from `server/`, or let the next Render deploy do it).
2. The source: use the same "OpenStreetMap contributors via Geofabrik" source as infrastructure (same extract). If it isn't there yet, add it on **Imports → New import → Add a source** (licence ODbL 1.0, the extract's download URL and date).
3. **In the web app:** Imports → New import, Level **Map layer: Buildings**, choose the source, and upload the extract zip (it fits under the 60 MB upload limit). Leave **Load even if rows are missing** unticked: the cut-short file loads anyway, because all its rows arrived. Keep the page open until the report appears; it lists both files, the first with the cut-short note. If buildings are already loaded, the same screen shows a **Clear Buildings** button.
4. **Or from `server/`:**

```bash
npm run migration:run
npm run layers:load -- --buildings ../osm-20261027T194914Z-1-001.zip --buildings-source <data-source-uuid> --dry-run
npm run layers:load -- --buildings ../osm-20261027T194914Z-1-001.zip --buildings-source <data-source-uuid>
```

The report lists both files. The first carries the cut-short note, and each shows how many rows were added, already there, left out and linked to no ward. Load the wards first (they are), or the buildings are stored unlinked and linked by the next run.

To remove the layer: `npm run layers:clear -- --country NGA --layers buildings --yes`.

### 7. The client

- [`client/src/components/map/map-style.ts`](../client/src/components/map/map-style.ts): `BUILDING_MIN_ZOOM = 15`, and `buildingFill` / `buildingLine` (a light tan fill with a darker outline, both with `minzoom` 15).
- [`MapOverlayLayers.tsx`](../client/src/components/map/MapOverlayLayers.tsx) draws buildings above the waterways and under the roads, so streets stay readable.
- [`MapPage.tsx`](../client/src/pages/map/MapPage.tsx) fetches buildings only while the toggle is on **and** the map is at zoom 15 or closer. [`overlay-layers.ts`](../client/src/utils/overlay-layers.ts) shows "Zoom in to street level to see them" below that.
- [`ImportNewPage.tsx`](../client/src/pages/admin/imports/ImportNewPage.tsx) has the **Map layer: Buildings** option, picked automatically for a `gis_osm_buildings_a_free_*.gpkg` file (an `osm-…zip` defaults to Infrastructure; choose Buildings for the same zip). For both OpenStreetMap layers it shows a **Load even if rows are missing** checkbox, sent as `acceptPartial`. The load report shows each file's notes, such as the cut-short message.

### 8. Tests

| File | Covers |
|---|---|
| [`tests/unit/map-layer-buildings.test.ts`](../server/tests/unit/map-layer-buildings.test.ts) | Recovery returns exactly SQLite's rows on an intact file. On a cut-short file it reads the rows, and refuses when the schema is gone. The reader loads a complete cut-short file with a note, refuses missing rows unless asked, and keeps the CRS rule. Also: `prepareBuildings`, picking the building files, and the loader end to end (both parts, refusal before the database opens, `acceptPartial`, clearing) |
| [`tests/gpkg-fixtures.ts`](../server/tests/gpkg-fixtures.ts) | Builds GeoPackages with the spec's own table layouts, a recorded feature count and trailing "index" pages, and `cutShort()` drops the tail as an interrupted copy does |
| [`tests/integration/map-layers.test.ts`](../server/tests/integration/map-layers.test.ts) | `GET /buildings/geojson` validation and sign-in; the catalogue lists five layers |
| `client/src/utils/*.test.ts`, [`cypress/e2e/geography/map.cy.ts`](../client/cypress/e2e/geography/map.cy.ts) | The zoom hint, the layer in the address, and fetching buildings only at street level |

Recovery was also checked on the real files: the intact file gave the same 156,286 rows SQLite reads, and the cut-short one gave 258,270 of 258,270, all valid MultiPolygons inside Rivers State. As with the other layers, the PostGIS SQL isn't run by the test suite. Run `--dry-run` against a database with the migration applied before the real load.

## Resources to read

- SQLite file format (pages, b-trees, records, overflow): https://www.sqlite.org/fileformat.html
- SQLite's `.recover` command, the same idea: https://www.sqlite.org/recovery.html
- GeoPackage tables (`gpkg_contents`, `gpkg_geometry_columns`, `gpkg_spatial_ref_sys`): https://www.geopackage.org/spec/
- GDAL's GeoPackage driver and `gpkg_ogr_contents`: https://gdal.org/en/stable/drivers/vector/gpkg.html
- PostGIS `ST_PointOnSurface`: https://postgis.net/docs/ST_PointOnSurface.html
- OSM `building` values: https://wiki.openstreetmap.org/wiki/Key:building

## Explain it like I'm new to this

Picture a thick binder of building plans, one plan per page, with an index at the back. Someone photocopied it and the last few pages didn't come out. You can't use the index any more, but every plan you need is still in the pages that came through. And the cover says "258,270 plans inside".

The loader does what you would do. It leafs through every page that arrived, picks out the plans, and counts them. If the count matches the cover, nothing is missing, and it files them all, adding a note that the copy was short. If the count is lower, it stops and asks before filing an incomplete binder.

On the map, buildings are like the street-level page of an atlas: on the whole-state page they would be a smudge, so they only appear once you're zoomed in to streets.
