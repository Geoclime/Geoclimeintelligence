# Importing Shapefiles and CSV Files

## What was built

The import pipeline ([data-import.md](data-import.md)) used to read two kinds of file: Excel workbooks and GeoJSON. It now also reads **shapefiles** and **CSV files**, and a **zip** of any of them. Whatever the file is, it is turned into the same thing before anything else happens: one row per area, with its columns as text and its shape as GeoJSON (or WKT text, for Excel and CSV). After that the staging, checks, review and promote steps are exactly the ones described in `data-import.md`, so a shapefile gets the same shape checks as any other file.

| You upload | What it is read as |
|---|---|
| `Rivers_State_LGA.shp` | A shapefile's shapes. Works alone, but a bare `.shp` has **no names or codes** (see below) |
| `lgas.zip` holding `.shp` + `.dbf` + `.prj` (+ `.cpg`, `.shx`) | A complete shapefile: shapes, names and codes, coordinate system. **This is the one to use.** |
| `lgas.csv`, `.tsv` | A table. Shapes go in a WKT column, like an Excel sheet |
| `.xlsx`, `.geojson`, `.json` | As before |
| `lgas.zip` holding one `.xlsx`, `.geojson` or `.csv` | That file |
| `.shx`, `.dbf`, `.prj` on their own | Refused, with a message saying they belong in a zip with the `.shp` |
| `.kml`, images, anything else | Refused, with a message listing what is accepted |

**A shapefile is several files, not one.** The `.shp` holds only the shapes. The names and codes are in the `.dbf`, the coordinate system is in the `.prj`, and the `.shx` is just an index of where each shape sits inside the `.shp`. The `.shx` holds no coordinates and no names, so it can't be imported on its own, and it is ignored inside a zip because the `.shp` can be read straight through without it. The real `Rivers_State_LGA.shp` and `.shx` are exactly this case: 23 polygons and a 23-entry index, but no `.dbf`, so the shapes have no LGA names. To import them as LGAs, zip the `.shp` with its `.dbf` and `.prj`.

Also in this change:
- a migration that lets `import_runs.file_type` be `shapefile` or `csv`;
- the import screen accepts the new file types, shows the reader's warnings before you check the file, and no longer asks for a "shape column" for a shapefile;
- two small libraries: **fflate** (zip) and **csv-parse** (CSV).

## How it works

All paths are relative to `server/src/modules/data-sources/imports/readers/` unless they start with something else.

```
upload ─► read-import-file.ts ─┬─► shp-parser.ts ─┐
          (what is it?)        │   dbf-parser.ts ─┴─► shapefile-reader.ts ─┐
                               ├─► csv-reader.ts ───────────────────────────┤
                               ├─► xlsx-reader.ts / geojson-reader.ts ──────┼─► ParsedFile ─► (unchanged pipeline)
                               └─► zip-bundle.ts ─► one of the above ───────┘
```

### 1. Working out what the file is

[`read-import-file.ts`](../server/src/modules/data-sources/imports/readers/read-import-file.ts) goes by the extension first, then by the first bytes: a shapefile starts with the number 9994, GeoJSON with `{`, and an `.xlsx` or a zip with `PK`. The two `PK` kinds are told apart by looking inside: a workbook has `[Content_Types].xml` and an `xl/` folder. So a shapefile saved without its extension still reads.

### 2. The shapes ([`shp-parser.ts`](../server/src/modules/data-sources/imports/readers/shp-parser.ts))

A `.shp` is a 100-byte header and then one record per shape. The parser turns each record into a GeoJSON geometry (Point, MultiPoint, LineString, MultiLineString, Polygon or MultiPolygon). Details that matter:
- **Only X and Y are kept.** Z and M values are dropped; the platform stores flat shapes.
- **Rings and holes.** A polygon record is a list of rings. By the shapefile rule, outer rings run clockwise and holes counter-clockwise. Each hole goes to the smallest outer ring that contains it. A file wound the other way round is detected and read with the rule flipped, and a hole that sits in no outer ring is kept as a polygon of its own rather than dropped. Output follows GeoJSON's own rule (RFC 7946: outer rings counter-clockwise).
- **Open rings** (last point differs from the first) are closed, and the run warns how many.
- **A record with no shape** stays a row with no geometry, so the existing check reports "The shape is missing".
- **Nothing trusts the file.** Every read is checked against the record's declared size, so a damaged or hostile file gives a `400` that says which shape is broken, never a crash or a giant allocation. I fuzzed the readers with thousands of randomly corrupted files (the real `.shp`, a synthetic one, a zip, a corrupted `.dbf`) and none crashed.

### 3. The names and codes ([`dbf-parser.ts`](../server/src/modules/data-sources/imports/readers/dbf-parser.ts))

The `.dbf` is a table with a header listing the columns and fixed-width text records. Its column names become the file's headings, so the usual column matching applies (for example `wardname` is guessed as the name). Everything is read as text; dates become `YYYY-MM-DD` and logicals `true`/`false`. Records flagged as deleted are left out, with a warning. Memo and binary columns are skipped, and the warning names them.

The text encoding comes from the `.cpg` file if there is one, else from the header's language byte, else UTF-8 when the bytes are valid UTF-8, else Windows Latin-1.

The `.dbf` and `.shp` must have the same number of records, or the file is refused: joining the wrong names to shapes would be worse than refusing.

### 4. The coordinate system ([`shapefile-reader.ts`](../server/src/modules/data-sources/imports/readers/shapefile-reader.ts))

The platform only stores EPSG:4326 (WGS84). The `.prj` file says which system a shapefile uses:
- **WGS84** (by EPSG code or name): accepted.
- **Anything else** (UTM, the Minna datum, ...): refused with a message that names it and says how to re-project it in QGIS. This matches what the GeoJSON reader already does. Nothing is re-projected automatically: shifting between datums needs correction parameters a `.prj` doesn't carry, and a silent error of a hundred metres is worse than a clear refusal.
- **No `.prj` at all** (the case for the real `Rivers_State_LGA.shp`): the file is accepted **only if every coordinate is a valid longitude and latitude**, and the run gets a warning saying the coordinate system was assumed. If the numbers look like metres, it is refused.
- A `.prj` that says WGS84 while the numbers can't be longitudes and latitudes is refused as inconsistent.

### 5. CSV ([`csv-reader.ts`](../server/src/modules/data-sources/imports/readers/csv-reader.ts))

Uses **csv-parse**. It detects comma, semicolon, tab or pipe from the first line (Excel in many countries writes semicolons), ignores a byte-order mark, and reads UTF-8, falling back to Windows Latin-1. The first row is the headings; blank rows and headingless columns are skipped; repeated headings become `name`, `name (2)`. Quoted cells may contain commas and newlines, which matters because a WKT shape is full of commas. Row numbers count the heading row as 1, as a spreadsheet would.

### 6. Zips ([`zip-bundle.ts`](../server/src/modules/data-sources/imports/readers/zip-bundle.ts))

Uses **fflate**. Everything happens in memory; nothing is written to disk, and file names inside the zip are only ever used as lookup keys. The reader finds the one dataset in the zip: a `.shp` (then the `.dbf`, `.prj` and `.cpg` with the same name, whatever the capitals or folder), or a single `.xlsx`, `.geojson`/`.json` or `.csv`. Two shapefiles, or nothing readable, gives a `400` saying so. macOS junk (`__MACOSX/`, `._files`) is ignored.

**Zip bombs.** A tiny zip can claim to unpack to gigabytes. Only the files that are needed are unpacked, and the unpacked total is capped at 100 MB (`MAX_UNZIPPED_BYTES` in [`reader-limits.ts`](../server/src/modules/data-sources/imports/readers/reader-limits.ts)), judged from the sizes the zip declares before anything is inflated. The upload itself is still capped at 60 MB.

### 7. What changed elsewhere

- [`import.types.ts`](../server/src/modules/data-sources/imports/import.types.ts): the file types `shapefile` and `csv`; `carriesRowShapes()` says whether a file's rows bring their own shape (GeoJSON, shapefile) or keep it in a WKT column (Excel, CSV); every parsed file now has `warnings`.
- [`column-mapping.ts`](../server/src/modules/data-sources/imports/column-mapping.ts) and [`admin-unit-rows.ts`](../server/src/modules/data-sources/imports/admin-unit-rows.ts) use that, so a shapefile needs no shape column, and a CSV needs one.
- [`import.service.ts`](../server/src/modules/data-sources/imports/import.service.ts): the preview returns the reader's `warnings`, and a run keeps them in its own warnings, so the review page shows that a coordinate system was assumed. A file with shapes but no columns (a bare `.shp`) can be previewed but not checked: the error says to upload a zip with the `.dbf`.
- [`1791300100000-AllowShapefileAndCsvImports.ts`](../server/src/migrations/1791300100000-AllowShapefileAndCsvImports.ts): widens the `file_type` check. **Run `npm run migration:run` in `server/` before uploading a shapefile or CSV**, or saving the run fails.
- Client: `ImportNewPage.tsx` accepts `.shp,.zip,.geojson,.json,.xlsx,.csv,.tsv`, shows the warnings, and `import-form.schema.ts` asks for a shape column only for Excel and CSV. See [features/admin-geography.md](features/admin-geography.md).

### 8. Tests

- [`tests/unit/import-shapefile.test.ts`](../server/tests/unit/import-shapefile.test.ts): shapes (holes, islands, reversed winding, open rings, Z shapes, points and lines, damaged files), the `.dbf` (types, deleted records, encodings), the coordinate-system rules, zips (including a zip bomb) and file detection. Its last test reads the real `Rivers_State_LGA.shp` when it is present at the repo root. It is built from small shapefiles made byte by byte in [`tests/shapefile-fixtures.ts`](../server/tests/shapefile-fixtures.ts), so no binary files are needed.
- [`tests/unit/import-csv.test.ts`](../server/tests/unit/import-csv.test.ts): delimiters, quoting, encodings, blank rows.
- The service, column-matching and HTTP tests gained shapefile and CSV cases.

When checked by hand, the parser's output for the real `Rivers_State_LGA.shp` matched an independent shapefile library's output exactly: same 23 polygons, same vertices, same ring counts.

**Flagged for the team (NEEDS VERIFICATION):**
- **The "no `.prj`" rule is a judgement call.** The standard says never to accept a shape in an unstated coordinate system (section 13, rule 7). A bare `.shp` can't state one, so it is accepted only when every coordinate is a valid longitude/latitude, with a warning on the run, and the existing bounding-box check and review map still apply. If the team prefers a strict refusal, delete the `unstated` branch in `checkCoordinateSystem` in `shapefile-reader.ts`.
- **No automatic re-projection.** A UTM or other-datum shapefile is refused. Adding re-projection (the `proj4` library) would need agreed datum-shift parameters first.
- The unit and HTTP tests use in-memory fakes. The PostGIS checks on shapefile-sourced shapes, and the new migration, have **not been run against a real database** in this change; they go through the same code as GeoJSON shapes (`geom_format = 'geojson'`).
- The Cypress suite was only updated, not run.
- KML/KMZ, GeoPackage and TopoJSON aren't read.

## Resources to read

- The ESRI Shapefile Technical Description (the format, record by record): https://www.esri.com/content/dam/esrisites/sitecore-archive/Files/Pdfs/library/whitepapers/pdfs/shapefile.pdf
- Shapefile overview, and which sidecar file does what: https://en.wikipedia.org/wiki/Shapefile
- The dBASE `.dbf` format: https://en.wikipedia.org/wiki/.dbf
- GeoJSON (RFC 7946), including ring winding order: https://datatracker.ietf.org/doc/html/rfc7946
- EPSG:4326, the one coordinate system the platform stores: https://epsg.io/4326
- QGIS, free GIS software for re-projecting a file or exporting a shapefile: https://qgis.org/
- fflate (zip): https://github.com/101arrowz/fflate
- csv-parse: https://csv.js.org/parse/
- `TextDecoder`, used to read the `.dbf`'s and CSV's text encodings: https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder
- Zip bombs, and why the unpack limit exists: https://en.wikipedia.org/wiki/Zip_bomb

## Explain it like I'm new to this

Imagine the post room from [data-import.md](data-import.md) used to accept only two kinds of parcel. Now it takes more, and it needs to know how to open each. A **shapefile** is like flat-pack furniture sold as several boxes that only make sense together: one box holds the pieces (the shapes), another holds the labels saying what each piece is (the `.dbf`: names and codes), a third holds the measuring system the maker used (the `.prj`: metres, or degrees, and from which starting point), and a fourth is just the parts list that says which piece is in which box (the `.shx`). Hand over only the box of pieces and the staff can see 23 identically blank pieces, but can't tell you which is "Okrika" and which is "Bonny". That's the `Rivers_State_LGA.shp` on its own. And the parts list alone, with no pieces in it, is no use at all, so the post room sends it back with a note saying which box it belongs with. When all the boxes arrive in one zip, everything lines up. If the measuring-system note says "metres from some other starting point", the post room won't guess the conversion and sends it back; if the note is missing but the numbers are clearly in the usual degrees, it accepts the parcel and writes "assumed" on the delivery slip so the librarian can check it on the map. Behind the scenes it also refuses any parcel that claims to be small but unpacks into a warehouse full of paper, and a damaged box gets a clear note rather than a jammed machine.
