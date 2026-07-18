/**
 * Read an image File/Blob from multipart form data into a Buffer + mime.
 * Shared by share and payment-proof upload routes.
 */

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

export async function readMultipartImage(
  form: FormData,
  fieldName: string,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<{ buffer: Buffer; mime: string } | null> {
  const value = form.get(fieldName);
  if (!value || !(value instanceof File)) return null;
  if (value.size <= 0) return null;
  if (value.size > maxBytes) {
    const err = new Error(
      `Image is too large (max ${Math.floor(maxBytes / (1024 * 1024))} MB after compression).`
    );
    (err as Error & { status: number }).status = 413;
    throw err;
  }
  const mime = value.type || "image/jpeg";
  if (!mime.startsWith("image/")) {
    const err = new Error("Expected an image file.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }
  const buffer = Buffer.from(await value.arrayBuffer());
  if (buffer.length === 0) return null;
  return { buffer, mime };
}

export function httpStatusFromError(err: unknown, fallback = 500): number {
  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    return (err as { status: number }).status;
  }
  return fallback;
}
