import "server-only";
import { del, list, put } from "@vercel/blob";
import { customAlphabet } from "nanoid";
import type { ExtractedBill, StoredBill, StoredPaymentReceipt } from "@/types/bill";
import { sendPushToTokens } from "./firebase-admin";

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

const MAX_PAYMENT_RECEIPTS_PER_BILL = 40;
const MAX_PAYER_NAME_LEN = 40;
const MAX_NOTIFY_TOKENS = 20;
const MAX_TOKEN_LEN = 4096;

/** Trim, strip ASCII control chars, cap length. Returns null if empty. */
export function sanitizePayerName(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s.length === 0) return null;
  const cleaned = s
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_PAYER_NAME_LEN);
  return cleaned.length > 0 ? cleaned : null;
}

export async function createShare(opts: {
  imageBuffer: Buffer;
  imageContentType: string;
  bill: ExtractedBill;
  bankingQrBuffer?: Buffer;
  bankingQrContentType?: string;
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

  let bankingQrUrl: string | undefined;
  let bankingQrContentType: string | undefined;
  if (
    opts.bankingQrBuffer &&
    opts.bankingQrBuffer.length > 0 &&
    opts.bankingQrContentType
  ) {
    const qrExt = extensionForMime(opts.bankingQrContentType);
    const qrBlob = await put(
      `bills/${id}/banking-qr.${qrExt}`,
      opts.bankingQrBuffer,
      {
        access: "public",
        contentType: opts.bankingQrContentType,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      }
    );
    bankingQrUrl = qrBlob.url;
    bankingQrContentType = opts.bankingQrContentType;
  }

  const stored: StoredBill = {
    id,
    createdAt: Date.now(),
    receiptUrl: receiptBlob.url,
    receiptContentType: opts.imageContentType,
    ...(bankingQrUrl && bankingQrContentType
      ? { bankingQrUrl, bankingQrContentType }
      : {}),
    currency: opts.bill.currency,
    items: opts.bill.items,
    tax: opts.bill.tax,
    serviceCharge: opts.bill.serviceCharge,
    rounding: opts.bill.rounding,
    discount: Math.max(0, opts.bill.discount || 0),
  };

  await put(
    `bills/${id}/bill.json`,
    JSON.stringify(stored),
    {
      access: "public",
      contentType: "application/json",
      cacheControlMaxAge: 0,
      allowOverwrite: true,
    }
  );

  return { id };
}

/**
 * Uploads a payment proof image and appends it to the shared bill metadata.
 */
export async function appendPaymentReceipt(opts: {
  shareId: string;
  imageBuffer: Buffer;
  imageContentType: string;
  payerName: string;
}): Promise<{ bill: StoredBill; entry: StoredPaymentReceipt } | null> {
  ensureToken();
  if (!isValidShareId(opts.shareId)) return null;

  const current = await getShare(opts.shareId);
  if (!current) return null;

  const existing: StoredPaymentReceipt[] = Array.isArray(
    current.paymentReceipts
  )
    ? current.paymentReceipts
    : [];
  if (existing.length >= MAX_PAYMENT_RECEIPTS_PER_BILL) {
    throw new Error(
      `This bill already has the maximum number of payment proofs (${MAX_PAYMENT_RECEIPTS_PER_BILL}).`
    );
  }

  const proofId = newId();
  const ext = extensionForMime(opts.imageContentType);
  const path = `bills/${opts.shareId}/payments/${proofId}.${ext}`;

  const uploaded = await put(path, opts.imageBuffer, {
    access: "public",
    contentType: opts.imageContentType,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });

  const entry: StoredPaymentReceipt = {
    id: proofId,
    url: uploaded.url,
    contentType: opts.imageContentType,
    uploadedAt: Date.now(),
    payerName: opts.payerName,
  };

  const next: StoredBill = {
    ...current,
    paymentReceipts: [...existing, entry],
  };

  await put(`bills/${opts.shareId}/bill.json`, JSON.stringify(next), {
    access: "public",
    contentType: "application/json",
    cacheControlMaxAge: 0,
    allowOverwrite: true,
  });

  // Best-effort push to the sharer; a notification failure must never break the
  // upload. Prune any tokens FCM rejects so the stored list stays clean.
  const tokens = Array.isArray(next.notifyTokens) ? next.notifyTokens : [];
  if (tokens.length > 0) {
    try {
      const { invalidTokens } = await sendPushToTokens(tokens, {
        title: "New payment receipt",
        body: `${opts.payerName} uploaded a transfer.`,
        url: `/b/${opts.shareId}`,
      });
      if (invalidTokens.length > 0) {
        const cleaned: StoredBill = {
          ...next,
          notifyTokens: tokens.filter((t) => !invalidTokens.includes(t)),
        };
        await put(`bills/${opts.shareId}/bill.json`, JSON.stringify(cleaned), {
          access: "public",
          contentType: "application/json",
          cacheControlMaxAge: 0,
          allowOverwrite: true,
        });
        return { bill: cleaned, entry };
      }
    } catch (err) {
      console.error("[appendPaymentReceipt] push notification failed", err);
    }
  }

  return { bill: next, entry };
}

/**
 * Stores an FCM token for the sharer so they get pushed when a payment proof
 * is uploaded. De-duplicates and caps the list. Idempotent.
 */
export async function registerNotifyToken(opts: {
  shareId: string;
  token: string;
}): Promise<boolean> {
  ensureToken();
  if (!isValidShareId(opts.shareId)) return false;
  const token = String(opts.token || "").trim();
  if (!token || token.length > MAX_TOKEN_LEN) return false;

  const current = await getShare(opts.shareId);
  if (!current) return false;

  const existing = Array.isArray(current.notifyTokens)
    ? current.notifyTokens
    : [];
  if (existing.includes(token)) return true;

  const next: StoredBill = {
    ...current,
    notifyTokens: [...existing, token].slice(-MAX_NOTIFY_TOKENS),
  };

  await put(`bills/${opts.shareId}/bill.json`, JSON.stringify(next), {
    access: "public",
    contentType: "application/json",
    cacheControlMaxAge: 0,
    allowOverwrite: true,
  });

  return true;
}

/**
 * Removes a single payment proof (its blob and its entry in the bill) by id.
 * Idempotent — a missing receipt id just returns the current bill unchanged.
 */
export async function deletePaymentReceipt(opts: {
  shareId: string;
  receiptId: string;
}): Promise<StoredBill | null> {
  ensureToken();
  if (!isValidShareId(opts.shareId)) return null;
  if (!ID_RE.test(opts.receiptId)) return null;

  const current = await getShare(opts.shareId);
  if (!current) return null;

  const existing: StoredPaymentReceipt[] = Array.isArray(
    current.paymentReceipts
  )
    ? current.paymentReceipts
    : [];
  const target = existing.find((r) => r.id === opts.receiptId);
  if (!target) return current;

  try {
    await del(target.url);
  } catch (err) {
    // The image may already be gone; still drop it from the bill metadata.
    console.error("[deletePaymentReceipt] blob delete failed", err);
  }

  const next: StoredBill = {
    ...current,
    paymentReceipts: existing.filter((r) => r.id !== opts.receiptId),
  };

  await put(`bills/${opts.shareId}/bill.json`, JSON.stringify(next), {
    access: "public",
    contentType: "application/json",
    cacheControlMaxAge: 0,
    allowOverwrite: true,
  });

  return next;
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
