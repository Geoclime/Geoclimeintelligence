import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ChangeEvent } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import { ColumnMappingFields } from "../../../components/imports/ColumnMappingFields";
import { DataSourceDialog } from "../../../components/imports/DataSourceDialog";
import { FilePreviewTable } from "../../../components/imports/FilePreviewTable";
import {
  EMPTY_MAPPING,
  importFormSchema,
  mappingToForm,
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
import { useAdminUnits } from "../../../hooks/useAdminUnits";
import { useCountries } from "../../../hooks/useCountries";
import { useDataSources } from "../../../hooks/useDataSources";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useImportUpload } from "../../../hooks/useImportUpload";
import { useTemplateDownload } from "../../../hooks/useTemplateDownload";
import { useToast } from "../../../hooks/useToast";
import { errorMessage } from "../../../transport/api-error";
import type { ImportPreview, TemplateFormat } from "../../../types/import.types";
import { applySubmitError } from "../../../utils/form-errors";

const SERVER_FIELDS = [
  "countryCode", "level", "sourceId", "sheetName", "headerRow", "parentId",
  "columnMapping.unit_name", "columnMapping.unit_code", "columnMapping.parent_code", "columnMapping.geometry_wkt",
] as const;

/**
 * "Import data": choose the country, level and data source, download the matching template if
 * needed, upload the filled file (or a real file such as the lga_boundaries sheet), match its
 * columns, and check it. Nothing goes live here: checking creates a run to review and promote.
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
      columnMapping: EMPTY_MAPPING,
    },
  });
  const { register, control, setValue, setError, handleSubmit, formState } = methods;
  const [countryCode, levelText, parentMode, parentId, headerRow] = useWatch({
    control,
    name: ["countryCode", "level", "parentMode", "parentId", "headerRow"],
  });
  const level = Number(levelText) || 0;

  const { countries } = useCountries();
  const { sources, addSource } = useDataSources();
  const { preview, start } = useImportUpload();
  const template = useTemplateDownload();
  const country = countries.find((c) => c.countryCode === countryCode) ?? null;
  const levelName = country?.levels[level - 1]?.name ?? null;
  const parentLevelName = level > 1 ? (country?.levels[level - 2]?.name ?? null) : null;
  const parents = useAdminUnits({ countryCode, level: level - 1, pageSize: 100, enabled: Boolean(country) && level > 1 });

  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sourceDialog, setSourceDialog] = useState(0);

  const readFile = async (next: File, options: { sheetName?: string; headerRow?: number } = {}) => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const result = await preview({
        file: next,
        ...options,
        countryCode: countryCode || undefined,
        level: level || undefined,
        parentId: parentMode === "fixed" && parentId ? parentId : undefined,
      });
      setFilePreview(result);
      setValue("fileType", result.fileType);
      setValue("sheetName", result.sheetName ?? "");
      setValue("headerRow", result.headerRow ? String(result.headerRow) : "");
      setValue("columnMapping", mappingToForm(result.suggestedMapping));
    } catch (error) {
      setFilePreview(null);
      setPreviewError(errorMessage(error));
    } finally {
      setPreviewing(false);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setFilePreview(null);
    if (next) void readFile(next);
  };

  const downloadTemplate = async (format: TemplateFormat) => {
    if (await template.download(countryCode, level, format)) {
      showToast({ type: "success", message: "Template downloaded. Fill in the Areas sheet, then upload it below." });
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!file || !filePreview) {
      setError("root.server", { message: "Choose a file to upload first." });
      return;
    }
    try {
      const run = await start(toStartImport(values, file, filePreview.fileType));
      showToast({ type: "success", message: `Checked ${run.rowCount} rows: ${run.passedCount} passed, ${run.errorCount} failed.` });
      navigate(`/admin/imports/${run.id}`);
    } catch (error) {
      applySubmitError(error, setError, SERVER_FIELDS);
    }
  });

  const ready = Boolean(country && levelName);

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
            <p className="form-section__lead">The country, the level the areas belong to, and where the data comes from.</p>
            <div className="form-grid form-grid--2">
              <SelectField label="Country" error={formState.errors.countryCode?.message} data-cy="import-country" {...register("countryCode")}>
                <option value="">Choose…</option>
                {countries.map((c) => (
                  <option key={c.countryCode} value={c.countryCode}>
                    {c.countryName} ({c.countryCode})
                  </option>
                ))}
              </SelectField>
              <SelectField label="Level" error={formState.errors.level?.message} disabled={!country} data-cy="import-level" {...register("level")}>
                <option value="">Choose…</option>
                {country?.levels.map((l) => (
                  <option key={l.level} value={String(l.level)}>
                    {l.level}. {l.name} ({l.unitCount} live)
                  </option>
                ))}
              </SelectField>
            </div>
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
            <div className="template-actions section-gap">
              <span className="muted">Need a blank file?</span>
              <Button variant="ghost" size="sm" icon={<Icon name="download" size={16} />} disabled={!ready} loading={template.downloading} onClick={() => void downloadTemplate("xlsx")} data-cy="download-xlsx">
                Excel template
              </Button>
              <Button variant="ghost" size="sm" icon={<Icon name="download" size={16} />} disabled={!ready || template.downloading} onClick={() => void downloadTemplate("geojson")} data-cy="download-geojson">
                GeoJSON sample
              </Button>
            </div>
            {template.error && <p className="field__error">{template.error}</p>}
          </section>

          <section className="card card__body" aria-labelledby="step-2">
            <h2 id="step-2" className="import-step__title form-section__title">
              <span className="import-step__number">2</span>Upload the file
            </h2>
            <p className="form-section__lead">An Excel workbook (.xlsx) with shapes as WKT text, or a GeoJSON file. Up to 20 MB.</p>
            <label className="field">
              <span className="field__label">File</span>
              <input type="file" accept=".xlsx,.geojson,.json" className="field__input" onChange={onFileChange} data-cy="import-file" />
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
                  <span>{filePreview.fileType === "xlsx" ? "Excel workbook" : "GeoJSON"}</span>
                  {filePreview.headerRow && <span>Headings in row {filePreview.headerRow}</span>}
                </p>
                {filePreview.fileType === "xlsx" && (
                  <div className="form-grid form-grid--2">
                    <SelectField
                      label="Sheet"
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
                <FilePreviewTable preview={filePreview} />
              </div>
            )}
          </section>

          {filePreview && (
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
