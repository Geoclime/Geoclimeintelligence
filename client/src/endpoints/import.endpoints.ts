import { httpClient } from "../transport/http";
import type { BBox } from "../types/admin-unit.types";
import type { ApiResponse } from "../types/api.types";
import type {
  ImportFileOptions,
  ImportPreview,
  ImportRowParams,
  ImportRun,
  ImportRunDetail,
  PreviewImportInput,
  StagingFeatureCollection,
  StartImportInput,
  TemplateFormat,
} from "../types/import.types";

// server/src/modules/data-sources/imports/import.routes.ts. Administrators only.

/** Uploads travel as multipart/form-data; axios sets the boundary header itself for FormData. */
function uploadForm(input: ImportFileOptions & Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    if (value instanceof File) form.append(key, value, value.name);
    else form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return form;
}

export async function previewImportFile(input: PreviewImportInput): Promise<ApiResponse<ImportPreview>> {
  const { data } = await httpClient.post<ApiResponse<ImportPreview>>("/api/v1/imports/preview", uploadForm({ ...input }));
  return data;
}

/** Creates a run: the server stages and checks every row. Nothing goes live until promote. */
export async function startImport(input: StartImportInput): Promise<ApiResponse<ImportRun>> {
  const { data } = await httpClient.post<ApiResponse<ImportRun>>("/api/v1/imports", uploadForm({ ...input }));
  return data;
}

export async function fetchImportRuns(params: { page: number; pageSize: number }): Promise<ApiResponse<ImportRun[]>> {
  const { data } = await httpClient.get<ApiResponse<ImportRun[]>>("/api/v1/imports", { params });
  return data;
}

export async function fetchImportRun(id: string, params: ImportRowParams): Promise<ApiResponse<ImportRunDetail>> {
  const { data } = await httpClient.get<ApiResponse<ImportRunDetail>>(`/api/v1/imports/${encodeURIComponent(id)}`, { params });
  return data;
}

/** Staged shapes for the review map. bbox required, like every map layer. */
export async function fetchImportRunGeoJson(id: string, bbox: BBox): Promise<ApiResponse<StagingFeatureCollection>> {
  const { data } = await httpClient.get<ApiResponse<StagingFeatureCollection>>(
    `/api/v1/imports/${encodeURIComponent(id)}/geojson`,
    { params: { bbox: bbox.join(",") } },
  );
  return data;
}

export async function promoteImportRun(id: string): Promise<ApiResponse<ImportRun>> {
  const { data } = await httpClient.post<ApiResponse<ImportRun>>(`/api/v1/imports/${encodeURIComponent(id)}/promote`);
  return data;
}

/**
 * The blank template for a country and level. The one endpoint that returns a file instead of
 * the JSON envelope; the file name comes from the server's Content-Disposition header.
 */
export async function downloadAdminUnitTemplate(
  country: string,
  level: number,
  format: TemplateFormat,
): Promise<{ blob: Blob; fileName: string }> {
  const response = await httpClient.get<Blob>("/api/v1/imports/templates/admin-units", {
    params: { country, level, format },
    responseType: "blob",
  });
  const disposition = String(response.headers["content-disposition"] ?? "");
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `admin-units-template_${country}_level-${level}.${format}`;
  return { blob: response.data, fileName };
}
