import { unzipSync } from "fflate";
import { z } from "zod";
import { ValidationError } from "../../common/errors/app-error";
import { MAX_UNZIPPED_BYTES } from "../data-sources/imports/readers/reader-limits";
import type { NewLayerSource } from "./map-layer-loader.types";

/**
 * The data team's delivery is a zip with one provenance.json beside the layer files. It says,
 * for every file, where the data came from, its licence and when it was downloaded. The loader
 * records exactly that as a data source and refuses a file the provenance doesn't cover, so
 * nothing reaches the map unsourced (backend standard section 13, rule 3).
 */
const provenanceEntrySchema = z.object({
  file: z.string(),
  layer: z.string(),
  source: z.string().trim().min(1),
  source_url: z.string().trim(),
  resource: z.string().optional().default(""),
  licence: z.string().trim(),
  download_date_utc: z.string().trim(),
  source_last_modified: z.string().optional().default(""),
});
export type ProvenanceEntry = z.infer<typeof provenanceEntrySchema>;

export const PROVENANCE_FILE = "provenance.json";

/** The layer names the provenance file uses for the files the loader reads. */
export const ZIP_LAYERS = ["roads", "waterways", "waterway_polygons"] as const;
export type ZipLayer = (typeof ZIP_LAYERS)[number];

export interface LayerZip {
  entries: ProvenanceEntry[];
  /** The bytes of one file in the zip, by the name the provenance gives it. */
  read(fileName: string): Buffer;
}

export function openLayerZip(buffer: Buffer): LayerZip {
  let unpacked: Record<string, Uint8Array>;
  try {
    let claimed = 0;
    unpacked = unzipSync(buffer, {
      filter: (entry) => {
        const keep = baseName(entry.name) === PROVENANCE_FILE || baseName(entry.name).toLowerCase().endsWith(".geojson");
        if (keep) {
          claimed += entry.originalSize;
          // Guards against a zip bomb: stop before unpacking, whatever sizes the zip claims.
          if (claimed > MAX_UNZIPPED_BYTES) throw new Error("too large");
        }
        return keep;
      },
    });
  } catch {
    throw new ValidationError([
      { field: "zip", message: `The zip could not be opened, or unpacks to more than ${MAX_UNZIPPED_BYTES / (1024 * 1024)} MB. Re-create it and try again.` },
    ]);
  }

  const files = new Map<string, Buffer>();
  for (const [name, bytes] of Object.entries(unpacked)) files.set(baseName(name), Buffer.from(bytes));

  const provenance = files.get(PROVENANCE_FILE);
  if (!provenance) {
    throw new ValidationError([{ field: "zip", message: `The zip has no ${PROVENANCE_FILE}, so nothing in it can be traced to a source.` }]);
  }
  return {
    entries: parseProvenance(provenance.toString("utf8")),
    read(fileName) {
      const file = files.get(baseName(fileName));
      if (!file) throw new ValidationError([{ field: "zip", message: `The zip has no ${fileName}, which provenance.json lists.` }]);
      return file;
    },
  };
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function parseProvenance(json: string): ProvenanceEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ValidationError([{ field: PROVENANCE_FILE, message: `${PROVENANCE_FILE} is not valid JSON.` }]);
  }
  const parsed = z.array(provenanceEntrySchema).safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError([
      { field: PROVENANCE_FILE, message: `${PROVENANCE_FILE} isn't in the expected shape: ${parsed.error.issues[0]?.message ?? "unreadable"}.` },
    ]);
  }
  return parsed.data;
}

export function findEntry(entries: ProvenanceEntry[], layer: ZipLayer): ProvenanceEntry {
  const entry = entries.find((candidate) => candidate.layer === layer);
  if (!entry) {
    throw new ValidationError([{ field: PROVENANCE_FILE, message: `${PROVENANCE_FILE} has no entry for the "${layer}" layer, so it has no recorded source.` }]);
  }
  return entry;
}

const HDX_SOURCE = /^HDX dataset '(.+)' \((.+)\)$/;

/**
 * The data source to record for a provenance entry. "HDX dataset 'Roads of Nigeria'
 * (OpenStreetMap contributors)" becomes provider "OpenStreetMap contributors via HDX" and
 * dataset "Roads of Nigeria (HDX)"; any other wording is kept whole. The licence and download
 * date are taken as written, and a missing one stops the load: nothing is guessed.
 */
export function sourceFromEntry(entry: ProvenanceEntry, clippedWith: ProvenanceEntry | null): NewLayerSource {
  const hdx = HDX_SOURCE.exec(entry.source);
  const source: NewLayerSource = {
    provider: hdx ? `${hdx[2]} via HDX` : entry.source,
    datasetName: hdx ? `${hdx[1]} (HDX)` : entry.source,
    url: entry.source_url,
    license: entry.licence,
    downloadedOn: entry.download_date_utc,
    notes: sourceNotes(entry, clippedWith),
  };

  const problems: string[] = [];
  if (!/^https?:\/\//i.test(source.url)) problems.push("a source URL starting with http(s)://");
  if (!source.license) problems.push("a licence");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.downloadedOn)) problems.push("a download date as YYYY-MM-DD");
  if (source.provider.length > 200 || source.datasetName.length > 300 || source.license.length > 200) {
    problems.push("a shorter source or licence text (200 characters for provider and licence, 300 for the dataset name)");
  }
  if (problems.length > 0) {
    throw new ValidationError([{ field: PROVENANCE_FILE, message: `The entry for ${entry.file} needs ${problems.join(", ")}.` }]);
  }
  return source;
}

/** Identical for files of the same dataset, so a dataset's lines and areas share one source row. */
function sourceNotes(entry: ProvenanceEntry, clippedWith: ProvenanceEntry | null): string | null {
  const parts = [
    entry.resource ? `Resource: ${entry.resource}.` : null,
    entry.source_last_modified ? `Source last updated: ${entry.source_last_modified}.` : null,
    clippedWith ? `Clipped to Rivers State with ${clippedWith.source} (${clippedWith.licence}).` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" ") : null;
}
