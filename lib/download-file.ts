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
    const url = new URL(src, window.location.href);
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

export function getDownloadFileName(opts: {
  baseName: string;
  src: string;
  mimeType?: string | null;
}): string {
  const ext = extensionFromMime(opts.mimeType) ?? extensionFromUrl(opts.src);
  return withExtension(sanitizeBaseName(opts.baseName), ext);
}

export async function downloadImageFile(opts: {
  src: string;
  baseName: string;
  mimeType?: string | null;
}): Promise<void> {
  const fallbackName = getDownloadFileName(opts);

  try {
    const res = await fetch(opts.src);
    if (!res.ok) throw new Error(`Download failed with ${res.status}`);
    const blob = await res.blob();
    const fileName = getDownloadFileName({
      ...opts,
      mimeType: blob.type || opts.mimeType,
    });
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
