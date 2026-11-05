import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { env } from "../../config/env";

/**
 * Every upload goes under one folder per environment ("geoclime/production",
 * "geoclime/development"), so one Cloudinary account can serve all of them without mixing files.
 */
const ROOT_FOLDER = `geoclime/${env.NODE_ENV}`;

/** What a stored file is, as Cloudinary groups them: audio counts as "video", documents as "raw". */
export type StoredResourceType = "image" | "video" | "raw";

export interface StoredMedia {
  publicId: string;
  resourceType: StoredResourceType;
  /** File extension Cloudinary recorded (jpg, webm, pdf...); null for raw files, whose id includes it. */
  format: string | null;
  version: number;
  byteSize: number;
  /** Seconds, for audio and video. */
  duration: number | null;
}

export interface UploadInput {
  data: Buffer;
  resourceType: StoredResourceType;
  /** Folder under the environment's root folder, e.g. "flood-reports/2026-10". */
  folder: string;
}

/** Where report media lives. Services depend on this, so tests use an in-memory fake. */
export interface IMediaStorage {
  /** False when no Cloudinary account is configured. */
  readonly enabled: boolean;
  upload(input: UploadInput): Promise<StoredMedia>;
  /** A signed link to the file. Only ever handed to someone allowed to see it. */
  deliveryUrl(media: Pick<StoredMedia, "publicId" | "resourceType" | "format" | "version">): string;
  remove(media: Pick<StoredMedia, "publicId" | "resourceType">): Promise<void>;
}

/**
 * Cloudinary, with every file uploaded as an AUTHENTICATED asset: it can't be fetched by guessing
 * its address, only through a signed link this server generates. Reports start private (pending
 * review), so their photos and recordings must be too.
 */
export class CloudinaryMediaStorage implements IMediaStorage {
  private static _instance?: CloudinaryMediaStorage;
  static get Instance(): CloudinaryMediaStorage {
    return (this._instance ??= new CloudinaryMediaStorage());
  }

  readonly enabled = env.CLOUDINARY_URL !== null;

  constructor() {
    if (env.CLOUDINARY_URL) {
      cloudinary.config({
        cloud_name: env.CLOUDINARY_URL.cloudName,
        api_key: env.CLOUDINARY_URL.apiKey,
        api_secret: env.CLOUDINARY_URL.apiSecret,
        secure: true,
      });
    }
  }

  upload({ data, resourceType, folder }: UploadInput): Promise<StoredMedia> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: resourceType, type: "authenticated", folder: `${ROOT_FOLDER}/${folder}`, use_filename: false, unique_filename: true, overwrite: false },
        (error, result?: UploadApiResponse) => {
          if (error || !result) return reject(error ?? new Error("Cloudinary returned no result"));
          resolve({
            publicId: result.public_id,
            resourceType: result.resource_type as StoredResourceType,
            format: result.format ?? null,
            version: result.version,
            byteSize: result.bytes,
            duration: typeof result.duration === "number" ? result.duration : null,
          });
        },
      );
      stream.end(data);
    });
  }

  deliveryUrl({ publicId, resourceType, format, version }: Pick<StoredMedia, "publicId" | "resourceType" | "format" | "version">): string {
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      type: "authenticated",
      sign_url: true,
      secure: true,
      version,
      ...(format && resourceType !== "raw" ? { format } : {}),
    });
  }

  async remove({ publicId, resourceType }: Pick<StoredMedia, "publicId" | "resourceType">): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: "authenticated", invalidate: true });
  }
}
