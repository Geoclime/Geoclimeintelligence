/**
 * ADMINISTRATOR-ONLY script: loads the data team's roads, waterways, settlement, infrastructure and
 * building files into the database so they show on the map. It exists because the Imports screen takes
 * boundary polygons under 20,000 rows, and these files are lines and points (47,507 road segments).
 *
 * Needs direct database credentials (DATABASE_URL), which is what restricts it to administrators.
 * Exempt from region checks under AI rule 9 for that reason. Safe to run twice: rows already
 * stored are left alone. Everything is one transaction, so a failure changes nothing.
 *
 * Usage (from server/):
 *   npm run layers:load -- --zip ../rivers_map_layers_2026-10-27.zip --dry-run
 *   npm run layers:load -- --zip ../rivers_map_layers_2026-10-27.zip
 *   npm run layers:load -- --settlements ../rivers_state_settlement_names.geojson --settlements-source <data-source-uuid>
 *   npm run layers:load -- --infrastructure ../osm-20261027T194914Z-1-001.zip --infrastructure-source <data-source-uuid>
 *   npm run layers:load -- --buildings ../osm-20261027T194914Z-1-001.zip --buildings-source <data-source-uuid>
 *
 * --zip                     the delivery zip (provenance.json + roads, waterways, waterway areas)
 * --settlements             the GRID3 settlement-names GeoJSON
 * --settlements-source      id of that file's data source (add it on Imports > Add a source first)
 * --infrastructure          Geofabrik's OpenStreetMap extract: the zip of .gpkg files, or one facility .gpkg
 * --infrastructure-source   id of that extract's data source (add it on Imports > Add a source first)
 * --buildings               the same extract (or one gis_osm_buildings_a_free_<n>.gpkg): its building outlines
 * --buildings-source        id of that extract's data source
 * --accept-partial          load a cut-short GeoPackage even when some of its rows are missing (they are reported)
 * --country              country code, default NGA
 * --ward-level           the admin level that holds wards, default 3
 * --dry-run              do everything, then roll back: shows the counts and keeps nothing
 */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { AppError } from "../common/errors/app-error";
import { AppDataSource } from "../config/data-source";
import { MapLayerLoaderService, type LayerReport } from "../modules/map-layers/map-layer-loader.service";

const argsSchema = z
  .object({
    zip: z.string().min(1).optional(),
    settlements: z.string().min(1).optional(),
    "settlements-source": z.uuid("--settlements-source must be a data source id (uuid)").optional(),
    infrastructure: z.string().min(1).optional(),
    "infrastructure-source": z.uuid("--infrastructure-source must be a data source id (uuid)").optional(),
    buildings: z.string().min(1).optional(),
    "buildings-source": z.uuid("--buildings-source must be a data source id (uuid)").optional(),
    "accept-partial": z.boolean().default(false),
    country: z.string().length(3).default("NGA"),
    "ward-level": z.coerce.number().int().min(1).max(6).default(3),
    "dry-run": z.boolean().default(false),
  })
  .refine((args) => args.zip || args.settlements || args.infrastructure || args.buildings, {
    message: "Give --zip, --settlements, --infrastructure, --buildings, or a combination",
  })
  .refine((args) => !args.settlements || args["settlements-source"], {
    message: "--settlements needs --settlements-source <data-source-uuid>: record the file's source first, so no point is unsourced",
  })
  .refine((args) => !args.infrastructure || args["infrastructure-source"], {
    message: "--infrastructure needs --infrastructure-source <data-source-uuid>: record the extract's source first, so no facility is unsourced",
  })
  .refine((args) => !args.buildings || args["buildings-source"], {
    message: "--buildings needs --buildings-source <data-source-uuid>: record the extract's source first, so no building is unsourced",
  });

function describe(layer: LayerReport): string {
  const lines = [
    `${layer.layer.toUpperCase()}  (${layer.file}, ${layer.featuresInFile.toLocaleString("en")} features)`,
    `  source:        ${layer.sourceId}${layer.sourceCreated ? " (recorded by this run)" : ""}`,
    `  added:         ${layer.inserted.toLocaleString("en")}`,
    `  already there: ${layer.alreadyPresent.toLocaleString("en")}`,
  ];
  for (const note of layer.notes) lines.splice(1, 0, `  note:          ${note}`);
  if (layer.layer === "settlements" || layer.layer === "infrastructure" || layer.layer === "buildings") {
    lines.push(`  linked later:  ${layer.relinked.toLocaleString("en")}`);
    lines.push(`  no ward found: ${layer.unlinked.toLocaleString("en")}`);
  }
  const rejected = Object.entries(layer.rejected);
  if (rejected.length === 0) {
    lines.push("  left out:      0");
  } else {
    lines.push("  left out:");
    for (const [reason, count] of rejected) lines.push(`    ${count.toLocaleString("en")} x ${reason}`);
  }
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({
    options: {
      zip: { type: "string" },
      settlements: { type: "string" },
      "settlements-source": { type: "string" },
      infrastructure: { type: "string" },
      "infrastructure-source": { type: "string" },
      buildings: { type: "string" },
      "buildings-source": { type: "string" },
      "accept-partial": { type: "boolean" },
      country: { type: "string" },
      "ward-level": { type: "string" },
      "dry-run": { type: "boolean" },
    },
  });
  const args = argsSchema.parse(values);

  const request = {
    countryCode: args.country.toUpperCase(),
    wardLevel: args["ward-level"],
    dryRun: args["dry-run"],
    zip: args.zip ? readFileSync(args.zip) : undefined,
    settlements: args.settlements
      ? {
          fileName: path.basename(args.settlements),
          buffer: readFileSync(args.settlements),
          sourceId: args["settlements-source"]!,
        }
      : undefined,
    infrastructure: args.infrastructure
      ? {
          fileName: path.basename(args.infrastructure),
          buffer: readFileSync(args.infrastructure),
          sourceId: args["infrastructure-source"]!,
        }
      : undefined,
    buildings: args.buildings
      ? { fileName: path.basename(args.buildings), buffer: readFileSync(args.buildings), sourceId: args["buildings-source"]! }
      : undefined,
    acceptPartial: args["accept-partial"],
  };

  await AppDataSource.initialize();
  try {
    const report = await MapLayerLoaderService.Instance.load(request);
    console.log(report.layers.map(describe).join("\n\n"));
    console.log(report.dryRun ? "\nDry run: everything was rolled back, nothing was saved." : "\nDone. Everything above is saved.");
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
