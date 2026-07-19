import "server-only";
import { del, list, put } from "@vercel/blob";

function ensureToken(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Create a Vercel Blob store and add the token to .env.local to enable payment QR storage."
    );
  }
}

function extensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "jpg";
}

function paymentQrPrefix(uid: string): string {
  // uid is from Firebase Auth; keep path segment conservative.
  const safe = uid.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128);
  if (!safe) throw new Error("Invalid user id.");
  return `users/${safe}/payment-qr`;
}

/**
 * Upload (or replace) the signed-in user's saved payment QR on Vercel Blob.
 * Clears any prior payment-qr.* files under the user prefix first.
 */
export async function putUserPaymentQr(opts: {
  uid: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ url: string; contentType: string }> {
  ensureToken();
  const prefix = paymentQrPrefix(opts.uid);
  const ext = extensionForMime(opts.contentType);
  const contentType = opts.contentType.startsWith("image/")
    ? opts.contentType
    : "image/jpeg";

  await deleteUserPaymentQrBlobs(opts.uid);

  const blob = await put(`${prefix}.${ext}`, opts.buffer, {
    access: "public",
    contentType,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
    allowOverwrite: true,
  });

  return { url: blob.url, contentType };
}

/** Delete all payment-qr blobs for a user (best-effort). */
export async function deleteUserPaymentQrBlobs(uid: string): Promise<void> {
  ensureToken();
  const prefix = paymentQrPrefix(uid);
  try {
    const listed = await list({ prefix: `${prefix}` });
    await Promise.all(
      listed.blobs.map((b) =>
        del(b.url).catch((err) => {
          console.error("[deleteUserPaymentQrBlobs] failed", b.url, err);
        })
      )
    );
  } catch (err) {
    console.error("[deleteUserPaymentQrBlobs] list failed", err);
  }
}
