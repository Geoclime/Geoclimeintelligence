# Map Layers on the Client: Roads, Waterways and Settlements

## What was built

The home map (`/`) can now draw roads, waterways and settlements over the State, LGA and Ward boundaries, and says where each one's data came from.

- **Three new toggles** in the layer switcher: **Roads**, **Waterways** and **Settlements**, below the boundary layers. All are on by default.
- **Legend rows** for each layer, shown only while that layer is switched on: "Roads (main to local)", "Rivers and creeks", "Wide rivers and water bodies" and "Settlements".
- **A "Data sources" panel** under the legend. For each visible layer it shows the provider (a link to the dataset), the licence and the download date, e.g. "OpenStreetMap contributors via HDX · Open Database License (ODC-ODbL) · downloaded 27 Oct 2026". That provider line is also the attribution OpenStreetMap's licence asks for.
- **Honest hints** under each toggle: "No data loaded yet", "Too many here to show: zoom in", "Smaller roads appear as you zoom in" or "Creeks and small water appear as you zoom in".
- **A fix to the layer toggles**, which could be undone by the map's own address update (see section 5).

The server side (tables, endpoints, zoom rules and the loader) is in [map-layers.md](../map-layers.md).

## How it works

All paths are relative to `client/src/`. It follows the standard's order: types → endpoints → hooks → components → pages.

**1. Types and endpoints.**
- `types/map-layer.types.ts` mirrors the server's replies:
  - `OverlayLayerId` (`"roads" | "waterways" | "settlements"`);
  - the three feature collections, each a GeoJSON `FeatureCollection` plus `truncated`;
  - `MapLayerInfo`: one entry of the layer list, with `featureCount` and `sources`.
- `endpoints/map-layer.endpoints.ts` has two functions:
  - `fetchMapLayers()` calls `GET /api/v1/map-layers`;
  - `fetchLayerGeoJson(layer, { bbox, zoom })` calls `GET /api/v1/{layer}/geojson`. `bbox` is required by the type, so no screen can ask for a whole layer.

**2. Hooks.**
- **`hooks/useMapLayer.ts`** works like `useAdminUnitLayer`:
  - It waits 300 ms after the map stops moving, then fetches only the visible box.
  - It sends the zoom rounded to a whole number, so a tiny zoom change doesn't refetch.
  - It drops a reply that arrives for an older view.
  - Switched off, it fetches nothing and returns nothing.
  - It's never cached, because a bbox key would almost never repeat.
- **`hooks/useMapLayerCatalog.ts`** loads the layer list through `cache/localCache.ts` under the new key `CACHE_KEYS.mapLayers`. The list only changes when an administrator runs the loader, so it can be cached. The cache lasts 15 minutes, or until the page is reloaded.

**3. Drawing the layers.**
- `components/map/MapOverlayLayers.tsx` draws the three layers as native Mapbox sources and layers, never React markers (standard section 10). Bottom to top: waterways, roads, settlements, all **under** the boundary lines.
- All three sources are always mounted, holding an empty collection until data arrives or while a layer is off. Mapbox stacks layers in the order they were added, so a source that mounted late would jump above the others.
- `components/map/map-style.ts`:
  - **Ids:** `MapLayerId` (boundaries and overlays together), `BOUNDARY_LAYER_IDS` and `OVERLAY_LAYER_IDS`.
  - **Colours:** new palette entries for light and dark themes.
  - **`overlayLayers(palette)`:**
    - **Roads:** main roads (motorway, trunk, primary) are thicker and warmer than secondary and tertiary, which are thicker than local roads. Road names appear from zoom 13.
    - **Waterways:** rivers are wider than creeks. Water bodies are drawn as a translucent fill.
    - **Settlements:** a dot each, larger for primary settlements. Names appear from zoom 10, and a ward's primary settlement wins when labels collide (`symbol-sort-key`).
- The server already thins each layer by zoom, so these rules only decide how what arrives looks.
- `components/map/map.css` adds the legend and toggle swatches (a thick line, a thin line, an area and a dot) and the Data sources panel styles.

**4. The panels.**
- `components/map/LayerToggle.tsx` now takes any `MapLayerId`. Its rule hasn't changed: it lists only layers wired to real data, never placeholders.
- `components/map/MapLayerSources.tsx` is the "Data sources" panel:
  - It lists only the layers that are switched on.
  - A layer with no sources says "No data loaded yet", so it never looks sourced when it isn't.
  - It hides itself when no feature layer is on.
- `utils/overlay-layers.ts` → `overlayHint(layer, { zoom, truncated, featureCount })` picks the line under each toggle, in this order:
  1. empty layer;
  2. cut short by the server's cap;
  3. the zoom hints for roads (rounded zoom below 14) and waterways (rounded zoom below 11), matching the zoom the server is sent.

  Until the layer list has loaded, `featureCount` is `null`, so a layer is never called empty before we know.

**5. The home map, `pages/map/MapPage.tsx`.**
- **Wiring:**
  - Three `useMapLayer` calls (one per layer) and one `useMapLayerCatalog`.
  - The legend is the boundary rows plus the rows of the layers that are on.
  - A failed layer shows in the same alert as the boundaries, now worded "Some map layers couldn't load: …".
- **The address:** `utils/map-url.ts` now reads and writes all six layers.
  - Every layer is on unless the link says otherwise.
  - When all six are on, `layers=` is left out.
  - Switching Roads off gives `layers=state,lga,ward,waterways,settlements`. Older links that list only boundary layers open with the overlays off.
- **The toggle race:**
  - Before, `updateParams` used the router's `setSearchParams(prev => …)`. Each update was built from the params of the last render.
  - A layer click and the map's own "moved" update could land in the same tick. The second then started from the old params and wiped out the first, so the box you just ticked flipped back.
  - Now `MapPage` keeps the latest params in a ref (`latestParams`). Each update starts from the one before it and stores its result there straight away.

**6. Deleting a country.** The Countries page's Delete button is still enabled whenever a country holds no areas. If it still holds roads or waterways, the server answers `409` ("… now has areas or map layer data (roads, waterways), so it can't be deleted"), and the country page shows that message as an error toast.

**7. Tests.**
- **Unit tests (Vitest):**
  - `utils/overlay-layers.test.ts` covers the hints: empty, not yet known, cut short, zoom hints, and settlements having none.
  - `utils/map-url.test.ts` covers reading and writing the six layers.
- **Cypress:** `cypress/e2e/geography/map.cy.ts` adds six tests to "Home map":
  - the three toggles, legend rows and sources (provider, licence, date);
  - each layer requested with a bbox and the rounded zoom;
  - switching a layer off removes its legend row and source and is kept in the address;
  - "No data loaded yet";
  - "Too many here to show: zoom in";
  - a failed feature layer named in the alert.
- **Stubs:** `cypress/support/geo-factories.ts` adds `buildMapLayers()` (47,507 roads, 4,033 waterways, 1,149 settlements, matching the real files) and `emptyLayer(truncated)`. `stubGeography()` now stubs the four new routes as `@getMapLayers`, `@roadsLayer`, `@waterwaysLayer` and `@settlementsLayer`.

See [client-testing.md](client-testing.md) for running them.

## Resources to read

- react-map-gl `Source` and `Layer`: https://visgl.github.io/react-map-gl/docs/api-reference/mapbox/source
- Mapbox style expressions (`interpolate`, `match`, `case`, `geometry-type`): https://docs.mapbox.com/style-spec/reference/expressions/
- Mapbox `symbol-sort-key` and label collisions: https://docs.mapbox.com/style-spec/reference/layers/#layout-symbol-symbol-sort-key
- React Router `useSearchParams`: https://reactrouter.com/api/hooks/useSearchParams
- React `useRef` for values that shouldn't trigger a render: https://react.dev/reference/react/useRef
- OpenStreetMap attribution: https://www.openstreetmap.org/copyright

## Explain it like I'm new to this

The map is a stack of clear plastic sheets on a light table. At the bottom is the base map. Then a sheet for water, one for roads, one for villages, and the boundary lines on top. Each checkbox slides one sheet in or out. The sheets always stay in their slots, even when empty, so water never ends up on top of the roads just because it arrived last.

The server only draws on each sheet what fits the patch you're looking at and how close you are. When it had to leave things out, the line under the checkbox says "zoom in". The "Data sources" card is the credits strip at the bottom of a printed map: who made each sheet, under what licence, and when we got it.

The toggle fix is about two people editing one shopping list. You add "roads off". At the same moment the map, holding a photocopy of the old list, writes "moved here" and hands its copy back, and your edit is lost. Now there's one list on the fridge (`latestParams`), and everyone writes on that.
