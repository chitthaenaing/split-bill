import "server-only";
import { list, put } from "@vercel/blob";
import { customAlphabet } from "nanoid";
import type { ExtractedBill, StoredBill } from "@/types/bill";

const newId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  10
);

/**
 * Validates an id used in URLs. Restricted to alphanumerics so it can't be
 * abused to escape the `bills/{id}/` prefix.
 */
const ID_RE = /^[A-Za-z0-9]{6,32}$/;
export function isValidShareId(id: string): boolean {
  return ID_RE.test(id);
}

function ensureToken(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Create a Vercel Blob store and add the token to .env.local to enable sharing."
    );
  }
}

function extensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("heic")) return "heic";
  if (m.includes("heif")) return "heif";
  if (m.includes("gif")) return "gif";
  return "jpg";
}

export async function createShare(opts: {
  imageBuffer: Buffer;
  imageContentType: string;
  bill: ExtractedBill;
}): Promise<{ id: string }> {
  ensureToken();

  const id = newId();
  const ext = extensionForMime(opts.imageContentType);

  const receiptBlob = await put(
    `bills/${id}/receipt.${ext}`,
    opts.imageBuffer,
    {
      access: "public",
      contentType: opts.imageContentType,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    }
  );

  const stored: StoredBill = {
    id,
    createdAt: Date.now(),
    receiptUrl: receiptBlob.url,
    receiptContentType: opts.imageContentType,
    currency: opts.bill.currency,
    items: opts.bill.items,
    tax: opts.bill.tax,
    serviceCharge: opts.bill.serviceCharge,
    rounding: opts.bill.rounding,
  };

  await put(
    `bills/${id}/bill.json`,
    JSON.stringify(stored),
    {
      access: "public",
      contentType: "application/json",
      cacheControlMaxAge: 60,
    }
  );

  return { id };
}

export async function getShare(id: string): Promise<StoredBill | null> {
  if (!isValidShareId(id)) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn(
      "[getShare] BLOB_READ_WRITE_TOKEN not set — share links cannot be loaded."
    );
    return null;
  }

  try {
    const result = await list({ prefix: `bills/${id}/` });
    const billBlob = result.blobs.find(
      (b) =>
        b.pathname.endsWith("/bill.json") ||
        (b.pathname.includes("/bill") && b.pathname.endsWith(".json"))
    );
    if (!billBlob) return null;

    const res = await fetch(billBlob.url, { cache: "no-store" });
    if (!res.ok) return null;

    const data = (await res.json()) as StoredBill;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch (err) {
    console.error("[getShare]", err);
    return null;
  }
}
