import { useCallback, useRef, useState } from "react";
import { locatePoint } from "../endpoints/admin-unit.endpoints";
import { toApiError } from "../transport/api-error";
import type { LocateResult, LonLat } from "../types/admin-unit.types";

interface LocateState {
  point: LonLat | null;
  result: LocateResult | null;
  loading: boolean;
  error: string | null;
}

const IDLE: LocateState = { point: null, result: null, loading: false, error: null };

/**
 * "Which state, LGA and ward is this point in?" -- asked of the server, which runs the
 * point-in-polygon test in PostGIS. Used by map clicks and the "Where am I?" button. A point
 * outside every mapped area is a normal answer here, not an error screen.
 */
export function useLocatePoint() {
  const [state, setState] = useState<LocateState>(IDLE);
  const requestId = useRef(0);

  /** Resolves with the result too (null on failure), so a caller can act on it directly. */
  const locate = useCallback(async (point: LonLat): Promise<LocateResult | null> => {
    const thisRequest = ++requestId.current;
    setState({ point, result: null, loading: true, error: null });
    try {
      const response = await locatePoint(point[0], point[1]);
      if (thisRequest === requestId.current) setState({ point, result: response.data, loading: false, error: null });
      return response.data;
    } catch (error) {
      if (thisRequest !== requestId.current) return null;
      const apiError = toApiError(error);
      setState({
        point,
        result: null,
        loading: false,
        error: apiError.status === 404 ? "This spot is outside every mapped area." : apiError.message,
      });
      return null;
    }
  }, []);

  const clear = useCallback(() => {
    requestId.current++;
    setState(IDLE);
  }, []);

  return { ...state, locate, clear };
}
