import type { StoredResourceType } from "../../common/storage/media-storage";

/** A photo of a home as its owner, or staff with households.view, sees it. The file is fetched from `/households/:id/photos/:photoId/file`. */
export interface HouseholdPhotoDto {
  id: string;
  householdId: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

export type StoredHouseholdFile =
  | { storage: "database"; data: Buffer }
  | { storage: "cloudinary"; publicId: string; resourceType: StoredResourceType; format: string | null; version: number };

export interface HouseholdPhotoRecord extends HouseholdPhotoDto {
  file: StoredHouseholdFile;
}

export interface IHouseholdPhotoRepository {
  count(householdId: string): Promise<number>;
  insert(householdId: string, file: StoredHouseholdFile, mimeType: string, byteSize: number): Promise<HouseholdPhotoDto>;
  list(householdId: string): Promise<HouseholdPhotoDto[]>;
  findById(id: string): Promise<HouseholdPhotoRecord | null>;
  delete(id: string): Promise<boolean>;
  /** The Cloudinary files of every photo of a household, before it is deleted (its rows go with it). */
  cloudFilesOf(householdId: string): Promise<{ publicId: string; resourceType: StoredResourceType }[]>;
}
