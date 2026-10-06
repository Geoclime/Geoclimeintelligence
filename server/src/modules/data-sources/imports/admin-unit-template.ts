import ExcelJS from "exceljs";
import type { AdminUnitLookupRow } from "../../admin-units/admin-unit.types";
import { ADMIN_UNIT_TEMPLATE_COLUMNS } from "./import.types";

export interface TemplateContext {
  countryCode: string;
  countryName: string;
  level: number;
  levelName: string;
  /** null at level 1, where areas hang off the country directly. */
  parentLevelName: string | null;
  /** The live areas one level up, so people copy exact names and codes instead of typing them. */
  parents: AdminUnitLookupRow[];
}

export interface TemplateFile {
  fileName: string;
  contentType: string;
  body: Buffer;
}

// Brand teal (section 15), so a downloaded template looks like the platform's own workbooks.
const TEAL = "FF0E6B6F";
const WHITE = "FFFFFFFF";

/**
 * A worked example of the format only. It sits on the Instructions sheet, never on "Areas",
 * so uploading an untouched template imports nothing; the shape is a tiny square, labelled
 * as an example, so it can't be mistaken for a real boundary.
 */
const EXAMPLE_WKT = "POLYGON((7.000 4.800, 7.010 4.800, 7.010 4.810, 7.000 4.810, 7.000 4.800))";

function parentCodeFor(parent: AdminUnitLookupRow): string {
  return parent.unitCode ?? parent.unitName;
}

function baseName(ctx: TemplateContext): string {
  const level = ctx.levelName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `admin-units-template_${ctx.countryCode}_level-${ctx.level}-${level}`;
}

function instructionLines(ctx: TemplateContext): string[] {
  const parentLine = ctx.parentLevelName
    ? `parent_code: the code (or exact name) of the ${ctx.parentLevelName} each area belongs to. Copy it from the "Parent areas" sheet.`
    : `parent_code: leave empty. ${ctx.levelName} areas belong directly to ${ctx.countryName}.`;
  return [
    `How to fill in this template: ${ctx.levelName} areas (level ${ctx.level}) for ${ctx.countryName} (${ctx.countryCode})`,
    "",
    'Put one area per row on the "Areas" sheet. Keep the headings in row 1 exactly as they are.',
    "unit_name: the area's name, as the source spells it. Known spelling variants are standardised for you, and each change is listed before anything goes live.",
    "unit_code: the source's own code for the area (for example a pcode or ward code). Optional, but it makes parent matching exact.",
    parentLine,
    "geometry_wkt: the area's boundary as WKT text (POLYGON or MULTIPOLYGON) in longitude latitude order, EPSG:4326 / WGS84. GeoJSON geometry text is accepted too.",
    "Excel cells hold at most 32,767 characters. If a boundary is longer than that, upload a GeoJSON file instead.",
    "",
    "Nothing you upload goes live straight away. Every row is checked first (shape valid, inside the country, name present, parent found, no duplicates), and an administrator reviews the results and presses Promote.",
    "Never type in made-up or estimated boundaries. Every shape must come from the data source you choose on the import screen.",
  ];
}

export async function buildAdminUnitTemplateXlsx(ctx: TemplateContext): Promise<TemplateFile> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GeoClime Intelligence";

  const areas = workbook.addWorksheet("Areas", { views: [{ state: "frozen", ySplit: 1 }] });
  areas.columns = ADMIN_UNIT_TEMPLATE_COLUMNS.map((key) => ({ header: key, key, width: key === "geometry_wkt" ? 80 : 28 }));
  styleHeader(areas.getRow(1));

  const parents = workbook.addWorksheet("Parent areas", { views: [{ state: "frozen", ySplit: 1 }] });
  parents.columns = [
    { header: "unit_name", key: "unitName", width: 32 },
    { header: "unit_code", key: "unitCode", width: 24 },
    { header: "use_in_parent_code", key: "useAs", width: 26 },
  ];
  styleHeader(parents.getRow(1));
  if (ctx.parentLevelName) {
    for (const parent of ctx.parents) {
      parents.addRow({ unitName: parent.unitName, unitCode: parent.unitCode ?? "", useAs: parentCodeFor(parent) });
    }
    if (ctx.parents.length > 0) {
      // A dropdown on parent_code, fed from this sheet, so codes are picked rather than typed.
      const range = `'Parent areas'!$C$2:$C$${ctx.parents.length + 1}`;
      for (let r = 2; r <= 2000; r++) {
        areas.getCell(`C${r}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [range],
          showErrorMessage: true,
          errorTitle: "Unknown parent",
          error: `Pick a ${ctx.parentLevelName} from the "Parent areas" sheet.`,
        };
      }
    } else {
      parents.addRow({ unitName: `No ${ctx.parentLevelName} areas are loaded yet. Import those first.` });
    }
  } else {
    parents.addRow({ unitName: `${ctx.levelName} areas have no parent area: leave parent_code empty.` });
  }

  const help = workbook.addWorksheet("Instructions");
  help.getColumn(1).width = 120;
  for (const line of instructionLines(ctx)) help.addRow([line]).getCell(1).alignment = { wrapText: true };
  help.getRow(1).font = { bold: true, size: 13 };
  help.addRow([]);
  help.addRow(["Example row (format only, do not copy into Areas):"]).font = { bold: true };
  const exampleHeader = help.addRow([...ADMIN_UNIT_TEMPLATE_COLUMNS]);
  styleHeader(exampleHeader);
  const exampleParent = ctx.parents[0] ? parentCodeFor(ctx.parents[0]) : "";
  help.addRow([`Example ${ctx.levelName}`, "EXAMPLE-01", ctx.parentLevelName ? exampleParent : "", EXAMPLE_WKT]);

  const body = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    fileName: `${baseName(ctx)}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body,
  };
}

/**
 * The GeoJSON flavour: an empty FeatureCollection, with the instructions, an example feature
 * and the valid parents as extra top-level members (allowed by RFC 7946, section 6.1). The
 * example is not inside `features`, so uploading the file unchanged imports nothing.
 */
export function buildAdminUnitTemplateGeoJson(ctx: TemplateContext): TemplateFile {
  const document = {
    type: "FeatureCollection",
    name: baseName(ctx),
    instructions: instructionLines(ctx).filter(Boolean),
    exampleFeature: {
      type: "Feature",
      properties: {
        unit_name: `Example ${ctx.levelName}`,
        unit_code: "EXAMPLE-01",
        parent_code: ctx.parents[0] ? parentCodeFor(ctx.parents[0]) : null,
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[7.0, 4.8], [7.01, 4.8], [7.01, 4.81], [7.0, 4.81], [7.0, 4.8]]],
      },
    },
    validParents: ctx.parents.map((parent) => ({ unit_name: parent.unitName, use_in_parent_code: parentCodeFor(parent) })),
    features: [],
  };
  return {
    fileName: `${baseName(ctx)}.geojson`,
    contentType: "application/geo+json",
    body: Buffer.from(JSON.stringify(document, null, 2), "utf8"),
  };
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: WHITE } };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  });
}
