import type { AuthUser } from "../../../common/access/auth-user";
import { ConflictError, NotFoundError, UnprovenDataError, ValidationError } from "../../../common/errors/app-error";
import type { BBox } from "../../../common/geo/geo";
import type { PageMeta } from "../../../common/response/api-response";
import { AdminUnitRepository } from "../../admin-units/admin-unit.repository";
import type { AdminUnitLookupRow, IAdminUnitRepository } from "../../admin-units/admin-unit.types";
import type { Country } from "../../admin-units/country.entity";
import { CountryRepository } from "../../admin-units/country.repository";
import type { ICountryRepository } from "../../admin-units/country.types";
import { RainfallRepository } from "../../rainfall/rainfall.repository";
import type { IRainfallRepository } from "../../rainfall/rainfall.types";
import { DataSourceRepository } from "../data-source.repository";
import type { IDataSourceRepository } from "../data-source.types";
import { isLiveDuplicateError, prepareAdminUnitRows } from "./admin-unit-rows";
import { buildAdminUnitTemplateGeoJson, buildAdminUnitTemplateXlsx, type TemplateFile } from "./admin-unit-template";
import { assertMappingFits, assertRainfallMappingFits, suggestMapping, suggestRainfallMapping } from "./column-mapping";
import { ImportRepository } from "./import.repository";
import {
  ADMIN_UNIT_TEMPLATE_COLUMNS,
  RAINFALL_COLUMNS,
  type ColumnMapping,
  type IImportRepository,
  type ImportFileType,
  type ImportRunDto,
  type ParsedFile,
  type RainfallColumn,
  type RainfallColumnMapping,
  type StagingFeatureCollection,
  type StagingRowDto,
  type TemplateColumn,
  type UploadedFile,
} from "./import.types";
import { monthOf, prepareRainfallRows, shapeColumns, summariseRainfallRows } from "./rainfall-rows";
import { readImportFile } from "./readers/read-import-file";
import type {
  AdminUnitTemplateQuery,
  GetImportQuery,
  ListImportsQuery,
  PreviewImportBody,
  StartImportBody,
  StartRainfallImportBody,
} from "./import.validation";

export interface ImportPreviewDto {
  fileName: string;
  fileType: ImportFileType;
  sheets: string[];
  sheetName: string | null;
  headerRow: number | null;
  headings: string[];
  rowCount: number;
  /** The first few rows, long values shortened, so the admin can recognise the columns. */
  sampleRows: Record<string, string | null>[];
  /** The columns to match: the areas template's, or the rainfall ones when previewing for rainfall. */
  templateColumns: readonly TemplateColumn[] | readonly RainfallColumn[];
  suggestedMapping: ColumnMapping | RainfallColumnMapping;
  /** What the reader assumed or noticed (a shapefile with no .prj, say), shown before checking. */
  warnings: string[];
}

/** Where a run's rows will go: the country, the level, and the parents they can attach to. */
interface ResolvedTarget {
  country: Country;
  levelName: string;
  parentLevelName: string | null;
  parents: AdminUnitLookupRow[];
  fixedParent: AdminUnitLookupRow | null;
}

const SAMPLE_ROWS = 3;
const SAMPLE_TEXT = 60;

/**
 * The import pipeline: file -> staging -> checks -> live (Phase 2 guide, section C).
 * Administrator-only on every route; Administrators are never region-scoped, so no region
 * check applies (AI rule 9's documented exception). A file never writes to a live table here:
 * start() only fills staging, and promote() is the one step that copies passed rows across.
 */
export class ImportService {
  private static _instance?: ImportService;
  static get Instance(): ImportService {
    return (this._instance ??= new ImportService(
      ImportRepository.Instance,
      CountryRepository.Instance,
      AdminUnitRepository.Instance,
      DataSourceRepository.Instance,
      RainfallRepository.Instance,
    ));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly imports: IImportRepository,
    private readonly countries: Pick<ICountryRepository, "findByCode">,
    private readonly units: Pick<IAdminUnitRepository, "findLookupRows">,
    private readonly sources: Pick<IDataSourceRepository, "findById">,
    private readonly rainfall: Pick<IRainfallRepository, "findLiveValues">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Reads the file's headings and a few rows, and guesses the column mapping. Stores nothing. */
  async preview(file: UploadedFile, input: PreviewImportBody): Promise<ImportPreviewDto> {
    const rainfall = input.target === "rainfall_observations";
    const parsed = await readImportFile(file, { ...input, prefer: rainfall ? "rainfall" : "areas" });
    const needsParentColumn = (input.level ?? 2) > 1 && !input.parentId;
    return {
      fileName: file.originalName,
      fileType: parsed.fileType,
      sheets: parsed.sheets,
      sheetName: parsed.sheetName,
      headerRow: parsed.headerRow,
      headings: parsed.headings,
      rowCount: parsed.rows.length,
      sampleRows: parsed.rows.slice(0, SAMPLE_ROWS).map((row) => shorten(row.values)),
      templateColumns: rainfall ? RAINFALL_COLUMNS : ADMIN_UNIT_TEMPLATE_COLUMNS,
      suggestedMapping: rainfall
        ? suggestRainfallMapping(parsed.headings, input.level ?? 2)
        : suggestMapping(parsed.headings, { fileType: parsed.fileType, needsParentColumn }),
      warnings: parsed.warnings,
    };
  }

  /** Creates a run: reads the file, runs every check, and leaves the rows in staging for review. */
  async start(file: UploadedFile, input: StartImportBody, actor: AuthUser): Promise<ImportRunDto> {
    // Every row must trace back to a real source (section 4): refuse the whole upload otherwise.
    if (!(await this.sources.findById(input.sourceId))) throw new UnprovenDataError();

    const target = await this.resolveTarget(input.countryCode, input.level, input.parentId);
    if (input.level > 1 && target.parents.length === 0) {
      throw new ValidationError([
        { field: "level", message: `No ${target.parentLevelName} areas are live yet. Import and promote those first.` },
      ]);
    }

    const parsed = await readImportFile(file, input);
    assertHasRows(parsed);
    if (parsed.headings.length === 0) {
      throw new ValidationError([
        {
          field: "file",
          message:
            "The file has shapes but no attribute columns, so there are no names or codes to match to areas. " +
            "For a shapefile, upload a .zip that holds the .shp together with its .dbf and .prj.",
        },
      ]);
    }
    const needs = { fileType: parsed.fileType, needsParentColumn: input.level > 1 && !target.fixedParent };
    assertMappingFits(input.columnMapping, parsed.headings, needs);

    const rows = prepareAdminUnitRows(parsed, input.columnMapping, {
      countryCode: target.country.countryCode,
      level: input.level,
      levelName: target.levelName,
      parentLevelName: target.parentLevelName,
      fixedParent: target.fixedParent,
      parents: target.parents,
      existing: await this.units.findLookupRows(target.country.countryCode, input.level),
    });

    const bbox = toBBox(target.country.bbox);
    const warnings = [...parsed.warnings];
    if (!bbox) {
      warnings.push(`${target.country.countryName} has no rough bounding box, so shapes were not checked against it. Add one on the country's edit page.`);
    }
    // Re-uploading a file is the usual cause; say so once instead of leaving it to every row.
    const alreadyLive = rows.filter((row) => row.errors.some(isLiveDuplicateError)).length;
    if (alreadyLive > 0) {
      warnings.push(
        `${alreadyLive} of these ${target.levelName} areas are already live (imported before), so they fail as duplicates and are left out. ` +
          "That's expected if this file was imported already. To add only the missing areas, upload a file containing just those.",
      );
    }

    return this.imports.createCheckedRun(
      {
        target: "admin_units",
        fileName: file.originalName.slice(0, 255),
        fileType: parsed.fileType,
        sheetName: parsed.sheetName,
        options: {
          countryCode: target.country.countryCode,
          level: input.level,
          levelName: target.levelName,
          parentId: target.fixedParent?.id ?? null,
        },
        columnMapping: input.columnMapping,
        sourceId: input.sourceId,
        createdBy: actor.id,
        warnings,
      },
      rows,
      { countryCode: target.country.countryCode, bbox },
    );
  }

  /**
   * Creates a rainfall run: one row per area per month (CHIRPS from Earth Engine, say), matched
   * to the live areas at `level` and compared with the rainfall already live. Like start(), it
   * only fills staging; promote() writes the rows that change something.
   */
  async startRainfall(file: UploadedFile, input: StartRainfallImportBody, actor: AuthUser): Promise<ImportRunDto> {
    if (!(await this.sources.findById(input.sourceId))) throw new UnprovenDataError();

    const { country, levelName } = await this.resolveLevel(input.countryCode, input.level);
    const areas = await this.units.findLookupRows(country.countryCode, input.level);
    if (areas.length === 0) {
      throw new ValidationError([
        { field: "level", message: `No ${levelName} areas are live yet. Rainfall is recorded per ${levelName}: import and promote them first.` },
      ]);
    }

    const parsed = await readImportFile(file, { ...input, prefer: "rainfall" });
    assertHasRows(parsed);
    assertRainfallMappingFits(input.columnMapping, parsed.headings);

    const rows = prepareRainfallRows(parsed, input.columnMapping, {
      countryCode: country.countryCode,
      levelName,
      areas,
      live: await this.rainfall.findLiveValues(country.countryCode, input.level),
      currentMonth: monthOf(this.now()),
    });

    return this.imports.createCheckedRun(
      {
        target: "rainfall_observations",
        fileName: file.originalName.slice(0, 255),
        fileType: parsed.fileType,
        sheetName: parsed.sheetName,
        // The ERD records rainfall as OBSERVED; CHIRPS blends satellite estimates with station gauges.
        options: { countryCode: country.countryCode, level: input.level, levelName, dataType: "OBSERVED" },
        columnMapping: input.columnMapping,
        sourceId: input.sourceId,
        createdBy: actor.id,
        warnings: [...parsed.warnings, ...summariseRainfallRows(rows, shapeColumns(parsed.headings), levelName)],
      },
      rows,
      null,
    );
  }

  async get(id: string, query: GetImportQuery): Promise<{ run: ImportRunDto; rows: StagingRowDto[]; meta: PageMeta }> {
    const run = await this.imports.findRunById(id);
    if (!run) throw new NotFoundError("Import run");
    const { items, meta } = await this.imports.findRowPage(id, query);
    return { run, rows: items, meta };
  }

  list(query: ListImportsQuery): Promise<{ items: ImportRunDto[]; meta: PageMeta }> {
    return this.imports.findRunPage(query);
  }

  async geoJson(id: string, bbox: BBox): Promise<StagingFeatureCollection> {
    if (!(await this.imports.findRunById(id))) throw new NotFoundError("Import run");
    return this.imports.findRunGeoJson(id, bbox);
  }

  /** Copies the rows that passed into the live table, all or nothing. */
  async promote(id: string, actor: AuthUser): Promise<ImportRunDto> {
    const run = await this.imports.findRunById(id);
    if (!run) throw new NotFoundError("Import run");
    if (run.status === "promoted") throw new ConflictError("This import has already been promoted");
    if (run.passedCount === 0) {
      throw new ConflictError("No rows passed the checks, so there is nothing to promote. Fix the file and upload it again.");
    }
    if (run.promotableCount === 0) {
      throw new ConflictError("Every row that passed is already live with the same value, so there is nothing to promote.");
    }

    await this.imports.promote(id, actor.id);
    const promoted = await this.imports.findRunById(id);
    if (!promoted) throw new NotFoundError("Import run");
    return promoted;
  }

  async template(query: AdminUnitTemplateQuery): Promise<TemplateFile> {
    const target = await this.resolveTarget(query.country, query.level);
    const context = {
      countryCode: target.country.countryCode,
      countryName: target.country.countryName,
      level: query.level,
      levelName: target.levelName,
      parentLevelName: target.parentLevelName,
      parents: target.parents,
    };
    return query.format === "geojson" ? buildAdminUnitTemplateGeoJson(context) : buildAdminUnitTemplateXlsx(context);
  }

  /** The country and the name of one of its levels, or a field-level 400. */
  private async resolveLevel(countryCode: string, level: number): Promise<{ country: Country; levelName: string }> {
    const country = await this.countries.findByCode(countryCode);
    if (!country) {
      throw new ValidationError([{ field: "countryCode", message: `No country with code ${countryCode}. Create it on the Countries page first.` }]);
    }
    const levelName = country.levelNames[level - 1];
    if (!levelName) {
      throw new ValidationError([
        { field: "level", message: `${country.countryName} has ${country.levelNames.length} levels (${country.levelNames.join(", ")})` },
      ]);
    }
    return { country, levelName };
  }

  private async resolveTarget(countryCode: string, level: number, parentId?: string): Promise<ResolvedTarget> {
    const { country, levelName } = await this.resolveLevel(countryCode, level);
    if (level === 1 && parentId) {
      throw new ValidationError([{ field: "parentId", message: `${levelName} areas belong directly to ${country.countryName}` }]);
    }

    const parents = level > 1 ? await this.units.findLookupRows(countryCode, level - 1) : [];
    const fixedParent = parentId ? (parents.find((p) => p.id === parentId) ?? null) : null;
    if (parentId && !fixedParent) {
      throw new ValidationError([
        { field: "parentId", message: `That parent isn't a live ${country.levelNames[level - 2]} of ${country.countryName}` },
      ]);
    }
    return { country, levelName, parentLevelName: level > 1 ? country.levelNames[level - 2]! : null, parents, fixedParent };
  }
}

function assertHasRows(parsed: ParsedFile): void {
  if (parsed.rows.length === 0) {
    throw new ValidationError([{ field: "file", message: "The file has no data rows below its headings" }]);
  }
}

function toBBox(value: number[] | null): BBox | null {
  return value && value.length === 4 ? (value as BBox) : null;
}

function shorten(values: Record<string, string | null>): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      value && value.length > SAMPLE_TEXT ? `${value.slice(0, SAMPLE_TEXT)}… (${value.length.toLocaleString("en")} characters)` : value,
    ]),
  );
}
