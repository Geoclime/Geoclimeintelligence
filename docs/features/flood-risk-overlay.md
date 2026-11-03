# Flood Risk on the Client: Import, Map Layer and Area Cards

## What was built

An administrator can import the flood risk map from the Imports screen, review it, and promote it. From then on the home map shows it as a **Flood risk** layer, with the same five colours as the data team's map. The server side (the tables, the checks, the endpoints) is in [flood-risk.md](../flood-risk.md).

- **A new choice on the import screen:** Level → "Flood risk map (classified GeoTIFF, .tif)". Pick the country and the data source, choose the `.tif`, and press **Check the map**. It is offered once the LGAs are live, like rainfall.
- **A review screen for it,** on the same page as every import: the map drawn over the real base map (so one that doesn't line up with the coast and the rivers is caught by eye), how the classified area divides into the five classes, and a table with, for every LGA and ward, the share that is high or very high, its mean class and its mapped area. **Promote the map** makes it live.
- **A "Flood risk" layer on the home map,** under the roads and rivers, with five legend rows in the colours painted into the picture and a credit line that names the data source the administrator chose. It has no toggle until a map has been promoted, so there is never a checkbox for nothing.
- **"Flood risk here: High"** in the popup when you tap a spot, while the layer is on.
- **A "Flood risk" card** on every LGA and ward page: the share that is high or very high risk, where it ranks among the areas of its level, and how it divides into the five classes.
- **In the import history,** the run shows as "Flood risk map".
- **In the address,** `layers=` knows `floodRisk`. A link copied before this layer existed lists its layers explicitly, so it opens with Flood risk off, as it always looked.

This replaces my first version of this feature, which baked a picture into the client at build time with a script. That meant an engineer had to run a command and redeploy to change the map, and the map had no source or licence recorded. Now the data arrives the way every other dataset does.

## How it works

All paths are relative to `client/src/`. It follows the standard's order: types → endpoints → hooks → components → pages.

**1. Types and endpoints.**
- `types/flood-risk.types.ts` mirrors the server's replies: `FloodRiskLayer` (corners, the five classes with their colours and areas, the source), `AreaFloodRisk` and `FloodRiskPoint`. `types/import.types.ts` gains the `flood_risk_layers` target and the `geotiff` file type, and a staged row's optional `risk`.
- `endpoints/flood-risk.endpoints.ts` has six functions: the live map, its picture (a blob), the map a run staged, an area's figures, the class at a point, and the upload.

**2. Hooks.**
- `hooks/useFloodRisk.ts` loads the country's live map and its picture. The picture is fetched through the API (it needs the sign-in token, which a map's own image request can't send) and kept as a **data URL**. An object URL would be revoked and re-made under React's StrictMode, which breaks the image; a data URL has nothing to revoke. Cached for 15 minutes under `QUERY_KEYS.floodRisk`, and a promoted import clears it (`useImportRun`).
- `hooks/useRunFloodRisk.ts` is the same for the map a run staged, for its review screen (not cached).
- `hooks/useFloodRiskAt.ts` asks for the class under a tapped spot, only while the layer is on. `hooks/useAreaFloodRisk.ts` reads an area's figures.
- `hooks/useImportUpload.ts` gains `startFloodRisk`.

**3. The map layer, `components/map/FloodRiskLayer.tsx`.**
- A Mapbox **image source** pinned by the layer's four corners, with one raster layer, `raster-resampling: nearest` so each 100 m cell stays a crisp block when zoomed in (smoothing would blend a green and an orange cell into a yellow that means "moderate", a class no cell has), and 0.8 opacity so the base map's roads and names show through.
- It is **mounted first and never unmounted**, so it always sits under the roads, rivers and boundaries (Mapbox stacks layers in the order they were added). Until the picture arrives it holds a 1 × 1 transparent image and is hidden; when the picture arrives the source is updated in place, which keeps its place in the stack. (A source added late would have jumped to the top.)
- `utils/flood-risk.ts` builds the legend rows (`floodRiskLegend`), the credit line (`floodRiskNote`: the source's provider, dataset and licence, "a derived index mapped at 100 m", "relative risk, not a forecast or flood depth") and the class shares. Its unit tests are in `utils/flood-risk.test.ts`.

**4. The map page, `pages/map/MapPage.tsx`.**
- `useFloodRisk(country)` supplies the layer. The toggle, legend rows and credit line appear only when a map is live, and the layer is on by default. `components/map/AdminUnitPopup.tsx` takes an optional `floodRisk` and shows "Flood risk here: **High**" with the class colour, or "No flood risk data here" outside the map's data.
- `components/map/map-style.ts` adds `HazardLayerId = "floodRisk"` to `MapLayerId`. `utils/map-url.ts` appends it **last** in `ALL_LAYERS`, so a link that lists layers (and so predates this one) still reads exactly as before, and existing link strings don't change.
- `components/reports/ReportLocationMap.tsx` (the small map under a flood report) keeps it **off**: reviewers are checking a pin, and a tinted map would get in the way.

**5. The import screen, `pages/admin/imports/ImportNewPage.tsx`.**
- `components/imports/import-form.schema.ts` adds the `flood-risk` choice (`FLOOD_RISK_CHOICE`, `isFloodRiskChoice`, `toStartFloodRiskImport`): it needs only the country and the source, with no columns to match, and a `.tif`/`.tiff` file name picks it automatically. The generic preview is skipped for it: a GeoTIFF is a grid, not rows.
- A note explains what file is expected (one band, 1 to 5, in a WGS 84 / UTM grid, not the continuous index) and that the map is shown as **derived**. A GeoTIFF sent to the areas or rainfall import gets a message telling the administrator to choose "Flood risk map".

**6. The review screen, `pages/admin/imports/ImportReviewPage.tsx`.**
- For a flood risk run, `components/imports/ImportPreviewMap.tsx` draws the map instead of staged shapes (it has none), with the five classes as its legend. `components/imports/FloodRiskRunCard.tsx` shows the map's name and grid, a stacked bar and the five classes with their area and share, so an administrator can see at a glance whether it looks like the data team's map before promoting.
- `components/imports/StagingRowsTable.tsx` gains the columns "High or very high", "Mean class" and "Mapped area (km²)". An area the map doesn't reach shows "No data" and a warning, not an error.
- Promote asks "Make this flood risk map live?" and says it replaces the current map. `useImportRun` clears the cached flood risk answers when it succeeds, so the map layer and the area cards update without a reload.

**7. The area cards, `components/floods/FloodRiskCard.tsx`.** On `pages/places/LgaProfilePage.tsx` and `WardPage.tsx`, above the flood history. It shows nothing (not an empty card) until a map is live and has measured the area. It says "Derived: a modelled judgement of where it could flood, not a forecast and not a record of floods that happened", so it stays apart from the floods responders recorded on the ground beside it. Shared styles are in `components/map/flood-risk.css`.

**8. Tests.**
- **Unit (Vitest):** `utils/flood-risk.test.ts` (legend, credit line, class shares), `components/imports/import-form.schema.test.ts` (the new choice and its builder) and `utils/map-url.test.ts` (the layer in the link, including an old link opening with it off).
- **Cypress, written but not run:** `cypress/e2e/geography/map.cy.ts` (toggle and legend with the credit line, no toggle until a map is live, the click popup, switching it off and keeping that in the address) and `cypress/e2e/admin/imports.cy.ts` (choosing it and uploading, it not being offered before the LGAs are live, the review and Promote, the history label). `stubGeography()` now also stubs the four flood risk routes (`stubFloodRisk()` in `cypress/support/geo-factories.ts`, with a 70-byte PNG fixture), so every map spec keeps working.
- **What e2e can't show:** the Cypress suite never calls Mapbox (`cypress/support/e2e.ts` swaps in a one-layer local style and empty tiles), so it can check the toggle, legend, popup and screens but not the picture drawn on a real base map.

## Not checked yet

- **Nobody has seen the layer drawn on the real Mapbox base map.** Open `/map` against the real token after importing the map and look: it should sit under the roads and rivers, cells should stay crisp when you zoom in, and it should load acceptably on a low-end phone (the picture for Rivers State is about 2,700 × 3,200 pixels, roughly 34 MB once decoded).
- **The Cypress tests above have not been run.**
- **The import hasn't been run end to end against a real PostGIS database with the real file yet.** The server's raster code has read the real `flood_risk_map.tif` and matched the data team's figures, and the SQL has run on a real Postgres engine, but not together (see "What was checked" in [flood-risk.md](../flood-risk.md)).

## Resources to read

- Mapbox image source (the four corners): https://docs.mapbox.com/style-spec/reference/sources/#image
- Mapbox `raster-resampling`: https://docs.mapbox.com/style-spec/reference/layers/#paint-raster-raster-resampling
- react-map-gl `Source` and `Layer`: https://visgl.github.io/react-map-gl/docs/api-reference/mapbox/source
- Data URLs: https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data
- `FileReader.readAsDataURL`: https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsDataURL
- TanStack Query (the cache the hooks sit on): https://tanstack.com/query/latest

## Explain it like I'm new to this

The home map is a stack of clear plastic sheets on a light table: boundaries, roads, rivers, villages. The flood risk map is one more sheet, slid in at the very bottom so the roads and rivers still show on top of it.

Until now, getting that sheet meant an engineer printing it and building it into the app. Now it arrives like a parcel at a reception desk. The administrator hands it over with a note saying who made it and under what terms. The desk checks it is the right kind of sheet and lines it up against the LGA outlines. It then lays it out beside the real map for a look, with a table of how each LGA and ward divides into the five colours. Only when the administrator signs for it does it go on the table. If an older sheet was there, it is put away.

Then it does more than show colours. Tap anywhere and the popup tells you the colour under your finger, in words. Open an LGA's page and a card tells you how much of it is in the danger colours and where it ranks among its neighbours. The credit line is copied from the note that came with the parcel, so the map always says whose it is. And the small print always says what it is: a careful guess about where it could flood more easily, not a weather forecast.
