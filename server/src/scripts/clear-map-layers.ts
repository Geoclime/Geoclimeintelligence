/**
 * ADMINISTRATOR-ONLY script: removes a country's map layers, the reverse of layers:load. Use it
 * to reload a layer from scratch, or before deleting a country (the roads, waterways,
 * infrastructure and buildings foreign keys refuse the delete while any remain).
 *
 * Needs direct database credentials (DATABASE_URL), which is what restricts it to administrators.
 * Exempt from region checks under AI rule 9 for that reason. One transaction: all or nothing.
 * Data source records are kept.
 *
 * Usage (from server/):
 *   npm run layers:clear -- --country NGA --dry-run
 *   npm run layers:clear -- --country NGA --yes
 *   npm run layers:clear -- --country NGA --layers waterways --yes
 *
 * --country   country code (required: there is no default for a delete)
 * --layers    comma-separated, from: roads, waterways, settlements, infrastructure, buildings. Default: all of them
 * --dry-run   delete, count, then roll back: shows what would go and keeps everything
 * --yes       required for a real run, so a mistyped command can't delete by accident
 */
import "reflect-metadata";
import { parseArgs } from "node:util";
import { z } from "zod";
import { AppError } from "../common/errors/app-error";
import { AppDataSource } from "../config/data-source";
import { CLEARABLE_LAYERS, MapLayerLoaderService } from "../modules/map-layers/map-layer-loader.service";

const argsSchema = z
  .object({
    country: z.string({ error: "--country is required, e.g. --country NGA" }).length(3, "--country must be a 3-letter code, e.g. NGA"),
    layers: z
      .string()
      .default(CLEARABLE_LAYERS.join(","))
      .transform((raw) => raw.split(",").map((layer) => layer.trim().toLowerCase()).filter(Boolean))
      .pipe(z.array(z.enum(CLEARABLE_LAYERS, `--layers takes ${CLEARABLE_LAYERS.join(", ")}, comma-separated`)).min(1)),
    "dry-run": z.boolean().default(false),
    yes: z.boolean().default(false),
  })
  .refine((args) => args["dry-run"] || args.yes, {
    message: "This deletes data. Add --dry-run to see what would go, or --yes to delete it.",
  });

async function main() {
  const { values } = parseArgs({
    options: {
      country: { type: "string" },
      layers: { type: "string" },
      "dry-run": { type: "boolean" },
      yes: { type: "boolean" },
    },
  });
  const args = argsSchema.parse(values);

  await AppDataSource.initialize();
  try {
    const report = await MapLayerLoaderService.Instance.clear({
      countryCode: args.country.toUpperCase(),
      layers: args.layers,
      dryRun: args["dry-run"],
    });
    for (const [layer, count] of Object.entries(report.deleted)) {
      console.log(`${layer.toUpperCase().padEnd(10)} ${report.dryRun ? "would delete" : "deleted"} ${count.toLocaleString("en")}`);
    }
    console.log(report.dryRun ? "\nDry run: everything was rolled back, nothing was deleted." : "\nDone.");
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  if (err instanceof z.ZodError) {
    console.error(err.issues.map((issue) => issue.message).join("\n"));
  } else if (err instanceof AppError) {
    console.error(err.message);
    for (const detail of err.errors ?? []) console.error(`  ${detail.field ? `${detail.field}: ` : ""}${detail.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
