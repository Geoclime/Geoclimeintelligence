# The Report Flooding Map Shows the Platform's Places

## What was built

The small map on **Report flooding** (and on **Edit your report**) used to show only the plain Mapbox base map and the pin. It now draws what the home map draws, so the person reporting can recognise where they are and put the pin on the right street.

- **Names and places.** LGA names, settlements with their names, facilities (health, schools, police, markets and so on, with names from street level), and road names.
- **The lay of the land.** Ward and LGA boundaries, rivers, creeks, canals and drains, wetlands, and building shapes from street level.
- **A switch for each.** Under the map: Boundaries, Waterways, Wetlands, Roads, Buildings, Facilities and Settlements. Each switch carries the same colour swatch as the home map's legend, so the row doubles as the legend. All are on to begin with.
- **Map or Satellite.** A small toggle above the switches. Satellite shows the ground itself and puts the building shapes away, since the photograph already shows them; going back to Map puts them back.
- **A taller map.** 320 px instead of 260 px, to leave room for the names.
- **The pin stays on top.** Tapping still moves the pin; tapping a road or a place does not open anything, it just moves the pin there.
- **The reviewer's map is unchanged to look at.** The map under a report in the coordinators' queue (`ReportLocationMap`) already drew all of this. Its switches and Map/Satellite toggle now come from the same shared pieces as the picker, so the two maps can't drift apart. Its `data-cy` hooks are the same as before.

No server change: the picker calls the same read endpoints the home map uses (`/roads`, `/waterways`, `/settlements`, `/infrastructure`, `/buildings`, `/wetlands` and the admin-unit shapes), and these are open to any signed-in user, which every reporter is.

## How it works

All paths are relative to `client/src/`.

**1. Shared state: `components/reports/report-map-layers.ts`.**
- `LAYER_SWITCHES` lists the seven switches: the label, the legend swatch class, and which map layers it turns on (Boundaries turns on state, LGA and ward together).
- `useReportMapLayers()` holds two things: whether Satellite is chosen, and which layers are on. `chooseSatellite` also turns Buildings off (or back on). `toggle` flips a switch.

**2. Shared controls: `components/reports/ReportMapControls.tsx`.**
- `LayerSwitches` draws the checkbox row and a small status ("Loading layers…" or "Some layers couldn't load.").
- `MapTypeToggle` draws the Map / Satellite pair.
- Both take a `dataCyPrefix`, so the picker's hooks are `picker-map-*` and the reviewer's are `report-map-*`.

**3. The picker: `components/reports/LocationPicker.tsx`.**
- `useMapLayers(bbox, zoom, layers)` (`hooks/useMapLayers.ts`) fetches each switched-on layer for only the visible box, 300 ms after the map stops moving. The box comes from `ClimateMap`'s `onViewChange`.
- The LGA names come from `useAdminUnits({ level: 2 })`, the same list the home map uses. It is reference data, so it is remembered for 15 minutes rather than fetched again ([client-data-caching.md](client-data-caching.md)).
- `MapOverlayLayers` draws the roads, waterways, wetlands, buildings, settlements and facilities; `AdminBoundaryLayers` draws the boundaries and LGA names. Both are the home map's own components, as native Mapbox sources and layers, never React markers (standard section 10).
- **Draw order.** The overlay sources are always mounted, so they keep a fixed order. The boundary sources only mount when their data arrives, which would put them above the pin, so the pin is given a `key` made from which boundary layers have loaded. It remounts as each one arrives and ends up on top.
- **Switching Map and Satellite.** A new base style drops every custom layer. Everything is wrapped in a `Fragment` keyed by the base map and theme, so a switch remounts the lot in the right order (the same trick `MapPage.tsx` uses).
- **No map, no switches.** The controls only appear once the map has drawn (`view` is set). With no Mapbox token, or no WebGL, the map shows its usual "Map unavailable" notice, and the GPS button and coordinates still work; there is nothing for the switches to switch, so they are not shown.
- Zoom stays where the form puts it: wide (zoom 9) with no pin, and a fit to about 900 m round a GPS fix, which is street level, where roads, buildings and facility names are drawn.

**4. Styles: `components/reports/reports.css`.** `.location-picker__map` is 320 px tall, and `.location-picker__tools` stacks the toggle over the switches. The switch row reuses the `.report-map__*` classes.

**5. The reviewer's map: `components/reports/ReportLocationMap.tsx`.** It keeps everything it had (the LGA outlined, links to the full map and Google Maps) and uses the shared hook and controls above in place of its own copies.

**6. Not changed.** The flood risk surface, field survey, households and forecast layers stay on the full map only. A report map is for finding the spot, and a tinted or crowded map would get in the way (see [flood-risk-overlay.md](flood-risk-overlay.md)).

## Resources to read

- react-map-gl `Source` and `Layer`: https://visgl.github.io/react-map-gl/docs/api-reference/mapbox/source
- Mapbox GL JS `Map` (layers are stacked in the order they were added): https://docs.mapbox.com/mapbox-gl-js/api/map/
- React: preserving and resetting state with a `key`: https://react.dev/learn/preserving-and-resetting-state
- React `Fragment`, which can carry a `key`: https://react.dev/reference/react/Fragment
- OpenStreetMap attribution (the road, water and place data comes from it): https://www.openstreetmap.org/copyright

## Explain it like I'm new to this

Think of asking someone to mark their house on a map. A blank grey sheet with a few road lines is hard to use: "is that my street or the next one?" Now give them the same map the council uses, with village names, the clinic, the school, the river and the street names written on it. They find their place in seconds.

The picker used to hand out the blank sheet. Now it hands out the council's map, with a few tick boxes along the bottom to take away anything that's in the way (say, the building outlines) and a button to swap the drawing for an aerial photograph. The reviewer's map already worked this way, so the tick boxes and the photo button were moved into one shared drawer, and both maps now take them from there.

The one fiddly part is stacking. The pin must sit on top, like a sticker on a finished map. But some of the map's layers arrive a moment late, and a late layer would land on top of the sticker and hide it. So each time one arrives, the sticker is peeled off and pressed on again last.
