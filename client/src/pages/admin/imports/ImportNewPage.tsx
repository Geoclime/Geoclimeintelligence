import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ColumnMappingFields } from "../../../components/imports/ColumnMappingFields";
import { DataSourceDialog } from "../../../components/imports/DataSourceDialog";
import { FilePreviewTable } from "../../../components/imports/FilePreviewTable";
import { ImportGuide, levelAvailable, nextLevel } from "../../../components/imports/ImportGuide";
import {
  detectLayerChoiceFromFileName,
  isOsmLayer,
  EMPTY_MAPPING,
  importFormSchema,
  isFloodRiskChoice,
  isSatelliteFloodChoice,
  mappingToForm,
  parseLayerChoice,
  parseRainfallChoice,
  toMapLayerUpload,
  toStartFloodRiskImport,
  toStartImport,
  toStartRainfallImport,
  type ImportFormValues,
} from "../../../components/imports/import-form.schema";
import "../../../components/imports/imports.css";
import { RainfallMappingFields } from "../../../components/imports/RainfallMappingFields";
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
import {
  fetchExistingSatelliteMonths,
  useSatelliteFloodBatch,
  type BatchItem,
  type ExistingSatelliteMonth,
} from "../../../hooks/useSatelliteFloodBatch";
import { useTemplateDownload } from "../../../hooks/useTemplateDownload";
import { useToast } from "../../../hooks/useToast";
import { errorMessage } from "../../../transport/api-error";
import type { ImportFileType, ImportPreview, TemplateFormat } from "../../../types/import.types";
import type { MapLayerLoadReport, OverlayLayerId } from "../../../types/map-layer.types";
import { applySubmitError } from "../../../utils/form-errors";
import { MAP_PATH } from "../../../utils/map-url";
import { formatYearMonth } from "../../../utils/rainfall-summary";
import { monthFromFileName, pickMonthlyTiles, type MonthlyTiles } from "../../../utils/monthly-tiles";

const FILE_TYPE_LABELS: Record<ImportFileType, string> = {
  xlsx: "Excel workbook",
  geojson: "GeoJSON",
  shapefile: "Shapefile",
  csv: "CSV file",
  geotiff: "GeoTIFF",
  mbtiles: "Map tiles (MBTiles)",
};

/** What each file of a satellite flood batch is doing, as the results list says it. */
const BATCH_LABELS: Record<BatchItem["state"], string> = {
  waiting: "Waiting",
  checking: "Checking…",
  checked: "Checked, not live yet",
  promoting: "Promoting…",
  promoted: "Live",
  failed: "Refused",
};

const SERVER_FIELDS = [
  "countryCode", "level", "sourceId", "sheetName", "headerRow", "parentId", "yearMonth",
  "columnMapping.unit_name", "columnMapping.unit_code", "columnMapping.parent_code", "columnMapping.geometry_wkt",
  "columnMapping.area_code", "columnMapping.area_name", "columnMapping.year_month", "columnMapping.rainfall_mm",
] as const;

/** CHIRPS from Earth Engine is averaged over ADM2 areas: LGAs in Nigeria. */
const RAINFALL_LEVEL = 2;

const LAYER_LABELS: Record<string, string> = {
  roads: "Roads",
  waterways: "Waterways",
  settlements: "Settlements",
  infrastructure: "Infrastructure",
  buildings: "Buildings",
  wetlands: "Wetlands",
  zip: "Map layers delivery zip",
};

/**
 * "Import data": choose the country, level (or map layer) and data source, download the matching
 * template if needed, upload the filled file (or a real file such as the lga_boundaries sheet or
 * rivers_roads.geojson), match its columns for boundaries, and check or load it. "Rainfall: monthly
 * per LGA" takes a CHIRPS export (or the cleaned rainfall sheet) through the same check-then-promote steps.
 * ?country=NGA&level=2 presets the choice (the country page's "Import areas" button); level=rainfall:2
 * presets rainfall.
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
      yearMonth: "",
      columnMapping: EMPTY_MAPPING,
    },
  });
  const { register, control, setValue, setError, clearErrors, handleSubmit, formState } = methods;
  const [countryCode, levelText, headerRow] = useWatch({ control, name: ["countryCode", "level", "headerRow"] });
  const layerKind = parseLayerChoice(levelText);
  const rainfallLevel = parseRainfallChoice(levelText);
  const floodRiskChoice = isFloodRiskChoice(levelText);
  const satelliteChoice = isSatelliteFloodChoice(levelText);
  // 0 for map layers, rainfall, the flood risk map and satellite flood: none of the boundary-level steps apply to them.
  const level = layerKind || rainfallLevel !== null || floodRiskChoice || satelliteChoice ? 0 : Number(levelText) || 0;

  const { countries } = useCountries();
  const { sources, addSource } = useDataSources();
  const { preview, start, startRainfall, startFloodRisk, uploadLayer, clearLayer } = useImportUpload();
  const { catalog: layerCatalog, refetch: refetchLayerCatalog } = useMapLayerCatalog();
  const template = useTemplateDownload();
  const country = countries.find((c) => c.countryCode === countryCode) ?? null;
  const levelName = level > 0 ? (country?.levels[level - 1]?.name ?? null) : null;
  const parentLevelName = level > 1 ? (country?.levels[level - 2]?.name ?? null) : null;
  const rainfallLevelName = rainfallLevel !== null ? (country?.levels[rainfallLevel - 1]?.name ?? "area") : null;
  /** The one level rainfall can be imported for: level 2, which the CHIRPS export (ADM2) covers. */
  const rainfallChoice = country?.levels.find((l) => l.level === RAINFALL_LEVEL) ?? null;
  const parents = useAdminUnits({ countryCode, level: level - 1, pageSize: 100, enabled: Boolean(country) && level > 1 });

  const [file, setFile] = useState<File | null>(null);
  // Satellite flood takes many files at once (one per month); every other kind takes the first.
  const [files, setFiles] = useState<File[]>([]);
  // What a chosen folder (or several tiles) holds: months, gaps and what was left out, shown before checking.
  const [tileSet, setTileSet] = useState<MonthlyTiles | null>(null);
  const [existingSatellite, setExistingSatellite] = useState<{
    byMonth: Map<string, ExistingSatelliteMonth>;
    byFileName: Map<string, ExistingSatelliteMonth>;
  } | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const batch = useSatelliteFloodBatch();
  const [filePreview, setFilePreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [layerReport, setLayerReport] = useState<MapLayerLoadReport | null>(null);
  const [clearingLayers, setClearingLayers] = useState(false);
  const [sourceDialog, setSourceDialog] = useState(0);

  /** `choice` is the Level value the file is read for; it differs from the form's while a change is applied. */
  const readFile = async (next: File, options: { sheetName?: string; headerRow?: number } = {}, choice = levelText) => {
    setPreviewing(true);
    setPreviewError(null);
    const rainfallFor = parseRainfallChoice(choice);
    try {
      const result = await preview({
        file: next,
        ...options,
        countryCode: countryCode || undefined,
        // No parentId, even in "one parent" mode: the guess should still look for a parent column,
        // or a sheet without one would stop every later sheet from finding theirs.
        level: (rainfallFor ?? (parseLayerChoice(choice) ? 0 : Number(choice))) || undefined,
        target: rainfallFor !== null ? "rainfall_observations" : undefined,
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

  // When importing a folder/batch of satellite flood tiles, look up which months have already been
  // checked or promoted for this country so we can tell the admin and skip re-checking them.
  useEffect(() => {
    if (!satelliteChoice || !countryCode || files.length <= 1) {
      setExistingSatellite(null);
      return;
    }
    let cancelled = false;
    void fetchExistingSatelliteMonths(countryCode).then((lookup) => {
      if (!cancelled) setExistingSatellite(lookup);
    });
    return () => {
      cancelled = true;
    };
  }, [satelliteChoice, countryCode, files]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    // Several months of tiles: sorted into month order, as a folder is.
    if (chosen.length > 1 && chosen.every((f) => f.name.toLowerCase().endsWith(".mbtiles"))) {
      const picked = pickMonthlyTiles(chosen);
      setTileSet(picked);
      chooseFiles(picked.files);
    } else {
      setTileSet(null);
      chooseFiles(chosen);
    }
  };

  /** A whole folder of monthly tiles: only its .mbtiles files are kept, one per month, in month order. */
  const onFolderChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = pickMonthlyTiles(Array.from(event.target.files ?? []));
    // Cleared so choosing the same folder again (after adding a month to it) is noticed.
    event.target.value = "";
    if (picked.files.length === 0) {
      setTileSet(null);
      chooseFiles([]);
      setPreviewError("That folder has no .mbtiles files. Choose the folder that holds the monthly tiles (s1_flood_2016_01.mbtiles and so on).");
      return;
    }
    setTileSet(picked);
    chooseFiles(picked.files);
  };

  const chooseFiles = (chosen: File[]) => {
    const next = chosen[0] ?? null;
    setFile(next);
    setFiles(chosen);
    setFilePreview(null);
    setLayerReport(null);
    batch.clear();
    if (!next) return;

    const detectedLayer = detectLayerChoiceFromFileName(next.name);
    const applied = detectedLayer && !layerKind;
    if (applied) {
      setValue("level", detectedLayer, { shouldValidate: true });
      clearErrors("columnMapping");
    }
    const effectiveLayer = parseLayerChoice(detectedLayer ?? levelText);
    // The delivery zip and the OpenStreetMap extract have no columns to match, so nothing to preview.
    // Nor has the flood risk map (a grid of cells, not rows), nor satellite flood tiles.
    const choice = detectedLayer ?? levelText;
    if (effectiveLayer === "zip" || isOsmLayer(effectiveLayer) || isFloodRiskChoice(choice) || isSatelliteFloodChoice(choice)) {
      setPreviewError(null);
      return;
    }
    void readFile(next, {}, applied ? detectedLayer : levelText);
  };

  const downloadTemplate = async (format: TemplateFormat) => {
    if (await template.download(countryCode, level, format)) {
      showToast({ type: "success", message: "Template downloaded. Fill in the Areas sheet, then upload it below." });
    }
  };

  const handleRetryFailedBatch = async () => {
    const results = await batch.retryFailed();
    const checked = results.filter((item) => item.state === "checked" || item.state === "promoted");
    const failed = results.filter((item) => item.state === "failed");
    showToast({
      type: failed.length === 0 ? "success" : "error",
      message:
        failed.length === 0
          ? `All ${checked.length} months checked. Review them, or promote them all below.`
          : `${checked.length} of ${results.length} months checked; ${failed.length} still failed.`,
    });
  };

  const onSubmit = handleSubmit(async (values) => {
    const chosenLayer = parseLayerChoice(values.level);
    const rainfallFor = parseRainfallChoice(values.level);
    const floodRiskFor = isFloodRiskChoice(values.level);
    const satelliteFor = isSatelliteFloodChoice(values.level);
    if (!file || (!chosenLayer && !floodRiskFor && !satelliteFor && !filePreview)) {
      setError("root.server", { message: "Choose a file to upload first." });
      return;
    }
    if (satelliteFor) {
      const results = await batch.checkAll({ files, countryCode: values.countryCode, sourceId: values.sourceId, yearMonth: values.yearMonth || undefined });
      const checked = results.filter((item) => item.state === "checked");
      const ready = results.filter((item) => item.state === "checked" || item.state === "promoted");
      if (results.length === 1 && checked[0]?.run) {
        navigate(`/admin/imports/${checked[0].run.id}`);
        return;
      }
      showToast({
        type: ready.length === results.length ? "success" : "error",
        message: `Checked ${ready.length} of ${results.length} months.${ready.length < results.length ? " See the reasons below." : " Review them, or promote them all below."}`,
      });
      return;
    }
    try {
      if (floodRiskFor) {
        const run = await startFloodRisk(toStartFloodRiskImport(values, file));
        showToast({ type: "success", message: `Measured ${run.rowCount} areas: ${run.passedCount} passed, ${run.errorCount} failed.` });
        navigate(`/admin/imports/${run.id}`);
        return;
      }
      if (rainfallFor !== null) {
        const run = await startRainfall(toStartRainfallImport(values, file, filePreview!.fileType, rainfallFor));
        showToast({ type: "success", message: `Checked ${run.rowCount} rows: ${run.passedCount} passed, ${run.errorCount} failed.` });
        navigate(`/admin/imports/${run.id}`);
        return;
      }
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
  const failedBatchCount = batch.items.filter((item) => item.state === "failed" || item.state === "waiting").length;
  const alreadyImportedFilesCount =
    files.length > 1 && existingSatellite
      ? files.filter((f) => {
          const ym = monthFromFileName(f.name);
          return (ym && existingSatellite.byMonth.has(ym)) || existingSatellite.byFileName.has(f.name.toLowerCase());
        }).length
      : 0;

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
          <h1 className="page__title">
            {floodRiskChoice ? "Import the flood risk map" : satelliteChoice ? "Import satellite flood extent" : rainfallLevel !== null ? "Import rainfall" : "Import areas"}
          </h1>
          <p className="page__lead">
            {floodRiskChoice
              ? "The map is checked before anything goes live: that it can be read, that it lines up with the boundaries, and how much of each LGA and ward falls in each class."
              : satelliteChoice
                ? "Each month is checked before anything goes live: that its tiles can be read, that they line up with the boundaries, and how much of each LGA and ward was water."
              : rainfallLevel !== null
                ? "Every row is checked before anything goes live: the area it's for, the month and the value, and how it compares with the rainfall already live."
                : "Every row is checked before anything goes live: the shape, where it sits, its name and its parent."}{" "}
            You review the results and promote them on the next screen.
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
                hint={
                  country
                    ? "Choose an administrative boundary level, a map feature layer (Roads, Waterways, Settlements, Infrastructure, Buildings), or monthly rainfall."
                    : undefined
                }
                error={formState.errors.level?.message}
                disabled={!country}
                data-cy="import-level"
                {...register("level", {
                  onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                    clearErrors("columnMapping");
                    setLayerReport(null);
                    // Areas and rainfall guess different columns (and may read different sheets): read again.
                    const next = event.target.value;
                    batch.clear();
                    const noRows = parseLayerChoice(next) || isFloodRiskChoice(next) || isSatelliteFloodChoice(next);
                    if (file && filePreview && !noRows && (parseRainfallChoice(next) !== null) !== (rainfallLevel !== null)) {
                      void readFile(file, {}, next);
                    }
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
                    <option value="layer:wetlands">Map layer: Wetlands (OpenStreetMap extract, .zip or water_a .gpkg)</option>
                    <option value="layer:zip">Map layer: Delivery zip (provenance.json + layers)</option>
                  </optgroup>
                )}
                {/* Rainfall per level 2 only (LGA in Nigeria): the CHIRPS export is one row per ADM2 area per
                    month. Another level gets its own option once a rainfall file exists for it. */}
                {rainfallChoice && (
                  <optgroup label="Climate data">
                    <option value={`rainfall:${rainfallChoice.level}`} disabled={rainfallChoice.unitCount === 0}>
                      Rainfall: monthly per {rainfallChoice.name}{" "}
                      {rainfallChoice.unitCount > 0 ? "(CHIRPS export, .xlsx or .csv)" : `(import ${rainfallChoice.name} areas first)`}
                    </option>
                  </optgroup>
                )}
                {/* The flood risk map is measured per LGA and ward, so the LGAs must be live first, as for rainfall. */}
                {rainfallChoice && (
                  <optgroup label="Hazard data">
                    <option value="flood-risk" disabled={rainfallChoice.unitCount === 0}>
                      Flood risk map {rainfallChoice.unitCount > 0 ? "(classified GeoTIFF, .tif)" : `(import ${rainfallChoice.name} areas first)`}
                    </option>
                    <option value="satellite-flood" disabled={rainfallChoice.unitCount === 0}>
                      Satellite flood extent: monthly{" "}
                      {rainfallChoice.unitCount > 0 ? "(Sentinel-1 tiles, .mbtiles)" : `(import ${rainfallChoice.name} areas first)`}
                    </option>
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
                    <Button variant="danger" size="sm" icon={<Icon name="trash" size={16} />} loading={clearingLayers} loadingLabel="Clearing…" onClick={() => void handleClearLayer()} data-cy="clear-map-layer">
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
                {floodRiskChoice && (
                  <Callout tone="info" dataCy="flood-risk-note">
                    The classified flood risk map as a GeoTIFF: one band, each cell 1 (very low) to 5 (very high), in a WGS 84 / UTM grid, such as
                    the data team&apos;s <code>flood_risk_map.tif</code>. It is not the continuous index or a factor score. The map is checked
                    against the live LGAs and wards, and nothing goes live until you promote it. The source is who made the map and under what
                    licence, and the map is shown as <strong>derived</strong>: a modelled judgement of where it could flood, not an observation.
                  </Callout>
                )}
                {satelliteChoice && (
                  <Callout tone="info" dataCy="satellite-flood-note">
                    One file per month of water seen by Sentinel-1 radar, as the data team delivers it: <code>s1_flood_2016_08.mbtiles</code>{" "}
                    (PNG tiles, blue where water was seen, transparent elsewhere). The month comes from the file name. Choose as many months as you
                    like: each is checked against the live LGAs and wards as its own import, and nothing goes live until you promote it. A month
                    already live is replaced when its new import is promoted. The data is shown as <strong>derived</strong>: the radar is an
                    observation, but &quot;water&quot; is a threshold applied to it, and it includes rivers and creeks as well as floods.
                  </Callout>
                )}
                {rainfallLevel !== null && (
                  <Callout tone="info" dataCy="rainfall-note">
                    Monthly rainfall per {rainfallLevelName}, one row per {rainfallLevelName} per month: the CHIRPS export from Google
                    Earth Engine as delivered, or the cleaned <code>rainfall</code> sheet. Each row is matched to a live {rainfallLevelName}{" "}
                    by its code, or its name, and compared with the rainfall already live. Months already live with the same value are left
                    alone, so you can upload the whole combined file again each month. The source is usually &quot;Climate Hazards Center,
                    UC Santa Barbara: CHIRPS v2.0&quot;.
                  </Callout>
                )}
                {layerKind === "infrastructure" && (
                  <Callout tone="info" dataCy="layer-infrastructure-note">
                    Upload Geofabrik&apos;s OpenStreetMap extract as delivered (the zip of GeoPackages, named <code>gis_osm_pois_free_1.gpkg</code> or <code>rivers_pois.gpkg</code>), or one of its
                    facility files. Only points of interest, places of worship and transport are read: clinics, schools, police, markets,
                    ferry terminals, water points and the like. Shops, kiosks and sports pitches are left out. The source is usually
                    &quot;OpenStreetMap contributors via Geofabrik&quot;, licence ODbL 1.0.
                  </Callout>
                )}
                {layerKind === "buildings" && (
                  <Callout tone="info" dataCy="layer-buildings-note">
                    Upload the same OpenStreetMap extract (the zip), or one buildings <code>.gpkg</code> file (<code>rivers_buildings_a.gpkg</code>, <code>gis_osm_buildings_a_free_1.gpkg</code>...). Only the building
                    files are read. Rivers State has about 414,000 buildings, so loading takes a few minutes: keep this page open until the
                    report appears. Use the same source as Infrastructure if it&apos;s the same extract.
                  </Callout>
                )}
                {layerKind === "wetlands" && (
                  <Callout tone="info" dataCy="layer-wetlands-note">
                    Upload the same OpenStreetMap extract (the zip), or its water areas file (<code>rivers_water_a.gpkg</code>, <code>gis_osm_water_a_free_1.gpkg</code>). Only
                    mangrove, swamp, marsh and tidal flats are kept: open water is already on the waterways layer. Use the same source as
                    Infrastructure if it&apos;s the same extract.
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
            {!layerKind && rainfallLevel === null && !floodRiskChoice && !satelliteChoice && (
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
              {floodRiskChoice
                ? `The classified flood risk map: a GeoTIFF (.tif). Up to ${env.VITE_IMPORT_MAX_FILE_MB} MB.`
                : satelliteChoice
                  ? `One or more months of tiles (.mbtiles), one file per month, or a whole folder of them. Up to ${env.VITE_IMPORT_MAX_FILE_MB} MB each; they are checked one after another.`
                : `A shapefile (the .shp, or a .zip of its .shp, .dbf and .prj), a GeoJSON file, an Excel workbook (.xlsx) or a CSV file. Excel and CSV hold shapes as WKT text. Up to ${env.VITE_IMPORT_MAX_FILE_MB} MB.`}
            </p>
            <label className="field">
              <span className="field__label">File</span>
              <input
                type="file"
                accept={satelliteChoice ? ".mbtiles" : ".shp,.zip,.geojson,.json,.xlsx,.csv,.tsv,.gpkg,.tif,.tiff,.mbtiles"}
                multiple={satelliteChoice}
                className="field__input"
                onChange={onFileChange}
                data-cy="import-file"
              />
            </label>
            {satelliteChoice && (
              <div className="import-folder">
                <input
                  ref={folderInput}
                  type="file"
                  multiple
                  hidden
                  onChange={onFolderChange}
                  // Not in React's types, but every current browser supports it: the picker chooses a folder.
                  {...{ webkitdirectory: "", directory: "" }}
                  data-cy="import-folder"
                />
                <Button variant="secondary" size="sm" icon={<Icon name="upload" size={16} />} onClick={() => folderInput.current?.click()} disabled={batch.running}>
                  Choose a folder
                </Button>
                <span className="muted">Every .mbtiles file in it, one per month. Your browser may ask you to confirm the upload.</span>
              </div>
            )}
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
                          ? `This workbook has ${filePreview.sheets.length} sheets. Use the one that holds ${
                              rainfallLevel !== null ? "the rainfall" : "the areas and their shapes"
                            }.`
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
                      <Button variant="secondary" onClick={() => void readFile(file, { sheetName: filePreview.sheetName ?? undefined, headerRow: Number(headerRow) || undefined })}>
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

            {floodRiskChoice && file && (
              <div className="stack section-gap">
                <Callout tone="info" dataCy="flood-risk-ready">
                  Ready to measure <strong>{file.name}</strong> against every live LGA and ward. It can take a few seconds. Nothing goes live until you
                  promote it on the next screen.
                </Callout>
                <div className="form-actions">
                  <Button variant="secondary" onClick={() => navigate("/admin/imports")}>
                    Cancel
                  </Button>
                  <Button type="submit" icon={<Icon name="check" size={16} />} loading={formState.isSubmitting} loadingLabel="Measuring the map…" data-cy="start-import">
                    Check the map
                  </Button>
                </div>
              </div>
            )}

            {satelliteChoice && file && (
              <div className="stack section-gap">
                {batch.items.length === 0 && (
                  <Callout tone="info" dataCy="satellite-flood-ready">
                    Ready to check <strong>{files.length === 1 ? file.name : `${files.length} months`}</strong> against every live LGA and ward. Each
                    takes a few seconds. Nothing goes live until it is promoted.
                    {tileSet && <TileSetSummary tiles={tileSet} alreadyImported={alreadyImportedFilesCount} />}
                  </Callout>
                )}
                {files.length === 1 && (
                  <TextField
                    label="Month (only if the file name doesn't say)"
                    placeholder="YYYY-MM"
                    hint="Read from the file name (s1_flood_2016_08) when left blank."
                    error={formState.errors.yearMonth?.message}
                    data-cy="satellite-flood-year-month"
                    {...register("yearMonth")}
                  />
                )}
                {batch.items.length > 0 && (
                  <SatelliteBatchList items={batch.items} running={batch.running} onRetryOne={(index) => void batch.retryOne(index)} />
                )}
                <div className="form-actions">
                  {batch.running ? (
                    <Button variant="secondary" onClick={batch.stop} data-cy="satellite-flood-stop">
                      Stop after this file
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => navigate("/admin/imports")}>
                      {batch.items.length > 0 ? "Open the import history" : "Cancel"}
                    </Button>
                  )}
                  {!batch.running && failedBatchCount > 0 && (
                    <Button variant="secondary" icon={<Icon name="refresh" size={16} />} onClick={() => void handleRetryFailedBatch()} data-cy="satellite-flood-retry-failed">
                      Retry {failedBatchCount} failed {failedBatchCount === 1 ? "month" : "months"}
                    </Button>
                  )}
                  {batch.items.some((item) => item.state === "checked") ? (
                    <Button icon={<Icon name="check" size={16} />} loading={batch.running} loadingLabel="Working…" onClick={() => void batch.promoteAll()} data-cy="satellite-flood-promote-all">
                      Promote {batch.items.filter((item) => item.state === "checked").length} checked months
                    </Button>
                  ) : (
                    batch.items.length === 0 && (
                      <Button type="submit" icon={<Icon name="check" size={16} />} loading={formState.isSubmitting} loadingLabel="Checking…" data-cy="start-import">
                        {files.length === 1
                          ? "Check the month"
                          : alreadyImportedFilesCount > 0 && alreadyImportedFilesCount < files.length
                            ? `Check ${files.length - alreadyImportedFilesCount} remaining months`
                            : `Check ${files.length} months`}
                      </Button>
                    )
                  )}
                </div>
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
                  <Button variant="secondary" onClick={() => navigate(MAP_PATH)}>
                    Open map
                  </Button>
                  <Button type="submit" icon={<Icon name="check" size={16} />} loading={formState.isSubmitting} loadingLabel="Loading map layer into PostGIS…" data-cy="start-import">
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
              {rainfallLevel !== null ? (
                <RainfallMappingFields headings={filePreview.headings} levelName={rainfallLevelName ?? "area"} sampleRow={filePreview.sampleRows[0]} />
              ) : (
                <ColumnMappingFields
                  headings={filePreview.headings}
                  fileType={filePreview.fileType}
                  level={level}
                  levelName={levelName ?? "area"}
                  parentLevelName={parentLevelName}
                  parents={parents.units}
                  sampleRow={filePreview.sampleRows[0]}
                />
              )}
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

/** Lists up to eight names, then how many more. */
function someOf(names: string[]): string {
  return names.length <= 8 ? names.join(", ") : `${names.slice(0, 8).join(", ")} and ${names.length - 8} more`;
}

/**
 * What a chosen folder of monthly tiles holds, before anything is sent: the months it covers, the
 * months with no file, what was left out and why, and how much there is to upload.
 */
function TileSetSummary({ tiles, alreadyImported = 0 }: { tiles: MonthlyTiles; alreadyImported?: number }) {
  const megabytes = tiles.files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024;
  const remaining = Math.max(0, tiles.files.length - alreadyImported);
  return (
    <ul className="import-folder__summary" data-cy="satellite-flood-folder-summary">
      {tiles.first && tiles.last && (
        <li>
          {formatYearMonth(tiles.first)} to {formatYearMonth(tiles.last)}, {megabytes >= 1024 ? `${(megabytes / 1024).toFixed(1)} GB` : `${Math.round(megabytes)} MB`} to upload.
          Keep this page open until the last month is checked.
        </li>
      )}
      {alreadyImported > 0 && (
        <li data-cy="satellite-flood-folder-already-imported">
          {alreadyImported === 1 ? "1 month is" : `${alreadyImported} months are`} already imported and will be skipped
          {remaining > 0 ? ` (${remaining} left to check).` : "."}
        </li>
      )}
      {tiles.missing.length > 0 && (
        <li data-cy="satellite-flood-folder-missing">
          {tiles.missing.length === 1 ? "1 month has" : `${tiles.missing.length} months have`} no file: {someOf(tiles.missing.map((m) => formatYearMonth(m, "short")))}.
        </li>
      )}
      {tiles.duplicates.length > 0 && (
        <li data-cy="satellite-flood-folder-duplicates">
          Left out, as a second file for a month already chosen: {someOf(tiles.duplicates)}.
        </li>
      )}
      {tiles.unnamed.length > 0 && (
        <li>Their names don't say the month, so they will be refused: {someOf(tiles.unnamed)}.</li>
      )}
      {tiles.otherFiles > 0 && <li>{tiles.otherFiles === 1 ? "1 other file" : `${tiles.otherFiles} other files`} in the folder (not .mbtiles) left out.</li>}
    </ul>
  );
}

/** The months of a satellite flood batch: each file, its month, what happened to it, and a link to review or retry it. */
function SatelliteBatchList({ items, running, onRetryOne }: { items: BatchItem[]; running: boolean; onRetryOne: (index: number) => void }) {
  return (
    <div className="data-table__scroll">
      <table className="data-table" data-cy="satellite-flood-batch">
        <caption className="visually-hidden">The months being imported</caption>
        <thead>
          <tr>
            <th scope="col">File</th>
            <th scope="col">Month</th>
            <th scope="col">Result</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const month = item.run?.options.yearMonth ?? item.yearMonth;
            return (
              <tr key={item.fileName} data-cy="satellite-flood-batch-row" data-state={item.state}>
                <td className="mono">{item.fileName}</td>
                <td>{month ? formatYearMonth(month) : <span className="muted">Not known yet</span>}</td>
                <td>{BATCH_LABELS[item.state]}</td>
                <td>
                  <div className="batch-row__details">
                    {item.error && <span className="field__error">{item.error}</span>}
                    {item.run && (
                      <Link to={`/admin/imports/${item.run.id}`} target="_blank" rel="noreferrer">
                        Review
                      </Link>
                    )}
                    {!running && (item.state === "failed" || item.state === "waiting") && (
                      <Button variant="secondary" size="sm" icon={<Icon name="refresh" size={14} />} onClick={() => onRetryOne(index)} data-cy="satellite-flood-retry-one">
                        Retry
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
