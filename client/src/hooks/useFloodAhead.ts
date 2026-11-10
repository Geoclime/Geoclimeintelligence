import { useContext } from "react";
import { FloodAheadContext, type FloodAheadContextValue } from "../contexts/FloodAheadContext";

export function useFloodAhead(): FloodAheadContextValue {
  const context = useContext(FloodAheadContext);
  if (!context) throw new Error("useFloodAhead must be used inside <FloodAheadProvider>");
  return context;
}
