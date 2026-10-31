# Field Survey: Walking a Flood's Edge and Recording Drains

## What was built

When a flood hits, someone has to go and see it. This lets a responder **record the flood's extent on the map while standing in it**, and record **the drains that should have carried the water away**, so the people deciding what to send have a measured shape and a list of causes instead of a phone call.

It is on the home map, as a **Field survey** button for emergency responders, government officials and administrators. Everyone signed in sees what was recorded.

| You record | How | You get |
|---|---|---|
| **A flood** | Press **Start walking** and walk around the edge of the water (or tap its edge on the map) | Its area and perimeter, measured on the server, and **what it reaches**: buildings, road length, facilities, settlements, wards, and the drains beside it |
| **A drain** | Walk along an open or covered drain, or tap along it | A line on the map, coloured by condition, with its length |
| **A drainage point** | Stand at a culvert, outfall, inlet or pond and press **Mark here** (or tap it) | A dot on the map, coloured by condition |

Three things make it work in the field:

- **A poor GPS signal doesn't draw a bad shape.** While walking, a point is kept only when the fix is reasonably accurate (30 m or better) and you have moved further than the signal's own jitter, so standing still draws nothing.
- **Nothing is lost to a reload.** The unfinished walk is kept on the phone, and the app offers to **continue it** the next time the map opens (for up to a day). The screen is kept awake while walking.
- **You can trace without wading in.** **Tap the map to add points** draws a flood from a rooftop, a boat or a satellite view. A flood can mix both.

### Using it

1. Open the map and press **Field survey**, then **Record a flood**.
2. Press **Start walking**. A dashed magenta line follows you; the panel shows the points kept, the distance and a live area estimate. **Add a corner here** drops a point where you stand, whatever the distance from the last. **Undo last** removes one. **Pause** stops the GPS without losing the walk.
3. Press **Finish** (it needs three points). Say how deep the water is and add a note, then **Save flood**.
4. The flood appears in magenta (not blue, which is water and would read as the river beside it) and its popup opens with what it reaches: *"Reaches 142 buildings, 2 facilities and 320 m of road"*, the facilities and settlements by name, the wards it touches, and the drains within 150 m, those **needing attention first**: *"3 drains within 150 m, 2 need attention"*.
5. When the water goes down, open the flood and press **Water has gone down**. It turns grey and dashed, and leaves the map after 7 days. The record stays.

For drainage, **Record a drain** or **Mark a culvert, outfall or inlet**. The form asks what it is, **what shape it is in** (clear, partly blocked, blocked, overflowing, damaged) and its size. Opening a drain later shows **I checked it**: pick the condition now and save, which moves *last checked* to today. A drain that was blocked in March and cleared in April reads as cleared, and the map shows it.

## How it works

Paths are relative to `server/` unless they start with `client/`. The module is [`src/modules/field-survey/`](../server/src/modules/field-survey/).

### 1. The tables

[`1792400000000-CreateFieldSurveyTables.ts`](../server/src/migrations/1792400000000-CreateFieldSurveyTables.ts). Apply it with `npm run migration:run`.

- **`flood_extents`**: `geom` (`MultiPolygon`, 4326), `area_m2`, `perimeter_m`, `method` (`walked` or `drawn`), `depth` (the five depths of a flood report), `note`, `point_count`, `accuracy_m`, `observed_at`, `receded_at`, `recorded_by`, and the ward and LGA at its middle.
- **`drainage_features`**: `kind`, `condition`, `name`, `geom` (a `POINT` or `LINESTRING`, by a `CHECK`), `width_m`, `depth_m`, `length_m`, `note`, `method`, `last_checked_at`, `recorded_by`, and the ward and LGA.

Both have the validity `CHECK` and GiST index of the other layer tables, `ON DELETE RESTRICT` on the country, and `ON DELETE SET NULL` on the recorder (the record outlives the account).

### 2. Measuring in PostGIS

The browser sends the walked points; **the server never takes an area on its word** (backend standard section 8). [`flood-extent.repository.ts`](../server/src/modules/field-survey/flood-extent.repository.ts) `create` builds the shape in one statement: points to a line, closed into a ring, made a polygon, repaired with `ST_MakeValid` (a figure-of-eight keeps both loops as a `MultiPolygon`), then measured with `ST_Area` and `ST_Perimeter` **on the spheroid** (`::geography`). If the area is under 10 m² or over 50 km² the `INSERT … SELECT … WHERE` returns no row and the API says why: a puddle, or a GPS jump, is not a flood.

A walked drain is a line through the points, with `ST_Length` on the spheroid, refused if under 2 m or over 50 km.

### 3. What a flood reaches

`FloodExtentRepository.impactOf` counts the flood against the layers already loaded, each narrowed by its GiST index (`&&`) before the exact test:

| Reaches | Test |
|---|---|
| Buildings | `ST_Intersects` with `buildings` |
| Road under water | `ST_Length` of `ST_Intersection` with `roads`, in metres |
| Facilities, settlements | `ST_Covers` (listed by importance, up to 20) |
| Wards | `ST_Intersects` at the ward level |
| Drains | `ST_DWithin` 150 m, those blocked, overflowing or damaged first |

A layer that isn't loaded counts zero, and the popup says so ("No buildings, facilities or roads found inside it").

### 4. The API

| Route | Who | Does |
|---|---|---|
| `GET /api/v1/flood-extents/geojson?bbox=&zoom=`, `GET /api/v1/drainage/geojson?bbox=` | Signed in | The layers for the visible area (cap 2,000 each; floods that are still going first, drains needing attention first) |
| `GET /api/v1/flood-extents/:id/impact` | Signed in | What the flood reaches |
| `POST /api/v1/flood-extents` | Responder, official, administrator | Saves a flood; returns it **with its impact** |
| `POST /api/v1/flood-extents/:id/recede` | Same | Marks it receded (409 if already) |
| `POST /api/v1/drainage`, `PATCH /api/v1/drainage/:id` | Same | Records a drain; re-inspects one (always moves `last_checked_at`) |
| `DELETE /api/v1/flood-extents/:id`, `DELETE /api/v1/drainage/:id` | The recorder, or an administrator | Deletes it |

Recording and re-inspecting respect **region scope** (a responder limited to one LGA can't record in another), and a spot outside every mapped area is refused (`400`), since every record belongs to a country. Deleting is limited to whoever recorded it so nobody's work disappears by accident.

### 5. The client

- [`useWalkRecorder.ts`](../client/src/hooks/useWalkRecorder.ts): the GPS watch, the points, the draft. The rules it follows are plain functions with tests: [`survey-geometry.ts`](../client/src/utils/survey-geometry.ts) (`judgeFix`: keep a fix only if accuracy ≤ 30 m and you moved at least `max(6 m, accuracy ÷ 2)`; distance and the on-screen area estimate) and [`walk-state.ts`](../client/src/utils/walk-state.ts).
- [`survey-draft.ts`](../client/src/utils/survey-draft.ts): the unfinished walk in `localStorage`, validated on the way back in. [`useScreenAwake.ts`](../client/src/hooks/useScreenAwake.ts): the Screen Wake Lock.
- [`useFieldSurvey.ts`](../client/src/hooks/useFieldSurvey.ts) ties the recorder to [`useSurveySaving.ts`](../client/src/hooks/useSurveySaving.ts) and [`useSurveySelection.ts`](../client/src/hooks/useSurveySelection.ts). While a walk is open, the map belongs to it: a tap adds a point (if tapping is on) and otherwise does nothing, so a stray tap never opens a popup.
- On the map: [`SurveyLayers.tsx`](../client/src/components/map/SurveyLayers.tsx) and [`survey-style.ts`](../client/src/components/map/survey-style.ts) (floods magenta, receded grey and dashed; drains green, amber or red by condition, with a wide invisible strip so a thin drain can be tapped). **Floods** and **Drainage** are two new switches in the layer list and the address (`layers=…,floodExtents,drainage`).
- The recorder is [`FieldSurveyDock.tsx`](../client/src/components/map/FieldSurveyDock.tsx); the popups are `FloodExtentPopup.tsx` and `DrainagePopup.tsx`.

### 6. On the national alert map

A flood a responder records is also shown to everyone, signed in or not, on the **national alert map** (the landing page and `/alerts`), because that is where people look to see whether there is flooding now.

- `GET /api/v1/public/alert-map` now also returns `floods` and `floodDays`. Each flood is only a point, its area, its depth and its LGA's name. **The outline, the note and who recorded it never leave the server**, and the point is rounded to about 100 m, as a published report's is.
- Only floods **recorded in the last 3 days that haven't been marked receded** are included (`SURVEY_LIMITS.publicFloodDays`, at most 200). A flood nobody went back to must not sit on a page that people read as "now": press **Water has gone down** when it is over, or it drops off by itself.
- On the SVG map each flood is a magenta marker (5 to 12 px, sized by area on a log scale, drawn under the report dots), with a legend entry, a tooltip such as "Flood recorded on the ground: 3.2 ha, knee-deep, in Obio/Akpor", and a mention in the caption and the screen-reader description.
- **The status line counts them.** With no official alert, a recorded flood makes the line amber ("No official flood alerts in force. 1 flood recorded on the ground in the last 3 days, the largest 3.2 ha."), never the green all-clear.
- **It updates live.** Recording, receding or deleting a flood announces `flood.recorded`, `flood.receded` or `flood.deleted`; the server drops its cached copy of the map and tells every open page, so a flood appears on the landing page within a moment.

### 7. On an LGA's and a ward's page: flood history

The **Flood history** card on an LGA's profile (Places, then the LGA), and on each of its wards' pages, lists the floods responders recorded there. Everything below applies to both; on a ward's page the list drops the ward name from each row, since every flood in it is in that ward, and the map is zoomed to the ward's own outline. It replaces the placeholder that said history would appear "once the disaster-event dataset is connected"; the card still says honestly when nothing has been recorded ("No floods have been recorded in Obio-Akpor yet"), and shows no made-up figures.

- **What it shows:** four figures over every flood in the LGA (how many were recorded, how many are still active, the largest, the latest), then the newest 20, each with its date, area, whether it is active or receded, its depth, the ward it was in, how it was recorded, and **Show on map** (the main map, centred on it).
- **"Part of that LGA":** a flood is filed under the LGA and ward at its middle when it is saved, so the history is a plain lookup by that LGA (or ward). A very large flood that spills over a boundary is counted in the LGA where its middle is, not in both.
- **The floods are drawn on the place's own map**, in the same magenta as on the main map (a flood that has receded is grey and dashed). Clicking one opens the same details as on the main map: its size, depth, when it was recorded, what it reaches and the drains beside it, read-only (marking a flood receded or deleting it stays on the main map, for staff). Only the floods filed under this LGA are drawn, so the map agrees with the list and totals beside it ([`useAreaFloods.ts`](../client/src/hooks/useAreaFloods.ts)); each flood on the map layer now says which LGA and ward it is filed under (`lgaId`, `wardId`) for that.
- **Receded floods are kept.** They leave the map after 7 days but stay in the history, which is what makes it a history.
- `GET /api/v1/flood-extents/history?areaId=&limit=` (any signed-in user; `limit` 1 to 50, default 20; `404` for an area that doesn't exist). It works for a ward id as well as an LGA id. Like the map layer it carries no outline, note or recorder.
- It updates live: recording, receding or deleting a flood marks the page's data stale, so an open LGA or ward page refreshes itself. Code: [`flood-extent.repository.ts`](../server/src/modules/field-survey/flood-extent.repository.ts) `findHistory`, [`FloodHistoryCard.tsx`](../client/src/components/floods/FloodHistoryCard.tsx) (used by `LgaProfilePage.tsx` and `WardPage.tsx`), [`useFloodHistory.ts`](../client/src/hooks/useFloodHistory.ts), and the migration [`1792500000000-IndexFloodExtentAreas.ts`](../server/src/migrations/1792500000000-IndexFloodExtentAreas.ts), which indexes the LGA and ward columns so it stays quick as floods accumulate.

### 8. Tests

| File | Covers |
|---|---|
| [`tests/unit/field-survey.test.ts`](../server/tests/unit/field-survey.test.ts) | The rules, the validation, both services against fakes: where a flood is placed, a shape outside the map or outside what a flood can be, region scope, receding once, who may delete |
| [`tests/integration/field-survey.test.ts`](../server/tests/integration/field-survey.test.ts) | The routes: roles (403 for the public), bodies, the bbox, 409 and 404 |
| `tests/unit/field-survey.test.ts` (history), `client/src/utils/flood-history.test.ts`, `cypress/e2e/geography/places.cy.ts` | A place's history: its floods in order, totals beyond the cap, a ward as well as an LGA, nothing identifying, the empty card, the map links |
| `tests/unit/public-alert-map.test.ts`, `realtime-events.test.ts` | The public map carries the floods and shows a new one at once; a flood event refreshes everyone's map |
| `client/src/utils/*.test.ts`, `survey-form.schema.test.ts` | The marker size and wording on the alert map, the status line with recorded floods, the GPS rules, area and distance, the kept draft, the point-keeping state, what a click opens, the impact sentences |

The PostGIS SQL is not run by the test suite. **Apply the migration and try a flood and a drain against a real database before relying on it**, and check an area against a figure you know (walk a football pitch: about 0.7 ha).

## Known limits

- **A flood swallows clicks inside it.** Clicking anywhere inside a recorded flood opens the flood, so you can't pick an LGA or **Save this place** from there. Switch the **Floods** layer off, or click outside it.
- **A flood can't be reshaped.** Delete it and record it again. (A figure-of-eight walk is repaired into two loops; the live estimate on screen takes the difference of the loops, so it's a guide, and the saved figure is the true one.)
- **GPS indoors or under cover is poor**, and a phone browser only shares its location over HTTPS (`localhost` is fine). A browser without the Wake Lock (some older iPhones) lets the screen sleep, which pauses the walk: the panel tells people to keep the screen open.
- **A drain with no loaded ward** is stored without one and is never relinked.
- **Who can record is one line in two places**: `authorise(...)` in [`field-survey.routes.ts`](../server/src/modules/field-survey/field-survey.routes.ts) and `canRecordSurvey` in [`client/src/utils/field-survey.ts`](../client/src/utils/field-survey.ts).

## Not built yet

Ideas that follow naturally, left out to keep this change reviewable: attaching a flood to the community report that prompted it; telling the wards a flood touches; photos on a drain; exporting extents as GeoJSON or KML for planners; a queue that saves recordings made with no signal and sends them when it returns; a "drains needing attention" list for maintenance crews.

## Resources to read

- PostGIS `ST_MakeValid`, `ST_Area` and `geography`: https://postgis.net/docs/ST_MakeValid.html, https://postgis.net/docs/ST_Area.html, https://postgis.net/docs/using_postgis_dbmanagement.html#PostGIS_Geography
- `ST_DWithin` on geography: https://postgis.net/docs/ST_DWithin.html
- Geolocation API, `watchPosition` and `accuracy`: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition
- Screen Wake Lock API: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- The shoelace formula: https://en.wikipedia.org/wiki/Shoelace_formula

## Explain it like I'm new to this

Imagine you are asked how big a flood is. The honest way is to walk round the edge of the water, dropping a pin every few steps, and then work out how much ground is inside. That is exactly what the phone does: it listens to the satellites as you walk, drops a pin whenever you have really moved (and ignores it when the signal is wobbly, the way you'd ignore a friend who said "somewhere around here"), and joins the pins into a shape. When you press Finish the server re-measures the shape on a model of the Earth, because a flat map stretches the ground, and then counts everything inside it: houses, roads, clinics.

The drains are the other half of the story. A flood is often just water with nowhere to go, so every drain you record is a clue. A blocked drain 40 metres from a flood is the first place to send a crew, and the flood's popup says so. When someone clears it, they press "I checked it" and the map turns it from red to green.
