import { z } from "zod";
import { latitudeSchema, longitudeSchema } from "../../common/geo/geo";

export const publicSearchSchema = z.object({
  query: z.object({
    q: z.string().trim().min(2, "Type at least 2 characters").max(60, "Keep the search under 60 characters"),
  }),
});
export type PublicSearchQuery = z.infer<typeof publicSearchSchema>["query"];

export const publicAreaSchema = z.object({
  params: z.object({ id: z.uuid("Not a valid area id") }),
});

export const publicLocateSchema = z.object({
  query: z.object({ lon: longitudeSchema, lat: latitudeSchema }),
});
export type PublicLocateQuery = z.infer<typeof publicLocateSchema>["query"];
