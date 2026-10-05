import { z } from "zod";
import { offsetPageQuerySchema } from "../../common/pagination/pagination";

export const listDataSourcesSchema = z.object({
  query: offsetPageQuerySchema,
});
export type ListDataSourcesQuery = z.infer<typeof listDataSourcesSchema>["query"];

const text = (field: string, max: number) =>
  z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`).max(max);

export const createDataSourceSchema = z.object({
  body: z
    .object({
      provider: text("Provider", 200),
      datasetName: text("Dataset name", 300),
      url: z.url({ protocol: /^https?$/, error: "Enter the provider's web address, starting with http:// or https://" }),
      license: text("Licence", 200),
      downloadedOn: z.iso.date("Enter the download date as YYYY-MM-DD"),
      notes: z.string().trim().max(2000).nullish().transform((value) => value || null),
    })
    .strict()
    // A download date in the future can only be a typo.
    .refine((body) => body.downloadedOn <= new Date().toISOString().slice(0, 10), {
      path: ["downloadedOn"],
      message: "The download date can't be in the future",
    }),
});
export type CreateDataSourceBody = z.infer<typeof createDataSourceSchema>["body"];
