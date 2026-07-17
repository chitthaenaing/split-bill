function normalizeExtension(ext: string): string {
  const cleaned = ext.toLowerCase().replace(/^\./, "").split("+")[0];
  if (cleaned === "jpeg") return "jpg";
  if (cleaned === "svg") return "svg";
  return cleaned;
}

function extensionFromMime(mime?: string | null): string | null {
  if (!mime) return null;
  const match = /^image\/([A-Za-z0-9.+-]+)/i.exec(mime.trim());
  return match ? normalizeExtension(match[1]) : null;
}

function extensionFromUrl(src: string): string | null {
  if (src.startsWith("data:")) {
    const mimeMatch = /^data:([^;,]+)/i.exec(src);
    return extensionFromMime(mimeMatch?.[1] ?? null);
  }

  try {
    const base =
      typeof window !== "undefined" && window.location?.href
        ? window.location.href
        : "https://localhost/";
    const url = new URL(src, base);
    const pathMatch = /\.([A-Za-z0-9]+)$/.exec(url.pathname);
    return pathMatch ? normalizeExtension(pathMatch[1]) : null;
  } catch {
    return null;
  }
}

function sanitizeBaseName(baseName: string): string {
  const cleaned = baseName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "download";
}

function withExtension(fileName: string, ext?: string | null): string {
  if (!ext) return fileName;
  return fileName.endsWith(`.${ext}`) ? fileName : `${fileName}.${ext}`;
}

function mimeFromExtension(ext?: string | null): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "image/jpeg";
  }
}

/** Ensure the blob has an image/* type so galleries index it correctly. */
export function asImageBlob(
  blob: Blob,
  mimeHint?: string | null,
  src?: string
): Blob {
  const type =
    (blob.type && blob.type.startsWith("image/") ? blob.type : null) ||
    (mimeHint && mimeHint.startsWith("image/") ? mimeHint : null) ||
    mimeFromExtension(extensionFromMime(mimeHint) ?? (src ? extensionFromUrl(src) : null));
  if (blob.type === type) return blob;
  return new Blob([blob], { type });
}

function triggerAnchorDownload(href: string, fileName: string, newTab = false) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  if (newTab) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Phones/tablets: the system share sheet includes “Save Image” / “Add to
 * Photos”, which is the only reliable web path into the photo library.
 * Desktop browsers should keep a normal file download.
 */
export function prefersShareToPhotoLibrary(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  // iPadOS 13+ may report as Macintosh; coarse pointer catches real tablets.
  if (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  try {
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function canShareImageFile(file: File): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  if (typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Opens the system share sheet so the user can save the image to Photos.
 * Returns true when share was presented (or the user cancelled it).
 */
export async function shareImageToPhotoLibrary(file: File): Promise<boolean> {
  if (!canShareImageFile(file)) return false;
  try {
    await navigator.share({
      files: [file],
      title: file.name,
    });
    return true;
  } catch (err) {
    // User dismissed the sheet — treat as handled (do not also download).
    if (err instanceof DOMException && err.name === "AbortError") {
      return true;
    }
    return false;
  }
}

export function getDownloadFileName(opts: {
  baseName: string;
  src: string;
  mimeType?: string | null;
}): string {
  const ext = extensionFromMime(opts.mimeType) ?? extensionFromUrl(opts.src);
  return withExtension(sanitizeBaseName(opts.baseName), ext ?? "jpg");
}

/** Decode a data URL without await so iOS keeps the tap user-activation for share. */
function blobFromDataUrl(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const data = match[3] ?? "";
  try {
    if (isBase64) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(data)], { type: mime });
  } catch {
    return null;
  }
}

async function loadImageBlob(src: string): Promise<Blob> {
  if (src.startsWith("data:")) {
    const fromData = blobFromDataUrl(src);
    if (fromData) return fromData;
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Download failed with ${res.status}`);
  return res.blob();
}

export async function downloadImageFile(opts: {
  src: string;
  baseName: string;
  mimeType?: string | null;
}): Promise<void> {
  const fallbackName = getDownloadFileName(opts);

  try {
    const raw = await loadImageBlob(opts.src);
    const blob = asImageBlob(raw, opts.mimeType ?? raw.type, opts.src);
    const fileName = getDownloadFileName({
      ...opts,
      mimeType: blob.type || opts.mimeType,
    });
    const file = new File([blob], fileName, {
      type: blob.type || "image/jpeg",
      lastModified: Date.now(),
    });

    // Mobile: share sheet → Save Image lands in the photo library.
    if (prefersShareToPhotoLibrary() && (await shareImageToPhotoLibrary(file))) {
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    try {
      triggerAnchorDownload(blobUrl, fileName);
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
    }
    return;
  } catch {
    triggerAnchorDownload(opts.src, fallbackName, true);
  }
}
