import type { StoredResourceType } from "../../common/storage/media-storage";
import type { MediaKind } from "./flood-report.types";

const MB = 1024 * 1024;

/**
 * Limits per report. Photos are shrunk in the browser first. Videos and documents need Cloudinary
 * (`cloudOnly`); without it, photos and voice notes are kept in the database at the smaller
 * `databaseMaxBytes`, so the database never holds anything large.
 */
export const MEDIA_LIMITS: Record<MediaKind, { maxCount: number; maxBytes: number; databaseMaxBytes: number | null; maxSeconds?: number; field: string; label: string }> = {
  photo: { maxCount: 3, maxBytes: 8 * MB, databaseMaxBytes: 2 * MB, field: "photos", label: "photo (JPEG, PNG or WebP)" },
  audio: { maxCount: 1, maxBytes: 10 * MB, databaseMaxBytes: 3 * MB, maxSeconds: 60, field: "audio", label: "voice note" },
  video: { maxCount: 1, maxBytes: 50 * MB, databaseMaxBytes: null, maxSeconds: 60, field: "video", label: "video (MP4, MOV or WebM)" },
  file: { maxCount: 2, maxBytes: 10 * MB, databaseMaxBytes: null, field: "files", label: "document (PDF)" },
};

/** The largest single file any kind accepts: multer's own limit. */
export const MAX_UPLOAD_BYTES = Math.max(...Object.values(MEDIA_LIMITS).map((limit) => limit.maxBytes));

/** How Cloudinary groups each kind: it handles audio as "video" and documents as "raw". */
export const CLOUDINARY_RESOURCE_TYPE: Record<MediaKind, StoredResourceType> = { photo: "image", audio: "video", video: "video", file: "raw" };

const ascii = (b: Buffer, from: number, to: number) => b.toString("ascii", from, to);
const isWebm = (b: Buffer) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
const isIsoMedia = (b: Buffer) => ascii(b, 4, 8) === "ftyp";

/**
 * Each accepted type with the bytes its files start with. The declared type is not trusted on its
 * own: a file is accepted only if its first bytes match, so nothing else is stored and served back
 * under an image, audio, video or PDF type.
 */
const SIGNATURES: Record<MediaKind, { mime: string; matches: (b: Buffer) => boolean }[]> = {
  photo: [
    { mime: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { mime: "image/png", matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { mime: "image/webp", matches: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
  ],
  audio: [
    { mime: "audio/webm", matches: isWebm },
    { mime: "audio/ogg", matches: (b) => ascii(b, 0, 4) === "OggS" },
    { mime: "audio/mp4", matches: isIsoMedia },
    { mime: "audio/mpeg", matches: (b) => ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) },
  ],
  video: [
    { mime: "video/quicktime", matches: (b) => isIsoMedia(b) && ascii(b, 8, 10) === "qt" },
    { mime: "video/mp4", matches: isIsoMedia },
    { mime: "video/webm", matches: isWebm },
  ],
  file: [{ mime: "application/pdf", matches: (b) => ascii(b, 0, 5) === "%PDF-" }],
};

/** The type a file really is, by its first bytes, if it is one this kind accepts; otherwise null. */
export function sniffMedia(kind: MediaKind, data: Buffer): string | null {
  if (data.length < 12) return null;
  return SIGNATURES[kind].find((signature) => signature.matches(data))?.mime ?? null;
}
