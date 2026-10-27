# Infrastructure Layer: Facilities from OpenStreetMap

## What was built

The map can now show the **facilities people depend on in an emergency**: hospitals, clinics and pharmacies, schools, police, government offices, markets, ferry terminals and other transport, community centres, places of worship, water points and telecom towers. They come from the data team's Geofabrik OpenStreetMap extract (`osm-20261027T194914Z-1-001.zip`, 21 GeoPackages clipped to Rivers State).

The backend part is:

- **One table, `infrastructure`**, the Backlog2 ERD's INFRASTRUCTURE. Every row has a data source, a country, a facility type and a point, and is linked to the ward it sits in.
- **A GeoPackage reader** (`.gpkg` files are SQLite databases). It runs on [sql.js](https://sql.js.org/), which is WebAssembly, so nothing native has to build on Render. It also spots a file that was cut short and says so plainly.
- **Loading through the existing loader:** `npm run layers:load -- --infrastructure <zip or .gpkg> --infrastructure-source <id>`, or **Imports → New import → Map layer: Infrastructure** in the web app.
- **A read endpoint, `GET /api/v1/infrastructure/geojson?bbox=&zoom=`**, plus an `infrastructure` entry in `GET /api/v1/map-layers`.
- **Clearing:** `npm run layers:clear -- --layers infrastructure`, or the Clear button on the Imports screen. A country that still has facilities can't be deleted (`409`), the same as for roads and waterways.

On the client, the home map has a **Facilities** toggle and five legend rows. The facilities' source is listed in the Data sources panel.

### What's in the extract, and what this layer uses

Of the extract's 21 files, this layer reads six: points of interest, places of worship and transport, each as points and as areas (`gis_osm_{pois,pofw,transport}[_a]_free_1_rivers.gpkg`). From the current extract that gives **826 facilities out of 2,288 features**:

| Type | Kept | OSM classes |
|---|---|---|
| `education` | 204 | school, college, university, kindergarten |
| `water` | 193 | water_well, water_tower, water_works, wastewater_plant, drinking_water |
| `health` | 153 | hospital, clinic, doctors, dentist, pharmacy, chemist, nursing_home |
| `transport` | 95 | ferry_terminal, helipad, bus_station, airport, airfield, railway_station |
| `worship` | 85 | christian, christian_anglican, muslim... (every pofw class) |
| `market` | 33 | marketplace, mall |
| `community` | 31 | community_centre, library |
| `telecom` | 13 | comms_tower |
| `emergency` | 10 | police, fire_station |
| `government` | 9 | town_hall, courthouse, post_office |

The other 1,462 features (kiosks, hairdressers, sports pitches, hotels, shops...) are left out on purpose. The loader counts them under one reason, so the report shows how many.

The rest of the extract isn't loaded by this layer:

- **Roads and waterways** duplicate what is already loaded from HDX ([map-layers.md](map-layers.md)).
- **Places and admin areas** are skipped: GRID3 settlements and the official boundaries are better sources.
- **Buildings** are the next candidate (about 156,000 footprints in the readable file). **`gis_osm_buildings_a_free_1_rivers.gpkg` is cut short:** it should be 64.4 MB but is 59.9 MB, so it can't be read. Ask the data team for a fresh copy before buildings are built.

## How it works

Paths are relative to `server/` unless they start with `client/`. The module is [`src/modules/map-layers/`](../server/src/modules/map-layers/).

### 1. The table

[`1791500000000-CreateInfrastructureTable.ts`](../server/src/migrations/1791500000000-CreateInfrastructureTable.ts). Apply it with `npm run migration:run`.

| Column | Meaning |
|---|---|
| `country_code` | Required. References `countries`, `ON DELETE RESTRICT` |
| `admin_unit_id` | The ward whose shape covers the point. Nullable, `ON DELETE SET NULL` |
| `osm_id`, `from_area` | The OSM id as Geofabrik writes it, and whether OSM mapped the facility as an outline. **Unique together**: OSM numbers nodes and ways separately, so a point and an outline can share a number |
| `name` | May be null: about half of OSM facilities have no name |
| `facility_type` | One of the ten types above (`CHECK`) |
| `osm_class` | Geofabrik's `fclass` as delivered (`clinic`, `ferry_terminal`...) |
| `geom` | `Point`, 4326. An outline is stored as a point inside it (`ST_PointOnSurface`) |
| `source_id` | Required, `ON DELETE RESTRICT` |

It has the same validity `CHECK` and GiST index as the other layer tables, plus indexes on `(country_code, facility_type)` and `admin_unit_id`.

### 2. Reading the GeoPackages

- [`osm-extract.ts`](../server/src/modules/map-layers/osm-extract.ts) takes the upload. For a zip, it unpacks only the six facility files, so a 60 MB delivery unpacks to about a megabyte, and the zip-bomb limit still applies. A single `.gpkg` is passed through as it is.
- [`gpkg-reader.ts`](../server/src/modules/map-layers/gpkg-reader.ts) opens each file with sql.js, finds its one feature table, and refuses a CRS other than EPSG:4326 (rule 7). Each row becomes a feature: the columns are its properties, and the geometry is decoded to GeoJSON.
  - Before opening a file, it compares the database size in the SQLite header with the file's real length. A truncated file fails with "*name* is cut short: it should be X MB but is Y MB", not SQLite's vague "malformed".
- [`gpkg-geometry.ts`](../server/src/modules/map-layers/gpkg-geometry.ts) decodes a GeoPackage geometry blob: the "GP" header, then standard WKB. It handles both byte orders, ISO and EWKB Z/M flags (the extra values are dropped), and empty shapes. A blob it can't read becomes "no shape", and that row alone is left out.

### 3. Rows, checks and inserts

- [`map-layer-rows.ts`](../server/src/modules/map-layers/map-layer-rows.ts) `prepareInfrastructure` maps each `fclass` to a type ([`layer-rules.ts`](../server/src/modules/map-layers/layer-rules.ts) `facilityTypeOf`) and counts what it leaves out: not a facility type, no `osm_id`, no `fclass`, no shape, text too long, or the same id twice.
- [`map-layer-load.repository.ts`](../server/src/modules/map-layers/map-layer-load.repository.ts) `insertInfrastructure` runs the same PostGIS checks as every layer: readable, right type (point or polygon), repaired if invalid, real coordinates, inside the country's box. It then:
  - turns each outline into a point inside it;
  - finds the ward at `--ward-level` whose shape covers the point (`ST_Covers`, using the GiST index);
  - inserts the row.
- **Running it twice is harmless.** A stored row is counted as "already there". The only update is linking a facility that was stored without a ward, once that ward exists (the same rule as settlements). A point outside every loaded ward is still stored, and counted under "no ward found".
- Everything is one transaction, batched by 1,000, with `--dry-run` available, like the rest of the loader.

### 4. The endpoint

`GET /api/v1/infrastructure/geojson?bbox=&zoom=`, for any signed-in user. `bbox` is required and `zoom` is optional ([map-layers.md](map-layers.md) section 3). Each feature has the properties `id`, `name`, `facilityType` and `osmClass`.

**Thinning by zoom** (`facilityTypesAtZoom`):

| Zoom | Types shown |
|---|---|
| below 10 | health, emergency |
| 10 and 11 | + education, government, market, transport |
| 12 and up, or no zoom | all ten |

At most 5,000 points per reply, in the order of `FACILITY_TYPES` (health first), so a cap drops the least important. Points are never simplified.

### 5. Loading it

1. Add the source: **Imports → New import → Add a source**. Fill in provider "OpenStreetMap contributors via Geofabrik", a dataset name such as "Geofabrik OpenStreetMap extract, Rivers State", the Geofabrik download URL, licence "ODbL 1.0" and the download date. Get the exact URL and date from the data team. The zip has no `provenance.json`, so they aren't guessed.
2. Load the extract with either:

```bash
# from server/
npm run migration:run
npm run layers:load -- --infrastructure ../osm-20261027T194914Z-1-001.zip --infrastructure-source <data-source-uuid> --dry-run
npm run layers:load -- --infrastructure ../osm-20261027T194914Z-1-001.zip --infrastructure-source <data-source-uuid>
```

or, in the app: **Imports → New import**, Level **Map layer: Infrastructure**, choose the source, then upload the zip (it fits under the 60 MB upload limit). The report lists each facility file with how many rows were added, already there, left out (by reason) and linked to no ward.

To remove the layer: `npm run layers:clear -- --country NGA --layers infrastructure --yes`.

### 6. The client

- [`client/src/components/map/map-style.ts`](../client/src/components/map/map-style.ts): `OVERLAY_LAYER_IDS` includes `infrastructure`. `FACILITY_GROUP_OF` puts the ten types into five colour groups (health, schools, police and government, community and worship, other). `infrastructureDots` and `infrastructureLabels` draw them, with names from zoom 13.
- [`MapOverlayLayers.tsx`](../client/src/components/map/MapOverlayLayers.tsx) draws the layer on top of the settlements. [`MapPage.tsx`](../client/src/pages/map/MapPage.tsx) adds the **Facilities** toggle and the five legend rows. [`overlay-layers.ts`](../client/src/utils/overlay-layers.ts) shows "Health and police first: more appear as you zoom in" below zoom 12.
- [`ImportNewPage.tsx`](../client/src/pages/admin/imports/ImportNewPage.tsx) adds the **Map layer: Infrastructure** option and accepts `.gpkg`. A zip whose name starts with `osm`, or a `.gpkg`, selects that option automatically.

### 7. Tests

| File | Covers |
|---|---|
| [`tests/unit/map-layer-infrastructure.test.ts`](../server/tests/unit/map-layer-infrastructure.test.ts) | Decoding blobs (byte order, Z values, empty and broken blobs), reading GeoPackages (CRS, not a GeoPackage, cut short), picking the facility files from a zip, the type mapping and zoom steps, row building and reject reasons, the loader end to end against fakes |
| [`tests/gpkg-fixtures.ts`](../server/tests/gpkg-fixtures.ts) | Builds real GeoPackages in memory for those tests |
| [`tests/integration/map-layers.test.ts`](../server/tests/integration/map-layers.test.ts) | `GET /infrastructure/geojson`: bbox and zoom validation, sign-in required. The catalogue lists four layers |
| [`tests/unit/map-layer-loader.test.ts`](../server/tests/unit/map-layer-loader.test.ts), [`map-layer.service.test.ts`](../server/tests/unit/map-layer.service.test.ts) | Clearing infrastructure; the catalogue entry and its source |
| `client/src/utils/*.test.ts`, [`cypress/e2e/geography/map.cy.ts`](../client/cypress/e2e/geography/map.cy.ts) | The hint, the layer in the address, and the toggle, legend and source on the map |

As with the other layers, the PostGIS SQL is not run by the test suite, which never touches a database. Before using it in production, run `--dry-run` against a database with the migration applied, and check the counts against the table above.

## Resources to read

- GeoPackage encoding standard, geometry blobs: https://www.geopackage.org/spec/#gpb_format
- SQLite file format, the database header: https://www.sqlite.org/fileformat.html#the_database_header
- Well-known binary (WKB): https://libgeos.org/specifications/wkb/
- sql.js: https://sql.js.org/
- Geofabrik's free shapefile layers and their `fclass` values: https://download.geofabrik.de/osm-data-in-gis-formats-free.pdf
- PostGIS `ST_PointOnSurface` and `ST_Covers`: https://postgis.net/docs/ST_PointOnSurface.html, https://postgis.net/docs/ST_Covers.html
- OpenStreetMap licence and attribution (ODbL): https://www.openstreetmap.org/copyright

## Explain it like I'm new to this

The OpenStreetMap extract is like a phone directory for the whole state. It lists hairdressers and kiosks, but also every clinic, school and police post. For flood planning we only want the pages that matter in an emergency, so the loader tears those out and files each entry under a heading (Health, Education, Emergency...). Then it pins each entry to the ward it's in, so later we can ask "which clinics are in the wards a flood would reach?"

Some entries in the directory are a single address (a point). Others are a whole compound drawn as an outline, like a hospital's grounds. We store the outline as one pin dropped inside it, so every facility is one dot on the map.

The directory arrives as GeoPackage files, which are small databases. If a file was cut off while being copied, like one of the buildings files, the loader checks the size written on its first page against what actually arrived, and tells you the file is incomplete instead of loading half of it.
