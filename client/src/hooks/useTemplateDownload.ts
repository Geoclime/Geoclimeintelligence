import { useCallback, useState } from "react";
import { downloadAdminUnitTemplate } from "../endpoints/import.endpoints";
import { errorMessage } from "../transport/api-error";
import type { TemplateFormat } from "../types/import.types";
import { saveBlob } from "../utils/save-blob";

/** Downloads the blank import template for a country and level, as Excel or sample GeoJSON. */
export function useTemplateDownload() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async (country: string, level: number, format: TemplateFormat): Promise<boolean> => {
    setDownloading(true);
    setError(null);
    try {
      const { blob, fileName } = await downloadAdminUnitTemplate(country, level, format);
      saveBlob(blob, fileName);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setDownloading(false);
    }
  }, []);

  return { download, downloading, error };
}
