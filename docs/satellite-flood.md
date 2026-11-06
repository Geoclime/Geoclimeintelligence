# Satellite Flood Extent: Monthly Sentinel-1 Water Tiles

## What was built

An administrator can import the data team's **monthly satellite flood tiles** through the Imports pipeline, the same way as the flood risk map: upload, check, review, **Promote**. Each file is one month of water that the Sentinel-1 radar saw over Rivers State. Once promoted, the month joins the **Water seen by satellite** layer on the home map, where anyone signed in can pick a month.

- **The files** are in the data team's Drive folder `flood_tiles`: 129 files, `s1_flood_2016_01.mbtiles` to `s1_flood_2026_09.mbtiles`, 5 to 17 MB each, about 1.2 GB together. Each is an MBTiles file (a SQLite database of map tiles): PNG tiles at zoom 7 to 13, blue (`#1e90ff`, 82% opaque) where water was seen and transparent elsewhere. The bounds are 6.398 to 7.597° E and 4.317 to 5.724° N.
- **Two tables** (migration `1793400000000-CreateSatelliteFloodLayers.ts`). `satellite_flood_layers` holds one row per imported month. `admin_unit_satellite_flood` holds how much of each LGA and ward was water that month.
- **One import route, `POST /api/v1/imports/satellite-flood`** (Administrator only). It takes the file, the country, the data source and, optionally, the month. It creates a checked run, and nothing is live yet.
- **A new import target and file type** (`satellite_flood_layers`, `mbtiles`) on `import_runs`. The run shows in the import history, is reviewed on the same screen, and is promoted with the same `POST /api/v1/imports/:id/promote`.
- **One live layer per country and month.** Promoting a second import of the same month retires the first.
- **It is stored as DERIVED.** The radar is an observation, but "water" is a threshold someone applied to it.
- **Not the same as `flood_extents`.** That table (field survey) holds the shapes people walked or drew on the ground. This one is what the satellite saw over the whole state.

## How it works

All paths are relative to `server/src/modules/satellite-flood/` unless they say otherwise.

```
.mbtiles ─► read zoom 12, stitch into one mask ─► measure every LGA and ward ─► 1-bit picture ─► review ─► Promote ─► live month
                 │                                                                                ▲
                 └── refuse, with a reason ───────────────────────────────────────────────────────┘
```

### 1. Reading the tiles ([`mbtiles-reader.ts`](../server/src/modules/satellite-flood/mbtiles-reader.ts), [`png-codec.ts`](../server/src/modules/satellite-flood/png-codec.ts))

- **sql.js** (SQLite compiled to WebAssembly, already used for GeoPackages) opens the file in memory, so nothing native is needed on the server.
- **One zoom level is read: 12**, about 38 m a pixel at Rivers State's latitude. The files go down to zoom 13 (about 19 m). Zoom 12 is four times coarser than Sentinel-1's 10 m, but it is enough for a state-wide view and for figures per ward, and it keeps a month to a few hundred KB. A file whose deepest zoom is lower is read at that zoom; below zoom 10 it is refused.
- **The tiles are stitched** into one mosaic, cropped to the file's `bounds`. MBTiles numbers rows from the south (TMS). If a file numbers them from the north (XYZ), the reader notices because the tiles then fall outside the bounds, and it reads them that way with a note.
- **A pixel is water** when it is at least half as opaque as the file's water colour. Tile makers soften edges at the coarser zooms, so this is a majority rule.
- **A missing tile counts as "no water".** Tile makers leave out empty tiles, and the file can't say whether a gap was dry or simply not seen.
- **What it refuses**, each with a plain message on screen:
  - not SQLite, or no `tiles` table;
  - vector tiles or JPEG tiles;
  - coarser than zoom 10;
  - PNGs that are 16-bit or interlaced;
  - no transparent pixel at all (a basemap);
  - water drawn in several colours (a picture of a map rather than a mask);
  - more than 40 million pixels (more than one state).
- **The month** comes from the file's `name` entry or its file name (`s1_flood_2016_08` gives `2016-08`). The form can give it instead; if both say a month and they disagree, the file is refused. A month in the future is refused.

The PNG decoder is small and written for this module: every colour type at 8 bits, and palettes at 1 to 8 bits. It has no dependency, like the GeoTIFF picture writer in the flood risk module.

### 2. Measuring the areas ([`measure.ts`](../server/src/modules/satellite-flood/measure.ts), [`satellite-flood.service.ts`](../server/src/modules/satellite-flood/satellite-flood.service.ts))

- The live LGAs and wards are read with their shapes lightly simplified (about 11 m), and each one's own area on the spheroid (`ST_Area(geom::geography)`).
- Each shape is filled one row of pixels at a time, with the same even-odd, pixel-centre rule as the flood risk map. Each pixel counts its **true ground area**, which shrinks with latitude on the Web Mercator grid.
- For each area, the import stores the water in km², the **part of the area the tiles cover** (`measured_km2`), and the share. A share is only ever given of the part that was seen, never of the whole area.
- **Checks before anything is staged:**
  - the tiles must touch the country's rough bounding box;
  - if the tiles cover less than 50% of the LGAs, the file is refused ("they don't line up with the boundaries");
  - under 95% coverage gives a warning on the run;
  - an area covered less than 95% gets a warning on its own row;
  - water outside every LGA (the sea, and neighbouring states inside the tiles' rectangle) is reported, drawn on the map, and not counted in any area;
  - a month already live gets a warning that promoting replaces it.

### 3. What is stored ([`satellite-flood.repository.ts`](../server/src/modules/satellite-flood/satellite-flood.repository.ts))

The tiles themselves are **not** stored: 1.2 GB doesn't fit the Aiven database. Each month is kept as **one 1-bit PNG** (`mask_png`: 0 = no water, 1 = water) on the Web Mercator grid, with its four corners. Rivers State at zoom 12 is about 3,494 × 4,115 pixels. Many phones can't draw a picture taller than 4,096 pixels, so it is shrunk by under 1% to 3,478 × 4,096, and its corners don't move. That one blob is both what the map draws and the record of what was imported. It is 180 to 520 KB a month, so roughly **45 MB for all 129 months**.

`createCheckedRun` in `data-sources/imports/import.repository.ts` writes the run, its 340 area rows (23 LGAs and 317 wards) and the staged month in **one transaction**. `promoteStagedSatelliteLayer` locks the staged month, retires the same month's live layer, makes this one live and copies the area figures. If an area has gone since, or another import of the month went live at the same moment, it rolls back and answers `409`.

### 4. Endpoints

| Method and path | Who | What it does |
|---|---|---|
| `POST /api/v1/imports/satellite-flood` | Administrator | Multipart: `file` (.mbtiles), `countryCode`, `sourceId`, optional `yearMonth` (YYYY-MM) and `title`. Creates and checks a run: `201`. Field errors name `file`, `yearMonth`, `countryCode` or `sourceId` |
| `GET /api/v1/imports/:id/satellite-flood` | Administrator | The month a run staged (or made live), for the review screen |
| `GET /api/v1/satellite-floods?countryCode=NGA` | Everyone signed in | Every live month, newest first: corners, picture size, water km², coverage, source. An empty list when none is live, so the map shows no toggle |
| `GET /api/v1/satellite-floods/layers/:id/image` | Everyone signed in (live); Administrator (staged or retired) | The picture, as `image/png`, cacheable for a year |
| `GET /api/v1/satellite-floods/areas/:adminUnitId` | Everyone signed in | One LGA's or ward's live months, oldest first: water km², area covered, share |

A `.mbtiles` file sent to the areas or rainfall import is refused with a message pointing at the right choice.

### 5. On screen (client)

- **Imports → New import → Level: "Satellite flood extent: monthly"**. It is picked automatically for a `.mbtiles` file. The file box accepts **many files at once**. They are checked **one after another**, each as its own run, because each is read in the API's memory and the free Render server has little of it. A results list shows each file's month and outcome, with a Review link. **Promote N checked months** then promotes them oldest first. A refused file doesn't stop the rest. A single file whose name doesn't say its month can be given one. (`useSatelliteFloodBatch.ts`, `ImportNewPage.tsx`.)
- **The review screen** draws the month over the base map, shows a card with the water km² and the share covered (`SatelliteFloodRunCard.tsx`), and has water, share and area-covered columns in the rows table.
- **The home map** has a **Water seen by satellite** layer under Hazard once any month is live. It is **off by default**, because it would hide the flood risk colours. When it is on, a panel picks the month: earlier and later buttons, and a dropdown. The month is kept in the link (`/map?floodMonth=2022-10`) and only the chosen month's picture is downloaded. The legend credits the source and says what "water" means here (`SatelliteFloodLayer.tsx`, `SatelliteFloodPanel.tsx`, `utils/satellite-flood.ts`).
- **LGA and ward pages** (`/places/:id` and `/places/:id/wards/:wardId`) have a **Water seen by satellite** card (`components/floods/SatelliteWaterCard.tsx`), under Rainfall on an LGA page and under the map on a ward page. It reads `GET /api/v1/satellite-floods/areas/:adminUnitId` and shows:
  - the latest month's water in km² and as a share of the area, against an average of that calendar month (at least two other years are needed for an average);
  - the month with the most water on record, and how many months are on record;
  - a month-by-month chart (the last 12 months, or any year), with each month's average as a tick. It reuses the rainfall chart, which now takes a `unit` and a `format`, painted in the map layer's blue;
  - a table where each month links to the home map with the layer on at that month, zoomed to the LGA;
  - the caveat (rivers and creeks are included, and dry ground can read as water), a **Derived** badge and the source.

  An area with no live month says so. If the server can't answer at all (for example, before the migration has run), the card isn't shown, so the page isn't left showing an error. (`useAreaSatelliteFlood` in `hooks/useSatelliteFlood.ts`; `summariseAreaWater` and `satelliteFloodMapHref` in `utils/satellite-flood.ts`.)

### 6. What was checked

- **The real files, without a database.** Three months were downloaded from the Drive folder (2016-08, 2022-10, 2023-02). The reader and measuring code were run on them against the 23 LGA outlines in the `.geo` column of `CHIRPS_rain_csv_Rivers_2016_2026_combined.xlsx`:
  - reading took about 1 s a file, measuring the 23 LGAs under 0.1 s, and drawing the picture about 0.6 s;
  - the tiles cover 100.2% of the LGAs' own area (10,251 km² measured against 10,228 km² of shape), so the pixel areas are right;
  - the stored picture, decoded again, holds the same water as the mosaic to within about 1% (the 0.4% shrink).
- **Type checks** (`tsc --noEmit`) pass for the new server and client code. The server test files that were already failing to compile still fail for their own reasons; no test was written or run, as asked.
- **Not done yet:** running the migration on a staging database with PostGIS, importing through the screen, and timing the request with the 317 wards. The wards were not measured above.

### 7. Limits and honesty: read before using the figures

- **"Water" is not "flood".** The mask is everything the radar saw as open water that month, including the Bonny, the New Calabar, creeks, mangrove channels and fish ponds. To get flooding, permanent water has to be taken away. One way is to keep only pixels that are water in, say, under 20% of months. That needs a permanent-water mask from the data team, or a step after all 129 months are in.
- **The dry season shows more "water" than the floods.** February 2023 shows 3,298 km² of water inside the LGAs (32%), against 1,973 km² (19%) in October 2022, the peak of the 2022 floods. Inland LGAs show it most: Etche has 295 km² in February 2023 against 27 km² in October 2022, and Ikwerre 275 against 17. The files themselves are largest from January to April. This points at false water in the dry season: smooth dry ground, burnt fields and harmattan conditions can look like water to the radar, and a monthly minimum picks up the darkest pass. **Ask the data team how the threshold was set, and whether a dry-season correction or a permanent-water mask is planned, before these figures are shown to anyone as flooding.**
- **The rectangle reaches past the state.** About 5 km² to 7 km² of each month's water lies outside every LGA in these files; it is drawn but not counted.
- **38 m pixels.** Narrow creeks and small ponds are lost or blocky, and a ward's figure is good to roughly a pixel's width around its edge.
- **Licence and method aren't in the file.** Whatever source the administrator chooses at import is what the map credits. Record the data team's method (Sentinel-1 VH, monthly minimum, threshold) and licence (Copernicus data is free and open) there.

## Resources to read

- The MBTiles specification (the tables and the TMS row order): https://github.com/mapbox/mbtiles-spec
- Slippy-map tile numbering (zoom, x, y): https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
- Sentinel-1 for flood mapping (UN-SPIDER's recommended practice): https://www.un-spider.org/advisory-support/recommended-practices/recommended-practice-flood-mapping
- sql.js: https://sql.js.org/
- The PNG specification (palettes, `tRNS`, row filters): https://www.w3.org/TR/png/
- Web Mercator: https://epsg.io/3857

## Explain it like I'm new to this

Every month a radar satellite passes over Rivers State and takes "pictures" that show smooth, flat surfaces as dark. Open water is smooth and flat, so it shows up dark. The data team turned each month's pictures into a stack of small map tiles: blue where it looked like water, see-through everywhere else.

When an administrator uploads a month, the server lays the tiles side by side into one big sheet, like a jigsaw. It then goes over each LGA and ward with a pencil and adds up how much of it is blue. It keeps one small copy of the sheet for the map and throws the tiles away. Nothing shows on the map until the administrator has looked at the result and pressed Promote.

The caution: the radar can't tell a flooded field from a river that is always there, or from very dry, very smooth ground. So "blue" means "looked like open water", not "flooded". The dry-season months in these files look suspicious for exactly that reason.
