/** Mirrors server/src/modules/photos/photo.types.ts. */
export type PhotoSubjectType = "flood" | "drain" | "inspection" | "place";

export interface PhotoSubject {
  type: PhotoSubjectType;
  id: string;
}

export interface Photo {
  id: string;
  subjectType: PhotoSubjectType;
  subjectId: string;
  caption: string | null;
  takenAt: string;
  /** How far from what it shows the phone was, in metres, if it shared where it was. */
  distanceM: number | null;
  uploadedBy: string | null;
  uploaderName: string | null;
  byteSize: number;
  mimeType: string;
}

export interface PhotoLimits {
  maxPerSubject: number;
  maxBytes: number;
  cloud: boolean;
}

/** A photo chosen in a form, shrunk and ready to send, with what the phone knew when it was picked. */
export interface PendingPhoto {
  blob: Blob;
  caption: string;
  takenAt: string;
  at: { longitude: number; latitude: number; accuracyM?: number } | null;
}
