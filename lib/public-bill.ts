import type { StoredBill, StoredPaymentReceipt } from "@/types/bill";

/** Payment proof fields safe to show to anyone with the share link. */
export function toPublicPaymentReceipt(
  receipt: StoredPaymentReceipt
): StoredPaymentReceipt {
  return {
    id: receipt.id,
    url: receipt.url,
    contentType: receipt.contentType,
    uploadedAt: receipt.uploadedAt,
    ...(receipt.payerName ? { payerName: receipt.payerName } : {}),
    ...(typeof receipt.amountPaid === "number" &&
    Number.isFinite(receipt.amountPaid) &&
    receipt.amountPaid > 0
      ? { amountPaid: receipt.amountPaid }
      : {}),
  };
}

/**
 * Strip secrets and concurrency metadata before sending a stored bill to the
 * browser. Recipients must never see FCM tokens, owner hashes, or delete hashes.
 */
export function toPublicStoredBill(bill: StoredBill): StoredBill {
  const paymentReceipts = Array.isArray(bill.paymentReceipts)
    ? bill.paymentReceipts.map(toPublicPaymentReceipt)
    : undefined;

  return {
    id: bill.id,
    createdAt: bill.createdAt,
    receiptUrl: bill.receiptUrl,
    receiptContentType: bill.receiptContentType,
    ...(bill.bankingQrUrl && bill.bankingQrContentType
      ? {
          bankingQrUrl: bill.bankingQrUrl,
          bankingQrContentType: bill.bankingQrContentType,
        }
      : {}),
    ...(paymentReceipts ? { paymentReceipts } : {}),
    currency: bill.currency,
    items: bill.items,
    tax: bill.tax,
    serviceCharge: bill.serviceCharge,
    rounding: bill.rounding,
    ...(typeof bill.discount === "number" ? { discount: bill.discount } : {}),
  };
}
