import type { StoredBill } from "@/types/bill";
import type { UserBillSummary } from "@/types/user-bills";

/** Compact fields for the signed-in user's bill index. */
export function summarizeStoredBill(bill: StoredBill): UserBillSummary {
  const itemsSubtotal = bill.items.reduce(
    (sum, it) => sum + (Number(it.price) || 0),
    0
  );
  const total =
    itemsSubtotal +
    (Number(bill.tax) || 0) +
    (Number(bill.serviceCharge) || 0) +
    (Number(bill.rounding) || 0) -
    (Number(bill.discount) || 0);

  return {
    currency: bill.currency,
    total,
    itemCount: bill.items.length,
    ...(bill.receiptUrl ? { receiptUrl: bill.receiptUrl } : {}),
  };
}
