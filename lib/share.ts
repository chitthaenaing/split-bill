import "server-only";
import { del, list, put } from "@vercel/blob";
import { customAlphabet } from "nanoid";
import type { ExtractedBill, StoredBill, StoredPaymentReceipt } from "@/types/bill";
import { sendPushToTokens } from "./firebase-admin";
import { isValidShareId, normalizeStoredBill } from "./normalize-stored-bill";
import { createShareToken, hashShareToken, verifyShareToken } from "./share-tokens";

export { isValidShareId, normalizeStoredBill } from "./normalize-stored-bill";

const newId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  10
);

const ID_RE = /^[A-Za-z0-9]{6,32}$/;

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
const MUTATE_MAX_ATTEMPTS = 5;

export class ShareConflictError extends Error {
  constructor(message = "Could not update the shared bill after concurrent edits. Please try again.") {
    super(message);
    this.name = "ShareConflictError";
  }
}

export class ShareAuthError extends Error {
  constructor(message = "Not allowed.") {
    super(message);
    this.name = "ShareAuthError";
  }
}

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

/**
 * Read-modify-write bill.json with lastWriteId verification + retry so concurrent
 * payment uploads / notify registrations / deletes don't silently clobber each other.
 */
export async function mutateStoredBill(
  shareId: string,
  mutator: (current: StoredBill) => StoredBill,
  opts?: { maxAttempts?: number }
): Promise<StoredBill | null> {
  ensureToken();
  if (!isValidShareId(shareId)) return null;

  const maxAttempts = opts?.maxAttempts ?? MUTATE_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const current = await getShare(shareId);
    if (!current) return null;

    const writeId = newId();
    const next: StoredBill = {
      ...mutator(current),
      revision: (current.revision ?? 0) + 1,
      lastWriteId: writeId,
    };

    await put(`bills/${shareId}/bill.json`, JSON.stringify(next), {
      access: "public",
      contentType: "application/json",
      cacheControlMaxAge: 0,
      allowOverwrite: true,
    });

    const verified = await getShare(shareId);
    if (verified?.lastWriteId === writeId) {
      return verified;
    }
  }

  throw new ShareConflictError();
}

export async function createShare(opts: {
  imageBuffer: Buffer;
  imageContentType: string;
  bill: ExtractedBill;
  bankingQrBuffer?: Buffer;
  bankingQrContentType?: string;
}): Promise<{ id: string; ownerToken: string }> {
  ensureToken();

  const id = newId();
  const ownerToken = createShareToken();
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

  const writeId = newId();
  const stored: StoredBill = {
    id,
    createdAt: Date.now(),
    receiptUrl: receiptBlob.url,
    receiptContentType: opts.imageContentType,
    ...(bankingQrUrl && bankingQrContentType
      ? { bankingQrUrl, bankingQrContentType }
      : {}),
    ownerTokenHash: hashShareToken(ownerToken),
    revision: 1,
    lastWriteId: writeId,
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

  return { id, ownerToken };
}

/**
 * Uploads a payment proof image and appends it to the shared bill metadata.
 * Returns a one-time `deleteToken` the uploader must present to remove it.
 */
export async function appendPaymentReceipt(opts: {
  shareId: string;
  imageBuffer: Buffer;
  imageContentType: string;
  payerName: string;
}): Promise<{
  bill: StoredBill;
  entry: StoredPaymentReceipt;
  deleteToken: string;
} | null> {
  ensureToken();
  if (!isValidShareId(opts.shareId)) return null;

  // Cap check before uploading the blob so we don't leave orphans on a full bill.
  const current = await getShare(opts.shareId);
  if (!current) return null;
  const existingCount = Array.isArray(current.paymentReceipts)
    ? current.paymentReceipts.length
    : 0;
  if (existingCount >= MAX_PAYMENT_RECEIPTS_PER_BILL) {
    throw new Error(
      `This bill already has the maximum number of payment proofs (${MAX_PAYMENT_RECEIPTS_PER_BILL}).`
    );
  }

  const proofId = newId();
  const deleteToken = createShareToken();
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
    deleteTokenHash: hashShareToken(deleteToken),
  };

  let bill: StoredBill;
  try {
    const next = await mutateStoredBill(opts.shareId, (latest) => {
      const receipts: StoredPaymentReceipt[] = Array.isArray(
        latest.paymentReceipts
      )
        ? latest.paymentReceipts
        : [];
      if (receipts.length >= MAX_PAYMENT_RECEIPTS_PER_BILL) {
        throw new Error(
          `This bill already has the maximum number of payment proofs (${MAX_PAYMENT_RECEIPTS_PER_BILL}).`
        );
      }
      // Another writer may have raced ahead; don't double-append the same id.
      if (receipts.some((r) => r.id === proofId)) {
        return latest;
      }
      return {
        ...latest,
        paymentReceipts: [...receipts, entry],
      };
    });
    if (!next) {
      try {
        await del(uploaded.url);
      } catch {
        // best-effort cleanup
      }
      return null;
    }
    bill = next;
  } catch (err) {
    try {
      await del(uploaded.url);
    } catch {
      // best-effort cleanup
    }
    throw err;
  }

  // Best-effort push to the sharer; a notification failure must never break the
  // upload. Prune any tokens FCM rejects so the stored list stays clean.
  const tokens = Array.isArray(bill.notifyTokens) ? bill.notifyTokens : [];
  if (tokens.length > 0) {
    try {
      const { invalidTokens } = await sendPushToTokens(tokens, {
        title: "New payment receipt",
        body: `${opts.payerName} uploaded a transfer.`,
        url: `/b/${opts.shareId}`,
      });
      if (invalidTokens.length > 0) {
        const cleaned = await mutateStoredBill(opts.shareId, (latest) => {
          const currentTokens = Array.isArray(latest.notifyTokens)
            ? latest.notifyTokens
            : [];
          return {
            ...latest,
            notifyTokens: currentTokens.filter(
              (t) => !invalidTokens.includes(t)
            ),
          };
        });
        if (cleaned) bill = cleaned;
      }
    } catch (err) {
      console.error("[appendPaymentReceipt] push notification failed", err);
    }
  }

  return { bill, entry, deleteToken };
}

/**
 * Stores an FCM token for the sharer so they get pushed when a payment proof
 * is uploaded. De-duplicates and caps the list. Idempotent.
 * Requires the bill's owner token when the bill was created with one.
 */
export async function registerNotifyToken(opts: {
  shareId: string;
  token: string;
  ownerToken?: string | null;
}): Promise<boolean> {
  ensureToken();
  if (!isValidShareId(opts.shareId)) return false;
  const token = String(opts.token || "").trim();
  if (!token || token.length > MAX_TOKEN_LEN) return false;

  const current = await getShare(opts.shareId);
  if (!current) return false;

  if (current.ownerTokenHash) {
    if (!verifyShareToken(opts.ownerToken, current.ownerTokenHash)) {
      throw new ShareAuthError(
        "Only the person who shared this bill can enable payment alerts."
      );
    }
  }

  const next = await mutateStoredBill(opts.shareId, (latest) => {
    const existing = Array.isArray(latest.notifyTokens)
      ? latest.notifyTokens
      : [];
    if (existing.includes(token)) return latest;
    return {
      ...latest,
      notifyTokens: [...existing, token].slice(-MAX_NOTIFY_TOKENS),
    };
  });

  return next != null;
}

/**
 * Removes a single payment proof (its blob and its entry in the bill) by id.
 * Requires the uploader's delete token, or the bill owner's token.
 * Legacy proofs without a stored hash still allow unauthenticated delete.
 * Idempotent — a missing receipt id just returns the current bill unchanged.
 */
export async function deletePaymentReceipt(opts: {
  shareId: string;
  receiptId: string;
  deleteToken?: string | null;
  ownerToken?: string | null;
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

  const isOwner = verifyShareToken(opts.ownerToken, current.ownerTokenHash);
  if (target.deleteTokenHash) {
    const isUploader = verifyShareToken(
      opts.deleteToken,
      target.deleteTokenHash
    );
    if (!isUploader && !isOwner) {
      throw new ShareAuthError(
        "Missing or invalid delete token for this payment proof."
      );
    }
  }

  try {
    await del(target.url);
  } catch (err) {
    // The image may already be gone; still drop it from the bill metadata.
    console.error("[deletePaymentReceipt] blob delete failed", err);
  }

  return mutateStoredBill(opts.shareId, (latest) => {
    const receipts: StoredPaymentReceipt[] = Array.isArray(
      latest.paymentReceipts
    )
      ? latest.paymentReceipts
      : [];
    return {
      ...latest,
      paymentReceipts: receipts.filter((r) => r.id !== opts.receiptId),
    };
  });
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

    const data = (await res.json()) as unknown;
    return normalizeStoredBill(data);
  } catch (err) {
    console.error("[getShare]", err);
    return null;
  }
}
