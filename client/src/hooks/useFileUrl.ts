import { useEffect, useState } from "react";

/**
 * A file fetched through the API (it needs the sign-in token, which an <img> can't send) as a local URL
 * for <img>, released when the component goes away. It is fetched again only when `key` changes, so
 * `load` may be a new function on every render.
 */
export function useFileUrl(key: string, load: () => Promise<Blob>) {
  const [result, setResult] = useState<{ key: string; url: string | null; failed: boolean } | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    load().then(
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
    // `key` stands in for `load`, which is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = result?.key === key ? result : null;
  return { url: current?.url ?? null, loading: current === null, failed: current?.failed ?? false };
}
