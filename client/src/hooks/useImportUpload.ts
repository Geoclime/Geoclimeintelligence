import { useCallback } from "react";
import { previewImportFile, startImport } from "../endpoints/import.endpoints";
import type { ImportPreview, ImportRun, PreviewImportInput, StartImportInput } from "../types/import.types";

/**
 * The two upload steps of the import screen. Both reject with an ApiError so the form can show the
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

  return { preview, start };
}
