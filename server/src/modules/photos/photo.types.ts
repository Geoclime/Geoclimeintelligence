import type { StoredResourceType } from "../../common/storage/media-storage";

/** What a photo can belong to (one, exactly: migration CreateMapPhotos). */
export const PHOTO_SUBJECT_TYPES = ["flood", "drain", "inspection", "place"] as const;
export type PhotoSubjectType = (typeof PHOTO_SUBJECT_TYPES)[number];

export interface PhotoSubject {
  type: PhotoSubjectType;
  id: string;
}

/** The subject as the service needs it before adding a photo: where it is, and (for a place) whether it was saved by hand. */
export interface PhotoSubjectInfo {
  lgaId: string | null;
  wardId: string | null;
  /** For a place: only those saved by hand take photos in this version. Null for everything else. */
  origin: "import" | "manual" | null;
  /** How many photos it already has. */
  photoCount: number;
  /** A short name for the activity log: "Aba Road drain", "flood of 3.2 ha"... */
  title: string;
}

/** One photo as a signed-in staff member sees it. The file itself is fetched from GET /photos/:id/file. */
export interface PhotoDto {
  id: string;
  subjectType: PhotoSubjectType;
  subjectId: string;
  caption: string | null;
  takenAt: string;
  /** How far from the thing it shows the phone was, in metres, if it shared where it was. */
  distanceM: number | null;
  uploadedBy: string | null;
  uploaderName: string | null;
  byteSize: number;
  mimeType: string;
}

export type StoredPhotoFile =
  | { storage: "database"; data: Buffer }
  | { storage: "cloudinary"; publicId: string; resourceType: StoredResourceType; format: string | null; version: number };

export interface NewPhoto {
  subject: PhotoSubject;
  file: StoredPhotoFile;
  mimeType: string;
  byteSize: number;
  caption: string | null;
  takenAt: string | null;
  point: [number, number] | null;
  accuracyM: number | null;
  uploadedBy: string;
  uploaderName: string | null;
}

/** A stored photo with where its file is: for serving it and for deleting it. */
export interface PhotoRecord extends PhotoDto {
  file: StoredPhotoFile | { storage: "cloudinary"; publicId: string; resourceType: StoredResourceType; format: string | null; version: number };
  lgaId: string | null;
  wardId: string | null;
}

export interface IPhotoRepository {
  subjectInfo(subject: PhotoSubject): Promise<PhotoSubjectInfo | null>;
  insert(photo: NewPhoto): Promise<PhotoDto>;
  listFor(subject: PhotoSubject): Promise<PhotoDto[]>;
  findById(id: string): Promise<PhotoRecord | null>;
  delete(id: string): Promise<boolean>;
  /**
   * The Cloudinary files of every photo on a subject, before it is deleted (its rows go with it). For a
   * drain this includes its inspections' photos.
   */
  cloudFilesFor(subject: { floodExtentId?: string; drainId?: string; facilityId?: string }): Promise<{ publicId: string; resourceType: StoredResourceType }[]>;
}
