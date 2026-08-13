import { computePaymentBalance, isBillSettled } from "./payment-balance";
import type { StoredBill, StoredPaymentReceipt } from "@/types/bill";
import type { UserBillSummary } from "@/types/user-bills";

/** Build the Firestore index summary from a stored/public bill + proofs. */
export function summaryFromBill(
  bill: Pick<
    StoredBill,
    | "currency"
    | "items"
    | "tax"
    | "serviceCharge"
    | "rounding"
    | "discount"
    | "additionalCharges"
    | "ownerPaid"
  > & { receiptUrl?: string },
  receipts: readonly StoredPaymentReceipt[] = []
): UserBillSummary {
  const balance = computePaymentBalance(bill, receipts);
  return {
    currency: bill.currency || "THB",
    total: balance.billTotal,
    itemCount: bill.items.length,
    paidTotal: balance.paidTotal,
    ...(bill.receiptUrl ? { receiptUrl: bill.receiptUrl } : {}),
  };
}

export function userBillIsSettled(
  link: Pick<UserBillSummary, "total" | "paidTotal">
): boolean {
  const paid = Number(link.paidTotal) || 0;
  const total = Number(link.total) || 0;
  // Legacy rows without paidTotal stay open until a refresh writes it.
  return isBillSettled(total - paid);
}
