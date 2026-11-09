import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * Which tab of a page is open, kept in the URL as ?tab=<id>, so a refresh, the back button or a shared
 * link opens the same tab. A missing or unknown value opens the first. Other parameters are left alone.
 * `ids` is every tab's id, in order.
 */
export function useTabParam(ids: readonly string[]): [active: string, select: (id: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const active = ids.find((id) => id === requested) ?? ids[0] ?? "";

  const select = useCallback(
    (id: string) =>
      setSearchParams(
        (params) => {
          params.set("tab", id);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  return [active, select];
}
