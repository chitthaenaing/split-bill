/**
 * Client-side helpers to prepare a receipt photo before sending it to
 * /api/extract. Large phone photos are downscaled and re-encoded as JPEG so
 * the vision model gets a sharp, reasonably sized image without blowing the
 * request body.
 *
 * Vercel serverless request bodies are capped at ~4.5 MB. We target well under
 * that so multipart uploads (and any JSON fallback) succeed on mobile Safari.
 */

/** Longest edge after resize — enough detail for receipt OCR. */
export const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;
/**
 * Max encoded JPEG size. Kept under Vercel's 4.5 MB body limit with room for
 * multipart framing. Previously 5 MB, which routinely 413'd on phone photos
 * and surfaced as Safari's cryptic "string did not match the expected pattern"
 * when `res.json()` tried to parse the HTML error page.
 */
export const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
/** data URL length ≈ 4/3 of raw bytes; 1.37 leaves a little slack. */
export const DATA_URL_SIZE_FACTOR = 1.37;

export function maxDataUrlLength(maxBytes = MAX_OUTPUT_BYTES): number {
  return Math.floor(maxBytes * DATA_URL_SIZE_FACTOR);
}

export function approxBytesFromDataUrl(dataUrl: string): number {
  const b64 = dataUrl.split(",")[1] || "";
  return Math.floor((b64.length * 3) / 4);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the image."));
    img.src = dataUrl;
  });
}

function canvasToJpegDataUrl(
  canvas: HTMLCanvasElement,
  quality: number
): string {
  return canvas.toDataURL("image/jpeg", quality);
}

function drawToCanvas(
  img: HTMLImageElement,
  tw: number,
  th: number
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // White background so transparent PNGs don't become black JPEG voids.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(img, 0, 0, tw, th);
  return canvas;
}

/**
 * Convert a data URL to a Blob for multipart upload (avoids the 33% base64
 * overhead of JSON `{ imageDataUrl }` bodies).
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    throw new Error("Invalid image data URL.");
  }
  const header = dataUrl.slice(0, comma);
  const mime = /data:([^;,]+)/i.exec(header)?.[1] || "image/jpeg";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Resize so the longest edge is at most MAX_EDGE_PX and encode as JPEG under
 * MAX_OUTPUT_BYTES. Falls back to the original data URL only when the browser
 * can't decode the image (e.g. some HEIC variants).
 */
export async function prepareReceiptImage(
  dataUrl: string
): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return dataUrl;

    const limit = maxDataUrlLength();
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h));
    let tw = Math.max(1, Math.round(w * scale));
    let th = Math.max(1, Math.round(h * scale));

    // Already a modest JPEG/PNG under the output budget — skip re-encode.
    if (
      scale === 1 &&
      dataUrl.length <= limit &&
      /^data:image\/(jpeg|jpg|png);/i.test(dataUrl)
    ) {
      return dataUrl;
    }

    let canvas = drawToCanvas(img, tw, th);
    if (!canvas) return dataUrl;

    let quality = JPEG_QUALITY;
    let out = canvasToJpegDataUrl(canvas, quality);

    // Nudge quality down if still huge (very detailed photos).
    while (out.length > limit && quality > 0.5) {
      quality -= 0.08;
      out = canvasToJpegDataUrl(canvas, quality);
    }

    // Still too big — shrink dimensions and re-encode.
    let shrinkGuard = 0;
    while (out.length > limit && shrinkGuard < 4) {
      shrinkGuard++;
      tw = Math.max(1, Math.round(tw * 0.75));
      th = Math.max(1, Math.round(th * 0.75));
      canvas = drawToCanvas(img, tw, th);
      if (!canvas) break;
      quality = Math.min(quality, 0.72);
      out = canvasToJpegDataUrl(canvas, quality);
      while (out.length > limit && quality > 0.45) {
        quality -= 0.08;
        out = canvasToJpegDataUrl(canvas, quality);
      }
    }

    return out;
  } catch {
    return dataUrl;
  }
}
