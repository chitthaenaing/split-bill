import { computePaymentBalance, isBillSettled } from "./payment-balance";
import { unpaidParticipants } from "./participants";
import type { StoredBill, StoredPaymentReceipt } from "@/types/bill";
import type { UserBillPayer, UserBillSummary } from "@/types/user-bills";

const MAX_PAYERS = 40;
const MAX_PAYER_NAME_LEN = 40;

/** Slim per-person rows for the My bills index (no proof counts). */
export function payersFromBalance(
  byPayer: readonly { payerName: string; amountPaid: number }[]
): UserBillPayer[] {
  return byPayer
    .map((row) => {
      const name = String(row.payerName ?? "")
        .trim()
        .slice(0, MAX_PAYER_NAME_LEN);
      const amountPaid = Number(row.amountPaid);
      if (!name || !Number.isFinite(amountPaid) || amountPaid <= 0) return null;
      return {
        name,
        amountPaid: Math.round(amountPaid * 100) / 100,
      };
    })
    .filter((p): p is UserBillPayer => p != null)
    .slice(0, MAX_PAYERS);
}

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
    | "participants"
  > & { receiptUrl?: string },
  receipts: readonly StoredPaymentReceipt[] = []
): UserBillSummary {
  const balance = computePaymentBalance(bill, receipts);
  const roster = bill.participants ?? [];
  const hasRoster = roster.length > 0;
  return {
    currency: bill.currency || "THB",
    total: balance.billTotal,
    itemCount: bill.items.length,
    paidTotal: balance.paidTotal,
    // Always set so refreshes can clear stale rows when proofs go away.
    payers: payersFromBalance(balance.byPayer),
    unpaid: hasRoster ? unpaidParticipants(roster, receipts) : [],
    hasRoster,
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
