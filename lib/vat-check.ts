import {
  MONEY_TOLERANCE,
  netItemsSum,
  type NormalizedBill,
} from "@/lib/bill-extract";

/** Default Thai VAT rate (7%). */
export const TH_VAT_RATE = 0.07;

/**
 * Tighter than MONEY_TOLERANCE: Thai ABB printers often print VAT a few
 * satang off the statutory round (51.91 vs 51.88). That should soft-warn
 * even though grand-total reconciliation still passes at ±0.05.
 */
export const VAT_MATCH_TOLERANCE = 0.01;

export type VatConsistencyResult = {
  ok: boolean;
  /** Skipped when currency/rate is not applicable or no printed tax. */
  skipped: boolean;
  expectedVat: number;
  printedVat: number;
  messages: string[];
};

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Soft VAT consistency check for locale rates (esp. THB 7%).
 *
 * Never rewrites totals or tax — informational warnings only. When the grand
 * total already reconciles, a few satang of printer VAT noise should not
 * change the amount owed.
 */
export function checkVatConsistency(
  bill: NormalizedBill,
  rate?: number
): VatConsistencyResult {
  const printedVat = bill.tax;
  const currency = bill.currency.toUpperCase();

  const resolvedRate =
    rate ?? (currency === "THB" ? TH_VAT_RATE : undefined);

  if (resolvedRate == null || resolvedRate <= 0) {
    return {
      ok: true,
      skipped: true,
      expectedVat: 0,
      printedVat,
      messages: [],
    };
  }

  // No printed tax line — nothing to compare.
  if (printedVat <= MONEY_TOLERANCE) {
    return {
      ok: true,
      skipped: true,
      expectedVat: 0,
      printedVat,
      messages: [],
    };
  }

  let expectedVat: number;
  if (bill.taxInclusive) {
    // Inclusive: VAT = total × rate / (1 + rate)
    expectedVat = round2(
      (bill.total * resolvedRate) / (1 + resolvedRate)
    );
  } else {
    const net = netItemsSum(bill.items, bill.currency);
    expectedVat = round2((net + bill.serviceCharge) * resolvedRate);
  }

  const delta = Math.abs(expectedVat - printedVat);
  if (delta <= VAT_MATCH_TOLERANCE) {
    return {
      ok: true,
      skipped: false,
      expectedVat,
      printedVat,
      messages: [],
    };
  }

  const pct = Math.round(resolvedRate * 100);
  const mode = bill.taxInclusive ? "inclusive" : "exclusive";
  const messages = [
    `Printed VAT ${printedVat.toFixed(2)} differs from expected ${pct}% ${mode} VAT ${expectedVat.toFixed(2)} (off by ${delta.toFixed(2)}). The charged total was left unchanged.`,
  ];

  return {
    ok: false,
    skipped: false,
    expectedVat,
    printedVat,
    messages,
  };
}
