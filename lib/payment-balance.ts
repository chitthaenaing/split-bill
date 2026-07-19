import type { StoredBill, StoredPaymentReceipt } from "@/types/bill";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Grand total / amount due for a shared bill: items (incl. minus promos) +
 * tax + service + rounding − any bill-level discount.
 */
export function billAmountDue(
  bill: Pick<
    StoredBill,
    "items" | "tax" | "serviceCharge" | "rounding" | "discount"
  >
): number {
  const items = bill.items.reduce((s, it) => s + (it.price || 0), 0);
  const discount = Math.max(0, bill.discount || 0);
  return round2(
    items +
      Math.max(0, bill.tax || 0) +
      Math.max(0, bill.serviceCharge || 0) +
      (bill.rounding || 0) -
      discount
  );
}

export function totalPaid(
  receipts: readonly Pick<StoredPaymentReceipt, "amountPaid">[]
): number {
  return round2(
    receipts.reduce((sum, r) => {
      const n = r.amountPaid;
      return sum + (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);
    }, 0)
  );
}

export type PayerPaidRow = {
  payerName: string;
  amountPaid: number;
  proofCount: number;
};

export function paidByPayer(
  receipts: readonly Pick<StoredPaymentReceipt, "payerName" | "amountPaid">[]
): PayerPaidRow[] {
  const map = new Map<string, PayerPaidRow>();
  for (const r of receipts) {
    const label = (r.payerName ?? "").trim() || "Transfer";
    const key = label.toLowerCase();
    const amount =
      typeof r.amountPaid === "number" &&
      Number.isFinite(r.amountPaid) &&
      r.amountPaid > 0
        ? r.amountPaid
        : 0;
    const existing = map.get(key);
    if (existing) {
      existing.amountPaid = round2(existing.amountPaid + amount);
      existing.proofCount += 1;
    } else {
      map.set(key, {
        payerName: label,
        amountPaid: round2(amount),
        proofCount: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.payerName.localeCompare(b.payerName, undefined, { sensitivity: "base" })
  );
}

export type PaymentBalance = {
  billTotal: number;
  paidTotal: number;
  remaining: number;
  byPayer: PayerPaidRow[];
  hasUnknownAmounts: boolean;
};

export function computePaymentBalance(
  bill: Pick<
    StoredBill,
    "items" | "tax" | "serviceCharge" | "rounding" | "discount"
  >,
  receipts: readonly StoredPaymentReceipt[]
): PaymentBalance {
  const billTotal = billAmountDue(bill);
  const paidTotal = totalPaid(receipts);
  const hasUnknownAmounts = receipts.some(
    (r) =>
      typeof r.amountPaid !== "number" ||
      !Number.isFinite(r.amountPaid) ||
      r.amountPaid <= 0
  );
  return {
    billTotal,
    paidTotal,
    remaining: round2(billTotal - paidTotal),
    byPayer: paidByPayer(receipts),
    hasUnknownAmounts,
  };
}
