import { useEffect, useState } from "react";
import { fetchFloodImpact } from "../endpoints/field-survey.endpoints";
import { errorMessage } from "../transport/api-error";
import type { FloodImpact } from "../types/field-survey.types";

/**
 * What a recorded flood reaches: its buildings, roads, facilities, settlements, wards and the drains
 * near it. A flood just saved brings its impact with it (`initial`), so nothing is asked twice.
 */
export function useFloodImpact(id: string, initial?: FloodImpact) {
  const [impact, setImpact] = useState<FloodImpact | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let current = true;
    fetchFloodImpact(id).then(
      (response) => current && setImpact(response.data),
      (failure: unknown) => current && setError(errorMessage(failure)),
    );
    return () => {
      current = false;
    };
    // `initial` only decides whether to ask; it never changes for a given popup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return { impact, loading: impact === null && error === null, error };
}
