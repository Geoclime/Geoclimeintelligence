import { useCallback } from "react";
import { CACHE_KEYS, invalidateCached } from "../cache/localCache";
import { previewImportFile, startImport, startRainfallImport } from "../endpoints/import.endpoints";
import { clearMapLayers, uploadMapLayer } from "../endpoints/map-layer.endpoints";
import type { ImportPreview, ImportRun, PreviewImportInput, StartImportInput, StartRainfallImportInput } from "../types/import.types";
import type { ClearMapLayerInput, MapLayerClearReport, MapLayerLoadReport, UploadMapLayerInput } from "../types/map-layer.types";

/**
 * The upload steps of the import screen. All reject with an ApiError so the form can show the
 * server's field errors ("file", "sheetName", "columnMapping.unit_name"...). Submitting state lives
 * in the form.
 */
export function useImportUpload() {
  /** Reads the file's headings and suggests a column mapping. Stores nothing. */
  const preview = useCallback(async (input: PreviewImportInput): Promise<ImportPreview> => {
    const response = await previewImportFile(input);
    if (!response.data) throw new Error(response.message || "The server couldn't read the file.");
    return response.data;
  }, []);

  /** Creates a run: every row is staged and checked; nothing goes live until it's promoted. */
  const start = useCallback(async (input: StartImportInput): Promise<ImportRun> => {
    const response = await startImport(input);
    if (!response.data) throw new Error(response.message || "The server returned no import run.");
    return response.data;
  }, []);

  /** Creates a rainfall run: staged and checked like start(), live only once promoted. */
  const startRainfall = useCallback(async (input: StartRainfallImportInput): Promise<ImportRun> => {
    const response = await startRainfallImport(input);
    if (!response.data) throw new Error(response.message || "The server returned no import run.");
    return response.data;
  }, []);

  /** Uploads a map-layer file (roads, waterways, settlements or delivery zip) straight into PostGIS. */
  const uploadLayer = useCallback(async (input: UploadMapLayerInput): Promise<MapLayerLoadReport> => {
    const response = await uploadMapLayer(input);
    if (!response.data) throw new Error(response.message || "The server returned no load report.");
    invalidateCached(CACHE_KEYS.mapLayers);
    invalidateCached(CACHE_KEYS.public);
    return response.data;
  }, []);

  /** Clears a country's map layer(s) so they can be re-imported from scratch. */
  const clearLayer = useCallback(async (input: ClearMapLayerInput): Promise<MapLayerClearReport> => {
    const response = await clearMapLayers(input);
    if (!response.data) throw new Error(response.message || "The server returned no clear report.");
    invalidateCached(CACHE_KEYS.mapLayers);
    invalidateCached(CACHE_KEYS.public);
    return response.data;
  }, []);

  return { preview, start, startRainfall, uploadLayer, clearLayer };
}
