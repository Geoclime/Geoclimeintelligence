# The Data Import Pipeline

## What was built

A reusable way for an Administrator to load a dataset from a file, without an engineer writing a script and without anything going live by accident. A file never writes straight into a live table. Its rows wait in **staging**, every row is **checked**, the admin **reviews** the results (including a map of the shapes), and only when they press **Promote** do the rows that passed get copied into the live table, all at once or not at all. Phase 2 uses it to load Rivers State's boundaries; Phase 5 will reuse it for rainfall data.

## How it works

All paths are relative to `server/src/modules/data-sources/imports/`. The backend standard places import runs in the data-sources module. Every route is Administrator-only, and Administrators are never region-scoped (AI rule 9's documented exception).

```
upload file ─► read it ─► stage every row ─► check every row ─► admin reviews ─► Promote ─► live table
                                                  ▲                    │
                                                  └── fix the file ◄───┘ (if rows failed)
```

### 1. The tables

From [`1791200400000-CreateImportTables.ts`](../server/src/migrations/1791200400000-CreateImportTables.ts):
- **`import_runs`**: one row per upload. It records who uploaded, the file name and type (`xlsx` / `geojson`), the sheet, the column mapping, the data source, the status (`checked` → `promoted`), counts (rows, passed, failed, promoted), run-level warnings, and when it was created and promoted. `target` says which live table it feeds; Phase 2 has one, `admin_units`.
- **`import_staging_rows`**: one row per data row. `raw` holds the row exactly as read and is never edited. `geom_source` holds the original shape text. `geom` holds the cleaned shape, `fields` the cleaned values, and `errors`/`warnings` the check results, with a `status` of `passed` or `failed`.
- **`import_parse_geometry(text, format)`**: a small PostgreSQL function that reads WKT or GeoJSON text and returns `NULL` instead of throwing. One unreadable shape fails that row only, not the whole file.

### 2. Reading files

- **Excel** ([`readers/xlsx-reader.ts`](../server/src/modules/data-sources/imports/readers/xlsx-reader.ts)) uses **exceljs** (standard section 4). It reads the chosen sheet; if none is chosen, it uses "Areas", else the first sheet. It finds the **heading row** by itself: the first row near the top that is mostly text. A merged title banner counts as one cell, so it never wins. In the real `lga_boundaries` sheet that is **row 2**, under a title banner in row 1, so data starts at row 3. The admin can override the guess. Shapes are read straight from the WKT column; nothing is converted to GeoJSON first.
- **GeoJSON** ([`readers/geojson-reader.ts`](../server/src/modules/data-sources/imports/readers/geojson-reader.ts)) turns each feature into a row: its properties become columns, and its geometry is the shape. A file that declares any CRS other than WGS84 is refused (AI rule 7: never store a shape in an unknown CRS).
- [`readers/read-import-file.ts`](../server/src/modules/data-sources/imports/readers/read-import-file.ts) works out the type from the file name, then from its first bytes. Anything else (CSV, for now) is refused with a `400` the screen can show.
- Uploads go through **multer with memory storage only**, never local disk (standard section 14), with a 20 MB limit (`413` above it).

### 3. Matching columns

The template's columns are `unit_name`, `unit_code`, `parent_code` and `geometry_wkt`. Real files use other headings, so [`column-mapping.ts`](../server/src/modules/data-sources/imports/column-mapping.ts) suggests a match:

| File | `unit_name` | `unit_code` | `parent_code` | shape |
|---|---|---|---|---|
| `lga_boundaries` sheet | `lga_name_standard` | `adm2_pcode` | `state` | `geometry_wkt (EPSG:4326)` |
| `rivers_state_boundary.geojson` | `shapeName` | `shapeISO` | (level 1: none) | each feature's geometry |
| `rivers_state_wards.geojson` | `wardname` | `wardcode` | `lganame` | each feature's geometry |

The admin confirms or changes the match on screen. Instead of a parent column, they can also pick one parent for every row.

### 4. The checks

**In code** ([`admin-unit-rows.ts`](../server/src/modules/data-sources/imports/admin-unit-rows.ts)), before staging:
- the name is present (and not absurdly long);
- the parent can be found, by code first, then by name;
- the name is on the **standard list** where one exists. For Rivers State's LGAs, that's the 23 names from the Data Discovery report. Known spellings are mapped to it with a warning: Emuoha → Emohua, Omumma → Omuma, Obia/Akpor → Obio-Akpor. Punctuation variants such as "Obio/Akpor", "Port-Harcourt" or "Akuku Toru" match on their own. The list is in [`admin-units/name-standards.ts`](../server/src/modules/admin-units/name-standards.ts);
- no duplicates, within the file or against areas that are already live.

**In PostGIS** ([`import-checks.sql.ts`](../server/src/modules/data-sources/imports/import-checks.sql.ts)), one rule per statement:
1. the shape can be read (WKT, or GeoJSON text);
2. it is EPSG:4326 (plain WKT is taken as 4326, as the template says);
3. it is a Polygon or MultiPolygon;
4. its coordinates are on the globe;
5. if it's invalid, it's repaired with `ST_MakeValid`, and the row gets a warning that says so;
6. every Polygon becomes a MultiPolygon, so all rows have the same type;
7. it lies inside the country's **rough bounding box**, a rectangle around the country set on its edit page. This catches a mistyped coordinate, a stray minus sign or a shape from another country. It does not catch latitude and longitude swapped when the swapped point still lands inside the country (true for Rivers State: 7.0, 4.8 swapped is 4.8, 7.0, still in Nigeria); the review map and check 8 are for that. If the country has no box, the run gets a warning instead;
8. its middle lies inside its parent: only a warning, since different sources' boundaries rarely nest exactly.

A row passes only with zero errors. Warnings never fail a row, but they're shown so nothing changes silently. Nothing is ever dropped or invented: a row with no shape fails with "The shape is missing".

### 5. Staging and promotion

[`import.service.ts`](../server/src/modules/data-sources/imports/import.service.ts) runs the steps above. [`import.repository.ts`](../server/src/modules/data-sources/imports/import.repository.ts) creates the run, stages every row in one statement and runs the PostGIS checks, **all in one transaction**. **Promote** is a second transaction: it locks the run so two clicks can't both promote it, copies only the passed rows into `admin_units` with the run's `source_id`, and marks the run promoted. If anything fails (an area that another import has added since, or a parent that has been removed), it rolls back, nothing is copied, and the admin gets a `409` explaining why.

### 6. Endpoints

| Method and path | What it does |
|---|---|
| `GET /api/v1/imports/templates/admin-units?country=NGA&level=2&format=xlsx` | Downloads the blank template (`format=geojson` for a sample GeoJSON) |
| `POST /api/v1/imports/preview` | Reads a file's headings and first rows and suggests a mapping. Stores nothing |
| `POST /api/v1/imports` | Upload (multipart: `file`, `countryCode`, `level`, `sourceId`, `columnMapping` as JSON, optional `sheetName`, `headerRow`, `parentId`). Creates and checks a run: `201` |
| `GET /api/v1/imports` | Import history, newest first |
| `GET /api/v1/imports/:id?status=failed` | The run plus one page of its rows, with errors |
| `GET /api/v1/imports/:id/geojson?bbox=` | Staged shapes for the review map (bbox required) |
| `POST /api/v1/imports/:id/promote` | Copies the passed rows into the live table |

Two routes go beyond the Phase 2 guide's table: `preview` (the screen needs a file's headings before the admin can match columns) and the run's `geojson` (the "preview before promote" map).

**The template** ([`admin-unit-template.ts`](../server/src/modules/data-sources/imports/admin-unit-template.ts)) is an Excel file with three sheets:
- **Areas**: the four columns.
- **Instructions**: plain words and one example row.
- **Parent areas**: the valid parents already live. For LGAs that's the state; for wards, the 23 LGAs. A dropdown on `parent_code` is filled from this sheet.

The example is only on the Instructions sheet, so uploading an untouched template imports nothing. The GeoJSON sample keeps its example outside `features` for the same reason.

### 7. Loading the real Phase 2 data (all through the admin pages)

1. **Countries → Add country:** code `NGA`, name Nigeria, levels State, LGA, Ward. Rough box: West 2.5, South 4.0, East 14.8, North 14.0.
2. **Imports → New import → Add a source**, twice. The details come from the READMEs:
   - geoBoundaries (`https://www.geoboundaries.org`, CC BY 4.0, downloaded 2026-09-22);
   - GRID3 NGA Operational Wards v1.0 (`https://data.grid3.org/datasets/0824aded5f5a4d39b10871c667aa8ccf/about`, CC BY 4.0, downloaded 2026-09-22).
3. **Level 1:** upload `rivers_state_boundary.geojson` (source geoBoundaries) and promote. That gives 1 state.
4. **Level 2:** upload `rivers_state_rainfall_and_boundaries.xlsx`, sheet `lga_boundaries` (source geoBoundaries), and promote. That gives 23 LGAs. This is the official Phase 2 test.
5. **Level 3:** upload `rivers_state_wards.geojson` (source GRID3) and promote. That gives 317 wards. "Omward 5" fails because the source file has no shape for it.

`rivers_state_lgas.geojson` is not imported: it's the cross-check. Never import `climate_platform_sample_data_DEMO.xlsx`; it's demo data.

When this was run end to end on a scratch database with the real files:
- the downloaded template, filled in and re-uploaded, passed 23/23;
- a second Promote returned `409`;
- re-uploading the LGA sheet failed all 23 rows as duplicates.

**Tests:**
- [`tests/unit/import-readers.test.ts`](../server/tests/unit/import-readers.test.ts): the readers, heading-row detection and the templates.
- [`tests/unit/admin-unit-rows.test.ts`](../server/tests/unit/admin-unit-rows.test.ts): name standardisation, parent matching, duplicates and the column guesses for the three real files.
- [`tests/unit/import.service.test.ts`](../server/tests/unit/import.service.test.ts): the service rules.
- [`tests/integration/geography.test.ts`](../server/tests/integration/geography.test.ts): uploads over HTTP, including bad files and non-admins.

**Flagged for the team (NEEDS VERIFICATION):**
- CSV and Shapefile aren't readers yet; the standard lists them for the pipeline. CSV arrives with the rainfall feed in Phase 5.
- Staged rows are kept after promotion, as an audit trail. Decide on a clean-up period before files get large.
- The "import completed / failed" emails (backend standard section 15) aren't sent yet.

## Resources to read

- exceljs (reading and writing .xlsx): https://github.com/exceljs/exceljs
- multer (multipart uploads in Express): https://github.com/expressjs/multer
- Well-known text (WKT) for geometry: https://en.wikipedia.org/wiki/Well-known_text_representation_of_geometry
- `ST_GeomFromText` and `ST_GeomFromGeoJSON`: https://postgis.net/docs/ST_GeomFromText.html and https://postgis.net/docs/ST_GeomFromGeoJSON.html
- `ST_IsValid` and `ST_MakeValid`: https://postgis.net/docs/ST_IsValid.html and https://postgis.net/docs/ST_MakeValid.html
- PostgreSQL transactions: https://www.postgresql.org/docs/current/tutorial-transactions.html
- `SELECT ... FOR UPDATE` (row locks): https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS

## Explain it like I'm new to this

Think of a post room in front of a library. A delivery (the file) is never shelved directly. First every item is unpacked onto a sorting table (staging) and checked: is the title there, does it belong on an existing shelf (the parent), is it already in the library, is the cover torn (an invalid shape, which gets taped up with a note)? Then the librarian looks over the table, including a map of where each item would go, with problem items flagged in red. Only when they press "shelve" are the good items moved onto the shelves, all in one go. If the move is interrupted, everything goes back on the table, so a shelf never ends up half-filled. The original delivery note (`raw`) is filed away unchanged, so anyone can check later exactly what arrived.
