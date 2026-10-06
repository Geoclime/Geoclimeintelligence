import type { AuthUser } from "../../../common/access/auth-user";
import { ConflictError, NotFoundError, UnprovenDataError, ValidationError } from "../../../common/errors/app-error";
import type { BBox } from "../../../common/geo/geo";
import type { PageMeta } from "../../../common/response/api-response";
import { AdminUnitRepository } from "../../admin-units/admin-unit.repository";
import type { AdminUnitLookupRow, IAdminUnitRepository } from "../../admin-units/admin-unit.types";
import type { Country } from "../../admin-units/country.entity";
import { CountryRepository } from "../../admin-units/country.repository";
import type { ICountryRepository } from "../../admin-units/country.types";
import { DataSourceRepository } from "../data-source.repository";
import type { IDataSourceRepository } from "../data-source.types";
import { prepareAdminUnitRows } from "./admin-unit-rows";
import { buildAdminUnitTemplateGeoJson, buildAdminUnitTemplateXlsx, type TemplateFile } from "./admin-unit-template";
import { assertMappingFits, suggestMapping } from "./column-mapping";
import { ImportRepository } from "./import.repository";
import {
  ADMIN_UNIT_TEMPLATE_COLUMNS,
  type ColumnMapping,
  type IImportRepository,
  type ImportFileType,
  type ImportRunDto,
  type StagingFeatureCollection,
  type StagingRowDto,
  type TemplateColumn,
  type UploadedFile,
} from "./import.types";
import { readImportFile } from "./readers/read-import-file";
import type { AdminUnitTemplateQuery, GetImportQuery, ListImportsQuery, PreviewImportBody, StartImportBody } from "./import.validation";

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
  templateColumns: readonly TemplateColumn[];
  suggestedMapping: ColumnMapping;
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
    ));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly imports: IImportRepository,
    private readonly countries: Pick<ICountryRepository, "findByCode">,
    private readonly units: Pick<IAdminUnitRepository, "findLookupRows">,
    private readonly sources: Pick<IDataSourceRepository, "findById">,
  ) {}

  /** Reads the file's headings and a few rows, and guesses the column mapping. Stores nothing. */
  async preview(file: UploadedFile, input: PreviewImportBody): Promise<ImportPreviewDto> {
    const parsed = await readImportFile(file, input);
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
      templateColumns: ADMIN_UNIT_TEMPLATE_COLUMNS,
      suggestedMapping: suggestMapping(parsed.headings, { fileType: parsed.fileType, needsParentColumn }),
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
    if (parsed.rows.length === 0) {
      throw new ValidationError([{ field: "file", message: "The file has no data rows below its headings" }]);
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
    const warnings = bbox
      ? []
      : [`${target.country.countryName} has no rough bounding box, so shapes were not checked against it. Add one on the country's edit page.`];

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

    await this.imports.promoteAdminUnits(id, actor.id);
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

  private async resolveTarget(countryCode: string, level: number, parentId?: string): Promise<ResolvedTarget> {
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
