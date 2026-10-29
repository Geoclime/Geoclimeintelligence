import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, type ChangeEvent } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import { ColumnMappingFields } from "../../../components/imports/ColumnMappingFields";
import { DataSourceDialog } from "../../../components/imports/DataSourceDialog";
import { FilePreviewTable } from "../../../components/imports/FilePreviewTable";
import { ImportGuide, levelAvailable, nextLevel } from "../../../components/imports/ImportGuide";
import {
  detectLayerChoiceFromFileName,
  isOsmLayer,
  EMPTY_MAPPING,
  importFormSchema,
  mappingToForm,
  parseLayerChoice,
  toMapLayerUpload,
  toStartImport,
  type ImportFormValues,
} from "../../../components/imports/import-form.schema";
import "../../../components/imports/imports.css";
import { Breadcrumbs } from "../../../components/shared/Breadcrumbs/Breadcrumbs";
import { Button } from "../../../components/shared/Button";
import { Callout } from "../../../components/shared/Callout";
import { Icon } from "../../../components/shared/Icon";
import { SelectField } from "../../../components/shared/SelectField";
import { TextField } from "../../../components/shared/TextField";
import { env } from "../../../config/env";
import { useAdminUnits } from "../../../hooks/useAdminUnits";
import { useCountries } from "../../../hooks/useCountries";
import { useDataSources } from "../../../hooks/useDataSources";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useImportUpload } from "../../../hooks/useImportUpload";
import { useMapLayerCatalog } from "../../../hooks/useMapLayerCatalog";
import { useTemplateDownload } from "../../../hooks/useTemplateDownload";
import { useToast } from "../../../hooks/useToast";
import { errorMessage } from "../../../transport/api-error";
import type { ImportFileType, ImportPreview, TemplateFormat } from "../../../types/import.types";
import type { MapLayerLoadReport, OverlayLayerId } from "../../../types/map-layer.types";
import { applySubmitError } from "../../../utils/form-errors";

const FILE_TYPE_LABELS: Record<ImportFileType, string> = {
  xlsx: "Excel workbook",
  geojson: "GeoJSON",
  shapefile: "Shapefile",
  csv: "CSV file",
};

const SERVER_FIELDS = [
  "countryCode", "level", "sourceId", "sheetName", "headerRow", "parentId",
  "columnMapping.unit_name", "columnMapping.unit_code", "columnMapping.parent_code", "columnMapping.geometry_wkt",
] as const;

const LAYER_LABELS: Record<string, string> = {
  roads: "Roads",
  waterways: "Waterways",
  settlements: "Settlements",
  infrastructure: "Infrastructure",
  buildings: "Buildings",
  zip: "Map layers delivery zip",
};

/**
 * "Import data": choose the country, level (or map layer) and data source, download the matching
 * template if needed, upload the filled file (or a real file such as the lga_boundaries sheet or
 * rivers_roads.geojson), match its columns for boundaries, and check or load it.
 * ?country=NGA&level=2 presets the choice (the country page's "Import areas" button).
 */
export function ImportNewPage() {
  useDocumentTitle("New import");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const methods = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      countryCode: searchParams.get("country") ?? "",
      level: searchParams.get("level") ?? "",
      sourceId: "",
      sheetName: "",
      headerRow: "",
      parentMode: "column",
      parentId: "",
      fileType: "",
      acceptPartial: false,
      columnMapping: EMPTY_MAPPING,
    },
  });
  const { register, control, setValue, setError, clearErrors, handleSubmit, formState } = methods;
  const [countryCode, levelText, headerRow] = useWatch({
    control,
    name: ["countryCode", "level", "headerRow"],
  });
  const layerKind = parseLayerChoice(levelText);
  const level = layerKind ? 0 : Number(levelText) || 0;

  const { countries } = useCountries();
  const { sources, addSource } = useDataSources();
  const { preview, start, uploadLayer, clearLayer } = useImportUpload();
  const { catalog: layerCatalog, refetch: refetchLayerCatalog } = useMapLayerCatalog();
  const template = useTemplateDownload();
  const country = countries.find((c) => c.countryCode === countryCode) ?? null;
  const levelName = level > 0 ? (country?.levels[level - 1]?.name ?? null) : null;
  const parentLevelName = level > 1 ? (country?.levels[level - 2]?.name ?? null) : null;
  const parents = useAdminUnits({ countryCode, level: level - 1, pageSize: 100, enabled: Boolean(country) && level > 1 });

  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [layerReport, setLayerReport] = useState<MapLayerLoadReport | null>(null);
  const [clearingLayers, setClearingLayers] = useState(false);
  const [sourceDialog, setSourceDialog] = useState(0);

  const readFile = async (next: File, options: { sheetName?: string; headerRow?: number } = {}) => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const result = await preview({
        file: next,
        ...options,
        countryCode: countryCode || undefined,
        // No parentId, even in "one parent" mode: the guess should still look for a parent column,
        // or a sheet without one would stop every later sheet from finding theirs.
        level: level || undefined,
      });
      // The form values are applied in the effect below, once the new sheet's headings exist as
      // <option>s. Setting them here selected options that weren't rendered yet, so a guess that
      // only the new sheet has (the lga_boundaries "state" column) showed as "Not in this file".
      setFilePreview(result);
    } catch (error) {
      setFilePreview(null);
      setPreviewError(errorMessage(error));
    } finally {
      setPreviewing(false);
    }
  };

  // Choosing a country preselects the level to import next (States, then LGAs, then Wards). A
  // preset from ?country=&level= is set again here, once the countries have loaded and the
  // <option>s exist, or the dropdowns would show "Choose…" while the form holds the preset.
  useEffect(() => {
    if (!country) return;
    setValue("countryCode", country.countryCode);
    const next = levelText || String(nextLevel(country) ?? "");
    if (next) setValue("level", next);
  }, [country, levelText, setValue]);

  useEffect(() => {
    if (!filePreview) return;
    setValue("fileType", filePreview.fileType);
    setValue("sheetName", filePreview.sheetName ?? "");
    setValue("headerRow", filePreview.headerRow ? String(filePreview.headerRow) : "");
    setValue("columnMapping", mappingToForm(filePreview.suggestedMapping));
  }, [filePreview, setValue]);

  // With one live parent and no parent column found in the file, every row can only belong to
  // that parent, so pick it. A guessed parent column wins: a file may hold areas of several parents.
  const onlyParentId = parents.units.length === 1 ? parents.units[0]!.id : null;
  useEffect(() => {
    if (!filePreview || level < 2) return;
    if (filePreview.suggestedMapping.parent_code) {
      setValue("parentMode", "column");
    } else if (onlyParentId) {
      setValue("parentMode", "fixed");
      setValue("parentId", onlyParentId);
    }
  }, [filePreview, onlyParentId, level, setValue]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setFilePreview(null);
    setLayerReport(null);
    if (!next) return;

    const detectedLayer = detectLayerChoiceFromFileName(next.name);
    if (detectedLayer && !layerKind) {
      setValue("level", detectedLayer, { shouldValidate: true });
      clearErrors("columnMapping");
    }
    const effectiveLayer = parseLayerChoice(detectedLayer ?? levelText);
    // The delivery zip and the OpenStreetMap extract have no columns to match, so nothing to preview.
    if (effectiveLayer === "zip" || isOsmLayer(effectiveLayer)) {
      setPreviewError(null);
      return;
    }
    void readFile(next);
  };

  const downloadTemplate = async (format: TemplateFormat) => {
    if (await template.download(countryCode, level, format)) {
      showToast({ type: "success", message: "Template downloaded. Fill in the Areas sheet, then upload it below." });
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    const chosenLayer = parseLayerChoice(values.level);
    if (!file || (!chosenLayer && !filePreview)) {
      setError("root.server", { message: "Choose a file to upload first." });
      return;
    }
    try {
      if (chosenLayer) {
        const report = await uploadLayer(toMapLayerUpload(values, file, chosenLayer));
        setLayerReport(report);
        refetchLayerCatalog();
        const inserted = report.layers.reduce((sum, l) => sum + l.inserted, 0);
        const existing = report.layers.reduce((sum, l) => sum + l.alreadyPresent, 0);
        showToast({
          type: "success",
          message: `Loaded ${inserted.toLocaleString("en")} features (${existing.toLocaleString("en")} already present).`,
        });
        return;
      }
      const run = await start(toStartImport(values, file, filePreview!.fileType));
      showToast({ type: "success", message: `Checked ${run.rowCount} rows: ${run.passedCount} passed, ${run.errorCount} failed.` });
      navigate(`/admin/imports/${run.id}`);
    } catch (error) {
      applySubmitError(error, setError, SERVER_FIELDS);
    }
  });

  const ready = Boolean(country && levelName);
  const liveAtLevel = level > 0 ? (country?.levels[level - 1]?.unitCount ?? 0) : 0;
  const targetLayerIds: OverlayLayerId[] =
    layerKind === "zip" ? ["roads", "waterways"] : layerKind ? [layerKind] : [];
  const liveLayerCount = targetLayerIds.reduce(
    (sum, id) => sum + (layerCatalog.find((l) => l.id === id)?.featureCount ?? 0),
    0,
  );

  const handleClearLayer = async () => {
    if (!countryCode || targetLayerIds.length === 0) return;
    setClearingLayers(true);
    try {
      const report = await clearLayer({ countryCode, layers: targetLayerIds });
      const total = Object.values(report.deleted).reduce((sum, n) => sum + (n ?? 0), 0);
      setLayerReport(null);
      refetchLayerCatalog();
      showToast({
        type: "success",
        message: `Cleared ${total.toLocaleString("en")} ${LAYER_LABELS[layerKind ?? ""] ?? "layer"} features.`,
      });
    } catch (error) {
      showToast({ type: "error", message: errorMessage(error) });
    } finally {
      setClearingLayers(false);
    }
  };

  return (
    <div className="page" data-cy="import-new-page">
      <Breadcrumbs items={[{ label: "Imports", to: "/admin/imports" }, { label: "New import" }]} />
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Administration</p>
          <h1 className="page__title">Import areas</h1>
          <p className="page__lead">
            Every row is checked before anything goes live: the shape, where it sits, its name and its parent. You review
            the results and promote them on the next screen.
          </p>
        </div>
      </header>

      <ImportGuide country={country} level={level} onPickLevel={(next) => setValue("level", String(next), { shouldValidate: true })} />

      <FormProvider {...methods}>
        <form className="import-steps" onSubmit={onSubmit} noValidate data-cy="import-form">
          {formState.errors.root?.server && (
            <Callout tone="danger" dataCy="form-error">
              {formState.errors.root.server.message}
            </Callout>
          )}

          <section className="card card__body" aria-labelledby="step-1">
            <h2 id="step-1" className="import-step__title form-section__title">
              <span className="import-step__number">1</span>What are you importing?
            </h2>
            <p className="form-section__lead">The country, the level or map layer, and where the data comes from.</p>
            <div className="form-grid form-grid--2">
              <SelectField
                label="Country"
                error={formState.errors.countryCode?.message}
                data-cy="import-country"
                {...register("countryCode", { onChange: () => setValue("level", "") })}
              >
                <option value="">Choose…</option>
                {countries.map((c) => (
                  <option key={c.countryCode} value={c.countryCode}>
                    {c.countryName} ({c.countryCode})
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Level"
                hint={country ? "Choose an administrative boundary level, or a map feature layer (Roads, Waterways, Settlements, Infrastructure, Buildings)." : undefined}
                error={formState.errors.level?.message}
                disabled={!country}
                data-cy="import-level"
                {...register("level", {
                  onChange: () => {
                    clearErrors("columnMapping");
                    setLayerReport(null);
                  },
                })}
              >
                <option value="">Choose…</option>
                {country?.levels.map((l) => {
                  const available = levelAvailable(country, l.level);
                  return (
                    <option key={l.level} value={String(l.level)} disabled={!available}>
                      {l.level}. {l.name} {available ? `(${l.unitCount} live)` : `(import ${country.levels[l.level - 2]?.name ?? "the level above"} first)`}
                    </option>
                  );
                })}
                {country && (
                  <optgroup label="Map feature layers">
                    <option value="layer:roads">Map layer: Roads (GeoJSON)</option>
                    <option value="layer:waterways">Map layer: Waterways (GeoJSON)</option>
                    <option value="layer:settlements">Map layer: Settlements (GeoJSON)</option>
                    <option value="layer:infrastructure">Map layer: Infrastructure (OpenStreetMap extract, .zip or .gpkg)</option>
                    <option value="layer:buildings">Map layer: Buildings (OpenStreetMap extract, .zip or .gpkg)</option>
                    <option value="layer:zip">Map layer: Delivery zip (provenance.json + layers)</option>
                  </optgroup>
                )}
              </SelectField>
            </div>
            {country && levelName && !levelAvailable(country, level) && (
              <div className="section-gap">
                <Callout tone="warning" dataCy="level-locked">
                  No {parentLevelName} areas are live yet, so {levelName} areas have nothing to belong to. Import and promote the{" "}
                  {parentLevelName} level first.
                </Callout>
              </div>
            )}
            {liveAtLevel > 0 && (
              <div className="section-gap">
                <Callout tone="info" dataCy="level-has-areas">
                  {liveAtLevel} {levelName} areas are already live. Any of them in your file will fail as duplicates and be left
                  out, so it's simplest to upload only the {levelName} areas that are missing.
                </Callout>
              </div>
            )}
            {layerKind && liveLayerCount > 0 && (
              <div className="section-gap">
                <Callout tone="info" dataCy="layer-has-features">
                  <div className="source-picker">
                    <span>
                      <strong>{liveLayerCount.toLocaleString("en")}</strong> {LAYER_LABELS[layerKind]} features are currently loaded.
                      Re-uploading skips features already present, or you can clear them first to test a fresh import.
                    </span>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Icon name="trash" size={16} />}
                      loading={clearingLayers}
                      loadingLabel="Clearing…"
                      onClick={() => void handleClearLayer()}
                      data-cy="clear-map-layer"
                    >
                      Clear {LAYER_LABELS[layerKind]} ({liveLayerCount.toLocaleString("en")})
                    </Button>
                  </div>
                </Callout>
              </div>
            )}
            {layerKind === "zip" ? (
              <div className="section-gap">
                <Callout tone="info" dataCy="layer-zip-note">
                  A delivery zip includes its own <code>provenance.json</code>, so data sources for its roads and waterways are recorded automatically.
                </Callout>
              </div>
            ) : (
              <>
                <div className="source-picker section-gap">
                  {/* Controlled, so a source added from the dialog is selected once its option exists. */}
                  <Controller
                    control={control}
                    name="sourceId"
                    render={({ field }) => (
                      <SelectField label="Data source" error={formState.errors.sourceId?.message} data-cy="import-source" {...field}>
                        <option value="">Choose…</option>
                        {sources.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.provider}: {s.datasetName}
                          </option>
                        ))}
                      </SelectField>
                    )}
                  />
                  <Button variant="secondary" icon={<Icon name="plus" size={16} />} onClick={() => setSourceDialog((n) => n + 1)} data-cy="add-source">
                    Add a source
                  </Button>
                </div>
                <p className="field__help">
                  {sources.length === 0
                    ? "Who published this data? There are no sources yet: press Add a source and enter the publisher, dataset, licence and download date from the file's README."
                    : "Who published this data? It's recorded with every feature, for credit and licensing. Not listed? Add a source here, or remove old ones under Configuration."}
                </p>
                {layerKind === "infrastructure" && (
                  <Callout tone="info" dataCy="layer-infrastructure-note">
                    Upload Geofabrik&apos;s OpenStreetMap extract as delivered (the zip of <code>gis_osm_*.gpkg</code> files), or one of its
                    facility files. Only points of interest, places of worship and transport are read: clinics, schools, police, markets,
                    ferry terminals, water points and the like. Shops, kiosks and sports pitches are left out. The source is usually
                    &quot;OpenStreetMap contributors via Geofabrik&quot;, licence ODbL 1.0.
                  </Callout>
                )}
                {layerKind === "buildings" && (
                  <Callout tone="info" dataCy="layer-buildings-note">
                    Upload the same OpenStreetMap extract (the zip), or one <code>gis_osm_buildings_a_free_*.gpkg</code> file. Only the building
                    files are read. Rivers State has about 414,000 buildings, so loading takes a few minutes: keep this page open until the
                    report appears. Use the same source as Infrastructure if it&apos;s the same extract.
                  </Callout>
                )}
                {isOsmLayer(layerKind) && (
                  <label className="check-field" data-cy="accept-partial">
                    <input type="checkbox" {...register("acceptPartial")} />
                    <span>
                      Load even if rows are missing
                      <span className="field__help">
                        Only matters for a file that was cut short in transit. If every row still arrived it loads anyway, with a note in
                        the report. Tick this to load what is there when some rows are gone.
                      </span>
                    </span>
                  </label>
                )}
              </>
            )}
            {!layerKind && (
              <div className="template-actions section-gap">
                <span className="muted">Building a file by hand? Start from a blank one. Already have a file? Skip this and upload it below.</span>
                <Button variant="ghost" size="sm" icon={<Icon name="download" size={16} />} disabled={!ready} loading={template.downloading} onClick={() => void downloadTemplate("xlsx")} data-cy="download-xlsx">
                  Excel template
                </Button>
                <Button variant="ghost" size="sm" icon={<Icon name="download" size={16} />} disabled={!ready || template.downloading} onClick={() => void downloadTemplate("geojson")} data-cy="download-geojson">
                  GeoJSON sample
                </Button>
              </div>
            )}
            {template.error && <p className="field__error">{template.error}</p>}
          </section>

          <section className="card card__body" aria-labelledby="step-2">
            <h2 id="step-2" className="import-step__title form-section__title">
              <span className="import-step__number">2</span>Upload the file
            </h2>
            <p className="form-section__lead">
              A shapefile (the .shp, or a .zip of its .shp, .dbf and .prj), a GeoJSON file, an Excel workbook (.xlsx) or a CSV file. Excel and
              CSV hold shapes as WKT text. Up to {env.VITE_IMPORT_MAX_FILE_MB} MB.
            </p>
            <label className="field">
              <span className="field__label">File</span>
              <input type="file" accept=".shp,.zip,.geojson,.json,.xlsx,.csv,.tsv,.gpkg" className="field__input" onChange={onFileChange} data-cy="import-file" />
            </label>
            {previewing && <p className="muted section-gap">Reading the file…</p>}
            {previewError && (
              <div className="section-gap">
                <Callout tone="danger" dataCy="preview-error">
                  {previewError}
                </Callout>
              </div>
            )}
            {filePreview && file && (
              <div className="stack section-gap">
                <p className="file-summary" data-cy="file-summary">
                  <span>
                    <strong>{filePreview.rowCount}</strong> data rows
                  </span>
                  <span>{FILE_TYPE_LABELS[filePreview.fileType]}</span>
                  {filePreview.headerRow && <span>Headings in row {filePreview.headerRow}</span>}
                </p>
                {filePreview.fileType === "xlsx" && (
                  <div className="form-grid form-grid--2">
                    <SelectField
                      label="Sheet"
                      hint={
                        filePreview.sheets.length > 1
                          ? `This workbook has ${filePreview.sheets.length} sheets. Use the one that holds the areas and their shapes.`
                          : undefined
                      }
                      data-cy="import-sheet"
                      {...register("sheetName", { onChange: (event) => void readFile(file, { sheetName: event.target.value }) })}
                    >
                      {filePreview.sheets.map((sheet) => (
                        <option key={sheet} value={sheet}>
                          {sheet}
                        </option>
                      ))}
                    </SelectField>
                    <div className="source-picker">
                      <TextField label="Heading row" inputMode="numeric" hint="Detected automatically; change it if the guess is wrong." error={formState.errors.headerRow?.message} {...register("headerRow")} />
                      <Button
                        variant="secondary"
                        onClick={() => void readFile(file, { sheetName: filePreview.sheetName ?? undefined, headerRow: Number(headerRow) || undefined })}
                      >
                        Re-read
                      </Button>
                    </div>
                  </div>
                )}
                {filePreview.warnings.map((warning) => (
                  <Callout key={warning} tone="warning" dataCy="preview-warning">
                    {warning}
                  </Callout>
                ))}
                <FilePreviewTable preview={filePreview} />
              </div>
            )}

            {layerKind && file && (
              <div className="stack section-gap">
                <Callout tone="info" dataCy="layer-upload-ready">
                  Ready to load <strong>{file.name}</strong> into <strong>{LAYER_LABELS[layerKind]}</strong>. Standard OpenStreetMap / GRID3 properties are read automatically, and duplicate IDs already in the database are left untouched.
                </Callout>
                {layerReport && (
                  <Callout tone="success" dataCy="layer-upload-report">
                    {layerReport.layers.map((item) => (
                      <div key={`${item.layer}-${item.file}`}>
                        <strong>{item.layer.toUpperCase()}</strong> ({item.file}): {item.inserted.toLocaleString("en")} added,{" "}
                        {item.alreadyPresent.toLocaleString("en")} already present
                        {item.notes && item.notes.length > 0 && `. ${item.notes.join(" ")}`}
                        {Object.keys(item.rejected).length > 0 &&
                          `, left out: ${Object.entries(item.rejected)
                            .map(([reason, count]) => `${count} × ${reason}`)
                            .join(", ")}`}
                      </div>
                    ))}
                  </Callout>
                )}
                <div className="form-actions">
                  <Button variant="secondary" onClick={() => navigate("/")}>
                    Open map
                  </Button>
                  <Button
                    type="submit"
                    icon={<Icon name="check" size={16} />}
                    loading={formState.isSubmitting}
                    loadingLabel="Loading map layer into PostGIS…"
                    data-cy="start-import"
                  >
                    Load {LAYER_LABELS[layerKind]}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {filePreview && !layerKind && (
            <section className="card card__body" aria-labelledby="step-3">
              <h2 id="step-3" className="import-step__title form-section__title">
                <span className="import-step__number">3</span>Match the columns
              </h2>
              <p className="form-section__lead">Tell us which of the file's columns holds each piece. We've guessed from the headings.</p>
              <ColumnMappingFields
                headings={filePreview.headings}
                fileType={filePreview.fileType}
                level={level}
                levelName={levelName ?? "area"}
                parentLevelName={parentLevelName}
                parents={parents.units}
                sampleRow={filePreview.sampleRows[0]}
              />
              <div className="form-actions">
                <Button variant="secondary" onClick={() => navigate("/admin/imports")}>
                  Cancel
                </Button>
                <Button type="submit" icon={<Icon name="check" size={16} />} loading={formState.isSubmitting} loadingLabel="Checking every row…" data-cy="start-import">
                  Check the file
                </Button>
              </div>
            </section>
          )}
        </form>
      </FormProvider>

      <DataSourceDialog
        key={sourceDialog}
        open={sourceDialog > 0}
        onClose={() => setSourceDialog(0)}
        onSave={addSource}
        onSaved={(source) => {
          setValue("sourceId", source.id, { shouldValidate: true });
          setSourceDialog(0);
          showToast({ type: "success", message: `${source.provider} added.` });
        }}
      />
    </div>
  );
}
