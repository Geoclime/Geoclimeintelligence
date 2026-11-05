import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { PendingPhoto, Photo, PhotoLimits, PhotoSubject } from "../types/photo.types";

// server/src/modules/photos/photo.routes.ts. Seeing photos needs photos.view, adding photos.add; deleting
// is for whoever added the photo or photos.delete_any. Photos are never on the public alert map.

export async function fetchPhotoLimits(): Promise<ApiResponse<PhotoLimits>> {
  const { data } = await httpClient.get<ApiResponse<PhotoLimits>>("/api/v1/photos/limits");
  return data;
}

export async function fetchPhotos(subject: PhotoSubject): Promise<ApiResponse<Photo[]>> {
  const { data } = await httpClient.get<ApiResponse<Photo[]>>("/api/v1/photos", { params: { subjectType: subject.type, subjectId: subject.id } });
  return data;
}

/** The photo itself, through the API (it needs the sign-in token), as a blob to show from memory. */
export async function fetchPhotoFile(id: string): Promise<Blob> {
  const { data } = await httpClient.get<Blob>(`/api/v1/photos/${encodeURIComponent(id)}/file`, { responseType: "blob" });
  return data;
}

/** Uploads one photo. A slow connection gets two minutes before it gives up. */
export async function uploadPhoto(subject: PhotoSubject, photo: PendingPhoto): Promise<ApiResponse<Photo>> {
  const form = new FormData();
  form.append("subjectType", subject.type);
  form.append("subjectId", subject.id);
  form.append("file", photo.blob, "photo.jpg");
  if (photo.caption.trim()) form.append("caption", photo.caption.trim());
  form.append("takenAt", photo.takenAt);
  if (photo.at) {
    form.append("longitude", String(photo.at.longitude));
    form.append("latitude", String(photo.at.latitude));
    if (photo.at.accuracyM !== undefined) form.append("accuracyM", String(Math.round(photo.at.accuracyM * 10) / 10));
  }
  const { data } = await httpClient.post<ApiResponse<Photo>>("/api/v1/photos", form, { timeout: 120_000 });
  return data;
}

export async function deletePhoto(id: string): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/photos/${encodeURIComponent(id)}`);
  return data;
}
