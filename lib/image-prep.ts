/**
 * Client-side helpers to prepare a receipt photo before sending it to
 * /api/extract. Large phone photos are downscaled and re-encoded as JPEG so
 * the vision model gets a sharp, reasonably sized image without blowing the
 * request body.
 */

const MAX_EDGE_PX = 2048;
const JPEG_QUALITY = 0.88;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

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

/**
 * Resize so the longest edge is at most MAX_EDGE_PX and encode as JPEG.
 * Falls back to the original data URL if the browser can't decode the image
 * (e.g. some HEIC variants) or if the result would somehow be larger.
 */
export async function prepareReceiptImage(
  dataUrl: string
): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return dataUrl;

    const scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    // Already small JPEG/PNG under the output budget — skip re-encode when
    // no resize is needed and the payload is already modest.
    if (scale === 1 && dataUrl.length < MAX_OUTPUT_BYTES * 1.37) {
      // data URL length ≈ 4/3 of bytes; *1.37 ≈ under ~MAX_OUTPUT_BYTES
      if (/^data:image\/(jpeg|jpg|png);/i.test(dataUrl)) {
        return dataUrl;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;

    // White background so transparent PNGs don't become black JPEG voids.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);

    let quality = JPEG_QUALITY;
    let out = canvasToJpegDataUrl(canvas, quality);
    // Nudge quality down if still huge (very detailed photos).
    while (out.length > MAX_OUTPUT_BYTES * 1.37 && quality > 0.55) {
      quality -= 0.1;
      out = canvasToJpegDataUrl(canvas, quality);
    }
    return out;
  } catch {
    return dataUrl;
  }
}
