import { useEffect, useState } from "react";
import { fetchFloodReportMedia } from "../endpoints/flood-report.endpoints";

/**
 * A report's photo or voice note as a local URL for <img> or <audio>. The file needs the sign-in
 * token, so it is fetched through the API client and shown from memory; the URL is released when
 * the component goes away.
 */
export function useReportMedia(reportId: string, mediaId: string) {
  const [result, setResult] = useState<{ key: string; url: string | null; failed: boolean } | null>(null);
  const key = `${reportId}/${mediaId}`;

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetchFloodReportMedia(reportId, mediaId).then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setResult({ key, url, failed: false });
      },
      () => !cancelled && setResult({ key, url: null, failed: true }),
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [reportId, mediaId, key]);

  const current = result?.key === key ? result : null;
  return { url: current?.url ?? null, loading: current === null, failed: current?.failed ?? false };
}
