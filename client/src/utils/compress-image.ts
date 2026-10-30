/** Photos are scaled down to this many pixels on their longest side before upload. */
const MAX_SIDE = 1600;
const QUALITY = 0.8;

/**
 * Shrinks a phone photo (often 4–8 MB) to a JPEG of a few hundred KB before it is uploaded, so a
 * report sends quickly on a slow connection and fits the server's 2 MB limit. Drawing to a canvas
 * also drops the photo's embedded metadata, including any GPS tag. Falls back to the original
 * file if the browser can't decode it.
 */
export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    return blob ?? file;
  } catch {
    return file;
  }
}
