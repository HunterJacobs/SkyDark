/**
 * Shrink photos in the browser before uploading them to Home Assistant.
 *
 * Phone photos are often 4–12 MB; a wall display never needs more than about
 * 1920px, and smaller files keep uploads well under Home Assistant's
 * WebSocket message limit and make the slideshow load faster.
 */

export const MAX_UPLOAD_EDGE = 1920;
const JPEG_QUALITIES = [0.85, 0.72, 0.6];
/** Home Assistant's WebSocket accepts 4 MiB messages; stay well under that. */
export const MAX_DATA_URL_LENGTH = 3 * 1024 * 1024;

/** Scale (width, height) so the longest edge is at most `maxEdge`, keeping the aspect ratio. */
export function fitWithin(width: number, height: number, maxEdge = MAX_UPLOAD_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

/** Return a JPEG data URL no larger than MAX_UPLOAD_EDGE on its longest side. */
export async function prepareImageForUpload(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
  // imageOrientation honours the EXIF rotation that phone cameras rely on.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.fillStyle = "#ffffff"; // flatten transparent PNGs onto white rather than black
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    // Very detailed photos can still be large at 1920px; step quality down until it fits.
    for (const quality of JPEG_QUALITIES) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("Could not encode image");
      const dataUrl = await readAsDataUrl(blob);
      if (dataUrl.length <= MAX_DATA_URL_LENGTH) return dataUrl;
    }
    throw new Error(`${file.name} is too large to upload`);
  } finally {
    bitmap.close();
  }
}
