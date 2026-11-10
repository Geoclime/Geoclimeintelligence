import { z } from "zod";
import { WARN_RADIUS_M } from "./flood-ahead.rules";

/** What a browser sends over the live connection with its position. Anything else is refused. */
export const floodAheadUpdateSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    radiusM: z.number().min(WARN_RADIUS_M.min).max(WARN_RADIUS_M.max),
    accuracy: z.number().min(0).max(1_000_000).optional(),
  })
  .strict();
