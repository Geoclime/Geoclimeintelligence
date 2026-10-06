# Phase 2 (client): the Map, Places and Admin Geography screens

## What was built

The app's first real screens with data on them, inside a new dashboard frame.
- **The frame:** a sidebar with grouped navigation ("Explore" and "Administration"), a top bar showing the current section and the account menu, and a slide-in drawer instead of the sidebar on phones and tablets.
- **The home screen (`/`):** a full-screen map of Rivers State with its 23 LGAs (named on the map) and, once you zoom in, its wards.
- **Places:** a searchable LGA directory (`/places`), an LGA profile (`/places/:id`) and a ward page (`/places/:id/wards/:wardId`).
- **For administrators:** countries (list, add or edit, detail) and imports (new import, review and promote, history), which are how boundaries get onto the map.
- **Moved:** the old Overview page is now **Your account** (`/account`, in the account menu). It shows a scoped account's region by name.

## How it works

All paths are relative to `client/src/`. Each feature follows the standard's order: types → endpoints → hooks → components → pages.

**1. Types and endpoints.**
- `types/admin-unit.types.ts`, `types/country.types.ts`, `types/data-source.types.ts` and `types/import.types.ts` mirror the backend's replies field for field (see [admin-geography.md](../admin-geography.md) and [data-import.md](../data-import.md)).
- There's one endpoint file per backend module: `endpoints/admin-unit.endpoints.ts`, `country.endpoints.ts`, `data-source.endpoints.ts` and `import.endpoints.ts`.
- `fetchAdminUnitsGeoJson` takes a bbox that is required by its type, so no screen can ask for every shape at once (rule 19.5).
- Uploads go as `FormData`.
- The template download is the one endpoint that returns a file. The server exposes `Content-Disposition` through CORS, so the browser can read the file name.

**2. Hooks.** `hooks/useLoader.ts` holds the request/loading/error/refetch lifecycle once; the feature hooks build on it:
- **Areas:** `useAdminUnits` (the directory and the LGA name labels), `useAdminUnit` (one area, with its shape) and `useAdminUnitChildren` (an LGA's wards).
- **`useAdminUnitLayer(bbox, level)`:** a map layer. It waits **300 ms** after the map stops moving (`useDebounce`), fetches only the visible area, drops a reply that arrives for an old view, and is never cached.
- **Locating:** `useLocatePoint` (asks the server "what's at this point?") and `useGeolocation` (the browser's location, only when "Where am I?" is pressed).
- **Admin:** `useCountries`/`useCountry`/`useSaveCountry`, `useDataSources`, `useImportUpload`, `useImportRun`, `useImportRuns`, `useImportRunLayer` and `useTemplateDownload`.

Stable reference data (countries, area lists, area details) goes through `cache/localCache.ts`, a 15-minute in-memory cache (standard section 14). It's cleared when a country is saved or an import is promoted.

**3. The map.**
- `components/map/ClimateMap.tsx` is the one map component: Mapbox GL JS through `react-map-gl/mapbox`, with the token read only from `VITE_MAPBOX_TOKEN`.
- With no token, or on a device without WebGL (caught by `MapErrorBoundary.tsx`), the map is replaced by a "Map unavailable" notice, and every list and link still works.
- `AdminBoundaryLayers.tsx` draws the state, LGA and ward shapes as native Mapbox sources and layers, never React markers (section 10). LGA names are placed at the centroids from the list endpoint.
- Colours live in `map-style.ts` and follow the theme (light or dark base map).
- `LayerToggle.tsx` lists only State, LGA and Ward, the layers that have data. Rainfall and flood risk join when their data exists, not as placeholder checkboxes.
- The rest of the map pieces: `MapLegend.tsx`, `AdminUnitPopup.tsx` with `LocationSummary.tsx` (the state, LGA and ward at a spot), `SourceBadge.tsx` (where a shape came from) and `AreaOutlineMap.tsx` (the small maps on the profile pages).

**4. The home map, `pages/map/MapPage.tsx`.**
- **Click anywhere:** a click asks the server (`/admin-units/locate`) which state, LGA and ward is there, opens a popup with links, and selects that LGA.
- **"Where am I?":** the button asks the browser for your location (with permission), then does the same lookup.
- **Shareable links:** the view, the selected LGA and the visible layers live in the address (`utils/map-url.ts`), e.g. `/?lng=7.0134&lat=4.7774&z=11&lga=<id>&layers=state,lga`. A copied link opens the same view.
- **Wards:** fetched only from zoom 10 up.
- **No country yet:** administrators see "Set up your first country"; everyone else sees an honest "No map data yet".
- **On phones:** the overview card sits at the top, and layers and the legend open from a "Layers" button.

**5. Places.** `pages/places/`:
- `PlacesPage.tsx`: the searchable directory. The search runs on the server, debounced 300 ms.
- `LgaProfilePage.tsx`: the LGA on a small map with its wards, plus its code, centre, parent and source, and its wards as links. It also has an empty card that says rainfall and flood history arrive later, rather than placeholder figures.
- `WardPage.tsx`: the ward inside its LGA's outline. A ward reached through the wrong LGA's address shows "not found" rather than the ward.

**6. Admin countries.** `pages/admin/countries/`, with `components/countries/CountryForm.tsx` (react-hook-form + Zod; schema in `country-form.schema.ts`):
- Add or rename levels and move them up or down.
- Levels that already hold areas can be renamed but not removed. The form disables those buttons, and the server refuses them too.
- The optional rough bounding box is what the import checks use.
- Edits send only the fields that changed.
- The country page shows each level's area count and a paged list of its areas, with "Import areas" buttons preset to the country and level.

**7. Admin imports.** `pages/admin/imports/`:
- **`ImportNewPage.tsx`** takes three steps:
  1. Choose the country, level and data source; "Add a source" opens `DataSourceDialog.tsx`. "Excel template" and "GeoJSON sample" download the blank file.
  2. Upload the file. The server previews it, so the admin sees the detected sheet, heading row and first rows (`FilePreviewTable.tsx`).
  3. Match the columns (`ColumnMappingFields.tsx`, preset to the server's guess), then "Check the file".
- **`ImportReviewPage.tsx`:**
  - counts (rows, passed, failed, live) and the run's warnings;
  - the **preview map**, with failed shapes in red (`ImportPreviewMap.tsx`);
  - the rows, filterable by failed or passed, with every error and warning (`StagingRowsTable.tsx`);
  - **Promote**, behind a confirmation Modal (no browser dialogs, section 20).
- **`ImportHistoryPage.tsx`:** every run, with who ran it, when, its rows and its status.

**8. The dashboard frame.**
- `components/layout/AppShell.tsx` puts `Sidebar.tsx` beside the content. The links are defined in `nav-items.ts`, and the administration group only appears for administrators.
- Below 1024 px the sidebar becomes a drawer. It opens from the menu button and closes on Esc, a backdrop tap or any link, then returns focus to the button.
- A route marked `handle: { fullBleed: true }` (the map) fills the whole content area.
- *(Removed later.)* `VerifyEmailBanner.tsx` used to show a verify-email notice on every screen. Accounts can no longer be signed in before their email is verified, so the banner was deleted: see [email-verification-before-sign-in.md](email-verification-before-sign-in.md).
- Shared table, stat tile, breadcrumb and form styles live in `styles/dashboard.css`. Data tables turn into stacked cards on phones, and no screen scrolls sideways at 360 px.

**9. Tests.**
- **Unit tests:** `utils/map-url.test.ts`, `components/countries/country-form.schema.test.ts` and `components/imports/import-form.schema.test.ts`.
- **Cypress specs (every call stubbed):** `cypress/e2e/geography/map.cy.ts`, `geography/places.cy.ts`, `admin/countries.cy.ts`, `admin/imports.cy.ts`, `layout/dashboard.cy.ts`, and the updated `layout/responsive.cy.ts`.
- **Mapbox in Cypress:** `cypress/support/e2e.ts` stubs every `mapbox.com` request, using a one-layer local style (`fixtures/map/style.json`). The map starts, but never reaches Mapbox.
- **Fixtures:** `cypress/support/geo-factories.ts` builds the stubbed replies. The shapes are small squares, not real boundaries.
- **Results:** the full suite (68 tests) passed on 2026-10-05.
- **File sizes:** every new file is within the section 18 limits. The largest page is `ImportNewPage.tsx` at about 310 of 1000 lines.

**Setup:** add `VITE_MAPBOX_TOKEN=pk....` to `client/.env` (and to Vercel's environment variables). It's public by design, but restrict it to your domains in the Mapbox account. `vite.config.ts` now pre-scans every screen for dependencies (`optimizeDeps.entries`), so the first visit to the map or the import screen doesn't trigger a reload.

**Flagged for the team (NEEDS VERIFICATION):**
- The Users page's region field is still a raw region ID. A picker that lists LGAs and wards by name is a natural next step now that they exist.
- Wards are GRID3 "Operational Placeholder" boundaries. Their source card says so; check that's clear enough for the people who'll use it.

## Resources to read

Read roughly in this order:
- react-map-gl (the React wrapper for Mapbox GL JS): https://visgl.github.io/react-map-gl/
- Mapbox GL JS API reference: https://docs.mapbox.com/mapbox-gl-js/api/
- Mapbox style layers (fill, line, symbol, and their paint properties): https://docs.mapbox.com/style-spec/reference/layers/
- Mapbox access tokens and URL restrictions: https://docs.mapbox.com/accounts/guides/tokens/
- GeoJSON (RFC 7946): https://datatracker.ietf.org/doc/html/rfc7946
- React Router search params (keeping state in the address): https://reactrouter.com/api/hooks/useSearchParams
- React Hook Form `useFieldArray` (the editable level list): https://react-hook-form.com/docs/usefieldarray
- MDN Geolocation API: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- MDN FormData (file uploads): https://developer.mozilla.org/en-US/docs/Web/API/FormData
- Cypress `cy.intercept` (stubbing every request): https://docs.cypress.io/api/commands/intercept

## Explain it like I'm new to this

Imagine a big wall map in an office, with a filing cabinet next to it. The map only shows what you're looking at: when you pan to Port Harcourt, someone fetches just those outlines from the cabinet, after you've stopped moving so they aren't running back and forth while you drag. Click a spot and they look it up and tell you "Rivers State, Port Harcourt LGA, Phward 17". The address bar is like a sticky note recording where you were looking, so you can hand it to a colleague and they see the same thing. The admin pages are the intake desk for the cabinet: new boundary files are laid out on a table, checked, shown on a preview map with the bad ones in red, and only filed away when an administrator says "promote". The sidebar is the office directory: everyone sees the public rooms, and only administrators see the intake desk.
