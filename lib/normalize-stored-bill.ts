import type { StoredBill, StoredPaymentReceipt } from "@/types/bill";

const ID_RE = /^[A-Za-z0-9]{6,32}$/;
const MAX_PAYER_NAME_LEN = 40;
const MAX_NOTIFY_TOKENS = 20;

export function isValidShareId(id: string): boolean {
  return ID_RE.test(id);
}

/**
 * Loose runtime validation so a corrupted / unexpected blob doesn't crash the
 * shared page. Returns null when the payload isn't a usable StoredBill.
 */
export function normalizeStoredBill(data: unknown): StoredBill | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.id !== "string" || !isValidShareId(o.id)) return null;
  if (typeof o.receiptUrl !== "string" || !o.receiptUrl) return null;
  if (!Array.isArray(o.items)) return null;

  const items = o.items
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const it = raw as Record<string, unknown>;
      const name = String(it.name ?? "").slice(0, 200);
      const nameTranslated = String(it.nameTranslated ?? "")
        .trim()
        .slice(0, 200);
      const price = Number(it.price);
      const quantity = Math.max(1, Math.floor(Number(it.quantity) || 1));
      if (!name && !(Number.isFinite(price) && price !== 0)) return null;
      return {
        name,
        ...(nameTranslated && nameTranslated !== name
          ? { nameTranslated }
          : {}),
        price: Number.isFinite(price) ? price : 0,
        quantity,
      };
    })
    .filter((it): it is NonNullable<typeof it> => it != null);

  const paymentReceipts = Array.isArray(o.paymentReceipts)
    ? o.paymentReceipts
        .map((raw): StoredPaymentReceipt | null => {
          if (!raw || typeof raw !== "object") return null;
          const r = raw as Record<string, unknown>;
          if (typeof r.id !== "string" || !ID_RE.test(r.id)) return null;
          if (typeof r.url !== "string" || !r.url) return null;
          return {
            id: r.id,
            url: r.url,
            contentType:
              typeof r.contentType === "string"
                ? r.contentType
                : "image/jpeg",
            uploadedAt:
              typeof r.uploadedAt === "number" ? r.uploadedAt : Date.now(),
            ...(typeof r.payerName === "string" && r.payerName.trim()
              ? { payerName: r.payerName.trim().slice(0, MAX_PAYER_NAME_LEN) }
              : {}),
            ...(typeof r.amountPaid === "number" &&
            Number.isFinite(r.amountPaid) &&
            r.amountPaid > 0
              ? {
                  amountPaid:
                    Math.round(Math.min(r.amountPaid, 1_000_000_000) * 100) /
                    100,
                }
              : {}),
            ...(typeof r.deleteTokenHash === "string"
              ? { deleteTokenHash: r.deleteTokenHash }
              : {}),
          };
        })
        .filter((r): r is StoredPaymentReceipt => r != null)
    : undefined;

  const notifyTokens = Array.isArray(o.notifyTokens)
    ? o.notifyTokens
        .filter((t): t is string => typeof t === "string" && t.length > 0)
        .slice(0, MAX_NOTIFY_TOKENS)
    : undefined;

  return {
    id: o.id,
    createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now(),
    receiptUrl: o.receiptUrl,
    receiptContentType:
      typeof o.receiptContentType === "string"
        ? o.receiptContentType
        : "image/jpeg",
    ...(typeof o.bankingQrUrl === "string" && o.bankingQrUrl
      ? {
          bankingQrUrl: o.bankingQrUrl,
          bankingQrContentType:
            typeof o.bankingQrContentType === "string"
              ? o.bankingQrContentType
              : "image/jpeg",
        }
      : {}),
    ...(paymentReceipts ? { paymentReceipts } : {}),
    ...(notifyTokens ? { notifyTokens } : {}),
    ...(typeof o.ownerTokenHash === "string"
      ? { ownerTokenHash: o.ownerTokenHash }
      : {}),
    ...(typeof o.revision === "number" ? { revision: o.revision } : {}),
    ...(typeof o.lastWriteId === "string"
      ? { lastWriteId: o.lastWriteId }
      : {}),
    currency: String(o.currency || "THB").slice(0, 8),
    items,
    tax: Math.max(0, Number(o.tax) || 0),
    serviceCharge: Math.max(0, Number(o.serviceCharge) || 0),
    rounding: Number(o.rounding) || 0,
    ...(typeof o.discount === "number"
      ? { discount: Math.max(0, o.discount) }
      : {}),
  };
}
