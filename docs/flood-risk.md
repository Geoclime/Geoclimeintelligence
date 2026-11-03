# Flood Risk Map: Importing and Serving It

## What was built

An administrator can now import the data team's **flood risk map** (a classified GeoTIFF) through the same Imports pipeline as boundaries and rainfall: upload, check, review, **Promote**. Once promoted, it is the live map for its country and everyone signed in can see it. The client side (the import screen, the review screen, the "Flood risk" layer, the click popup and the LGA and ward cards) is in [features/flood-risk-overlay.md](features/flood-risk-overlay.md).

- **Two tables.** `flood_risk_layers` holds each imported map: the picture the map draws, the class grid and the cell counts. `admin_unit_flood_risk` holds how many cells of each class fall in each LGA and ward. They arrive through an import run and point at a real data source, like every other row.
- **One import route, `POST /api/v1/imports/flood-risk`** (Administrator only): the GeoTIFF, the country and the data source. It creates a checked run. Nothing is live yet.
- **Read routes for everyone signed in:** the live map for a country, its picture, one area's figures, and the class under a point.
- **A new import target and file type** (`flood_risk_layers`, `geotiff`) on the existing `import_runs` table, so the run shows in the import history, is reviewed on the same screen, and is promoted with the same `POST /api/v1/imports/:id/promote`.
- **It is stored as DERIVED.** The map is a modelled judgement of where it could flood, never an observation, as the ERD requires for susceptibility data.

The first version takes the **class map only** (`flood_risk_map.tif`: 1 very low to 5 very high). The nine factor rasters and the continuous index in the data team's delivery are not imported yet, so there is no "why is this place at risk?" answer.

## How it works

All paths are relative to `server/src/modules/flood-risk/` unless they say otherwise. The flow is the pipeline's, with a raster in place of rows:

```
upload .tif ─► read it ─► measure every LGA and ward ─► draw the picture ─► admin reviews ─► Promote ─► live
                  │                                                              ▲
                  └── refuse it, with a reason ───────────────────────────────────┘ (if it can't be read or doesn't line up)
```

### 1. The tables ([`1792700000000-CreateFloodRiskLayers.ts`](../server/src/migrations/1792700000000-CreateFloodRiskLayers.ts))

- **`flood_risk_layers`:** `status` is `staged` while the import waits for review, `live` once promoted, `retired` when a later import replaces it. A **partial unique index** allows only one live layer per country, so the database itself refuses two. It holds:
  - the **picture** (`image_png`, a palette PNG already laid out on the Web Mercator grid, with its four corners in WGS 84: `west`, `south`, `east`, `north`);
  - the **class grid** (`grid_gz`: one byte per source cell, 0 = no data, 1 to 5, gzipped) with where it sits (`grid_origin_e`, `grid_origin_n`, `cell_size_m`, `source_crs`), so a point can be asked its class;
  - the **cell counts per class** (`class_cells`), from which areas in km² are worked out;
  - `data_type` (`DERIVED`), `title`, `source_id`, who created it and when it was promoted.
- **`admin_unit_flood_risk`:** one row per area per layer, with `class_cells` (five integers). Areas and percentages are derived on read from the counts and the layer's cell size, so there is one number to keep right.
- The migration also lets `import_runs.target` be `flood_risk_layers` and `import_runs.file_type` be `geotiff`.
- The area link is `ON DELETE CASCADE`, like rainfall: clearing a level to re-import its boundaries clears that level's figures (the map itself is unaffected). The country and source links are `RESTRICT`, so deleting a country or a source that a flood risk map uses is refused with the usual `409`.

### 2. Reading the GeoTIFF ([`geotiff-reader.ts`](../server/src/modules/flood-risk/geotiff-reader.ts))

It reads the file with [geotiff.js](https://geotiffjs.github.io/) and **refuses anything it would otherwise have to guess**, each with a plain message the screen shows:
- not a GeoTIFF at all;
- more than one band, no projected coordinate system, or not WGS 84 / UTM (EPSG:326xx or 327xx);
- non-square cells, or more than 36 million cells;
- any cell that is not a whole number from 1 to 5 (no-data cells are left out). This is what stops the continuous index (`flood_risk_index.tif`, values such as 3.47) or a factor score being imported as if it were the class map: the message names the row, column and value.

### 3. Measuring the areas ([`zonal-stats.ts`](../server/src/modules/flood-risk/zonal-stats.ts), [`flood-risk.service.ts`](../server/src/modules/flood-risk/flood-risk.service.ts))

- The live LGAs and wards of the country are read with their shapes lightly simplified (about 11 m, far finer than a 100 m cell).
- Each shape is projected into the raster's grid and filled one row of cells at a time (the even-odd rule, so holes are left out). A cell belongs to an area when its **centre** does, so two neighbouring areas never share a cell. This yields the cells of each class per area.
- The import **needs LGAs to be live first**, like rainfall, because the map is measured per LGA and ward.
- **Checks, in code, before anything is staged:**
  - the map must lie inside the country's rough bounding box (a wrong country or UTM zone fails here);
  - **more than 50%** of the classified cells outside every LGA is an error ("does not line up with the boundaries"); **more than 5%** is a warning on the run; any smaller leftover (coast and border slivers) is a note;
  - an area the map doesn't reach gets a **warning** on its row, not an error.
- Each LGA and ward becomes one staged row (`import_staging_rows`) whose `fields` hold its class counts, the share that is high or very high, and the mean class. The review table shows these.

### 4. Drawing the picture ([`overlay-image.ts`](../server/src/modules/flood-risk/overlay-image.ts))

Mapbox can only place a picture from its four corners, in Web Mercator, so the grid (UTM) is re-laid onto that grid at **50 m per pixel**, half a 100 m cell, so each cell stays a crisp 2 × 2 block. For each pixel it finds the source cell under it (**nearest neighbour**, so a pixel is always a real class, never a blend) and writes a palette PNG: index 0 transparent, 1 to 5 the class colours (ColorBrewer RdYlGn, the colours on the data team's own map). The exact projection is worked out on a 32-pixel lattice and interpolated in between, which is straight to well under a centimetre over 1.6 km and avoids millions of projection calls holding up the API. The long loops yield to the server every few areas.

### 5. Staging and promotion

[`import.repository.ts`](../server/src/modules/data-sources/imports/import.repository.ts) creates the run, stages every area row, computes the verdict and inserts the staged layer **in one transaction** (`createCheckedRun`'s new optional `layer` argument), so a run never exists without its map. Promote ([`flood-risk.repository.ts`](../server/src/modules/flood-risk/flood-risk.repository.ts), `promoteStagedLayer`) is a second transaction: it locks the staged layer, retires the country's current live layer, makes this one live and copies the passed rows into `admin_unit_flood_risk`. If an area it measured has since been removed, or another map was made live at that moment, it rolls back and answers `409` with a plain reason.

### 6. Endpoints

| Method and path | Who | What it does |
|---|---|---|
| `POST /api/v1/imports/flood-risk` | Administrator | Multipart: `file` (the GeoTIFF), `countryCode`, `sourceId`, optional `title` (the file name by default). Creates and checks a run: `201`. Field errors name `file`, `countryCode` or `sourceId` |
| `GET /api/v1/imports/:id/flood-risk` | Administrator | The map a run staged (or made live), for the review screen; `404` for a run that has none |
| `GET /api/v1/flood-risk?countryCode=NGA` | Everyone signed in | The live map: corners, the five classes with their colours and areas, the data source, when it went live. `data: null` when none is live, so the screen shows no toggle |
| `GET /api/v1/flood-risk/layers/:id/image` | Everyone signed in (live); Administrator (staged or retired) | The picture itself, as `image/png`, cacheable for a year (a layer never changes). Anyone else gets `404` for a staged one |
| `GET /api/v1/flood-risk/areas/:adminUnitId` | Everyone signed in | One LGA or ward: area per class, the share that is high or very high, the mean class, and its rank among the areas of its level. `null` when it wasn't measured |
| `GET /api/v1/flood-risk/at?lon=&lat=&countryCode=` | Everyone signed in | The class under a point; `class: null` outside the map's data |

The picture route needs the sign-in token, which Mapbox's own image request can't send, so the client fetches it through the API and hands Mapbox a data URL.

### 7. Limits and honesty

- **It is a relative index, not a probability.** Five classes (equal steps of the data team's index) say where it could flood more easily than elsewhere, not how often or how deep. The legend says so.
- **The 100 m grid is nominal.** In the Rivers State delivery the rainfall and GloFAS inputs come in blocks of roughly 8 km and 6 km, which is why a few rectangles show.
- **Licence and inputs aren't in the file.** Whatever source the administrator chooses at import is what the map credits, so record the data team's licence and the inputs there.

### 8. What was checked

- **Unit and HTTP tests** (`server/tests`): the reader's refusals, the picture (every class lands where the source has it, using only the four corners), the cell counting, the service's rules and the HTTP routes (`flood-risk-raster.test.ts`, `flood-risk.service.test.ts`, `integration/flood-risk.test.ts`; the fakes are in `tests/flood-risk-fakes.ts` and the small GeoTIFF builder in `tests/raster-fixtures.ts`). Like the rest of the suite they use in-memory repositories.
- **The SQL, on a real Postgres engine.** The migration, staging, the review query, Promote, retiring the old map, the one-live-map rule, the "area removed since" refusal and rollback were run against PGlite (Postgres compiled to WebAssembly) with stand-in tables, because no PostGIS was available. That run caught a real bug (`round()` on a `double precision`), now fixed. It did **not** exercise the one PostGIS query (`findAreasToMeasure`, which reads each area's shape).
- **The real file, without a database.** The reader, the picture and the cell counting were run on the actual `flood_risk_map.tif` (1,323 × 1,558 cells, 1,034,144 classified), with the 23 LGA shapes from `Rivers_State_LGA.shp`:
  - reading took 0.4 s and drawing the picture 0.4 s (a 2,668 × 3,159 pixel PNG of 223 KB); measuring the 23 LGAs took 0.05 s;
  - the class areas were exactly those in `risk_class_area.csv` (27.42, 1,648.20, 4,158.89, 2,900.41 and 1,606.52 km²);
  - the share that is high or very high per LGA was within 0.8 points of `risk_by_LGA.csv` at worst (its ids 1 to 23 are the shapefile's record order);
  - 3,999 classified cells (0.39%) fell outside every LGA, so the 5% warning does not trigger.
- **Still to do:** run `npm run migration:run` on a development database with PostGIS and import the real `flood_risk_map.tif` through the screen, with the real LGAs and the 317 wards loaded from the database (the wards were not measured above, and are far more shapes than the LGAs), and time the whole request.

## Resources to read

- GeoTIFF files in JavaScript, geotiff.js: https://geotiffjs.github.io/
- Web Mercator, the grid web maps use: https://epsg.io/3857
- UTM zone 32N, the grid the Rivers State GeoTIFF is in: https://epsg.io/32632
- proj4js, converting between the two: http://proj4js.org/
- ColorBrewer, where the five colours come from: https://colorbrewer2.org/
- The PNG specification (palette images and the `tRNS` transparency chunk): https://www.w3.org/TR/png/
- PostgreSQL partial indexes (the one-live-map rule): https://www.postgresql.org/docs/current/indexes-partial.html
- PGlite, the in-process Postgres used to check the SQL: https://pglite.dev/

## Explain it like I'm new to this

Think of the import as receiving a printed poster of the whole state, drawn on graph paper ruled in metres. The poster shows five colours of "how easily this place could flood". Before pinning it up we do three things. We make sure it is the right kind of poster (five colours, whole numbers, not a smooth gradient) and that it is of the right state, by laying it over the outlines of the LGAs we already have. We then go over every LGA and every ward with a pencil and count how many squares of each colour fall inside it, so each area has its own tally. And we copy the poster onto our own kind of graph paper, square by square, so it can be pinned to the web map by its four corners.

None of that goes on the wall yet. The administrator looks at a preview (the poster over the real map, and a table of tallies) and only then presses Promote. If an older poster is already up, it is taken down and kept in a drawer, so the wall never has two, or none.

The tallies and the poster are kept apart on purpose: the poster is for looking at, the grid of squares is for answering "what colour is this exact spot?", and the tallies are for "how much of this ward is in danger?". And the small print says what it is: a careful guess about which places flood more easily than others, not a forecast and not a record of floods that happened.
