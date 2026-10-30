import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { FloodReport, NewFloodReport, ReportListParams, ReportMediaOptions } from "../types/flood-report.types";

// server/src/modules/flood-reports/flood-report.routes.ts. Sending and "mine": any signed-in
// user. The review list and review: responders, officials and administrators, inside their region.

/** Sends a report as multipart form data: the fields, photos, a voice note, a video and documents. */
export async function submitFloodReport(report: NewFloodReport): Promise<ApiResponse<FloodReport>> {
  const form = new FormData();
  form.append("lon", String(report.point[0]));
  form.append("lat", String(report.point[1]));
  form.append("locationName", report.locationName);
  form.append("waterDepth", report.waterDepth);
  form.append("description", report.description);
  report.photos.forEach((photo, i) => form.append("photos", photo, `photo-${i + 1}.jpg`));
  if (report.audio) form.append("audio", report.audio, "voice-note");
  if (report.video) form.append("video", report.video, report.video.name);
  report.files.forEach((file) => form.append("files", file, file.name));
  // A slow phone connection can take a while to upload photos or a video.
  const { data } = await httpClient.post<ApiResponse<FloodReport>>("/api/v1/flood-reports", form, { timeout: 180_000 });
  return data;
}

/** Which media the report form may offer (videos and documents need Cloudinary), and their limits. */
export async function fetchReportMediaOptions(): Promise<ApiResponse<ReportMediaOptions>> {
  const { data } = await httpClient.get<ApiResponse<ReportMediaOptions>>("/api/v1/flood-reports/options");
  return data;
}

export async function fetchMyFloodReports(params: { page: number; pageSize: number }): Promise<ApiResponse<FloodReport[]>> {
  const { data } = await httpClient.get<ApiResponse<FloodReport[]>>("/api/v1/flood-reports/mine", { params });
  return data;
}

export async function fetchFloodReports(params: ReportListParams): Promise<ApiResponse<FloodReport[]>> {
  const { data } = await httpClient.get<ApiResponse<FloodReport[]>>("/api/v1/flood-reports", { params });
  return data;
}

export async function reviewFloodReport(id: string, decision: "publish" | "reject", note?: string): Promise<ApiResponse<FloodReport>> {
  const { data } = await httpClient.post<ApiResponse<FloodReport>>(`/api/v1/flood-reports/${encodeURIComponent(id)}/review`, {
    decision,
    ...(note ? { note } : {}),
  });
  return data;
}

/** A report's photo or voice note, as a file. It needs the sign-in token, so an <img src> can't fetch it directly. */
export async function fetchFloodReportMedia(reportId: string, mediaId: string): Promise<Blob> {
  const { data } = await httpClient.get<Blob>(
    `/api/v1/flood-reports/${encodeURIComponent(reportId)}/media/${encodeURIComponent(mediaId)}`,
    { responseType: "blob" },
  );
  return data;
}
