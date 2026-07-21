import {
  MONEY_TOLERANCE,
  netItemsSum,
  type NormalizedBill,
} from "@/lib/bill-extract";

/** Default Thai VAT rate (7%). */
export const TH_VAT_RATE = 0.07;

/**
 * Singapore GST rates. 9% from 2024-01-01; 8% for 2023 receipts.
 * Soft-check accepts either so historical photos still validate.
 */
export const SG_GST_RATES = [0.09, 0.08] as const;

/**
 * Tighter than MONEY_TOLERANCE: Thai ABB printers often print VAT a few
 * satang off the statutory round (51.91 vs 51.88). That should soft-warn
 * even though grand-total reconciliation still passes at ±0.05.
 */
export const VAT_MATCH_TOLERANCE = 0.01;

/**
 * Soft VAT warnings are only for near-miss printer/rounding noise. A charge
 * that is many baht off the statutory rate is probably not VAT at all
 * (service, mis-read total, invented gap-fill) — don't claim a 7% mismatch.
 */
export const VAT_SOFT_WARN_MAX_DELTA = 1;

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

/** Known statutory rates for a currency, newest first. */
export function ratesForCurrency(currency: string): number[] | undefined {
  switch (currency.toUpperCase()) {
    case "THB":
      return [TH_VAT_RATE];
    case "SGD":
      return [...SG_GST_RATES];
    default:
      return undefined;
  }
}

function expectedVatForRate(
  bill: NormalizedBill,
  rate: number
): number {
  if (bill.taxInclusive) {
    // Inclusive: VAT = total × rate / (1 + rate)
    // Prefer pre-rounding payable base when rounding is present so SG
    // "Total Amount" + "ADD GST" matches (GST is computed before Round Amount).
    const inclusiveBase = round2(bill.total - bill.rounding);
    return round2((inclusiveBase * rate) / (1 + rate));
  }
  const net = netItemsSum(bill.items, bill.currency);
  return round2((net + bill.serviceCharge) * rate);
}

/**
 * Soft VAT/GST consistency check for locale rates (THB 7%, SGD 8%/9%).
 *
 * Never rewrites totals or tax — informational warnings only. When the grand
 * total already reconciles, a few cents of printer VAT noise should not
 * change the amount owed.
 */
export function checkVatConsistency(
  bill: NormalizedBill,
  rate?: number
): VatConsistencyResult {
  const printedVat = bill.tax;
  const currency = bill.currency.toUpperCase();

  const rates =
    rate != null && rate > 0
      ? [rate]
      : ratesForCurrency(currency);

  if (rates == null || rates.length === 0) {
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

  let best = {
    rate: rates[0]!,
    expectedVat: expectedVatForRate(bill, rates[0]!),
    delta: Number.POSITIVE_INFINITY,
  };

  for (const candidate of rates) {
    const expectedVat = expectedVatForRate(bill, candidate);
    const delta = Math.abs(expectedVat - printedVat);
    if (delta < best.delta) {
      best = { rate: candidate, expectedVat, delta };
    }
  }

  if (best.delta <= VAT_MATCH_TOLERANCE) {
    return {
      ok: true,
      skipped: false,
      expectedVat: best.expectedVat,
      printedVat,
      messages: [],
    };
  }

  // Far from the statutory rate — not soft printer noise. Skip rather than
  // warn about "expected 7% VAT" on a charge that likely isn't VAT.
  if (best.delta > VAT_SOFT_WARN_MAX_DELTA) {
    return {
      ok: true,
      skipped: true,
      expectedVat: best.expectedVat,
      printedVat,
      messages: [],
    };
  }

  const pct = Math.round(best.rate * 100);
  const mode = bill.taxInclusive ? "inclusive" : "exclusive";
  const messages = [
    `Printed VAT ${printedVat.toFixed(2)} differs from expected ${pct}% ${mode} VAT ${best.expectedVat.toFixed(2)} (off by ${best.delta.toFixed(2)}). The charged total was left unchanged.`,
  ];

  return {
    ok: false,
    skipped: false,
    expectedVat: best.expectedVat,
    printedVat,
    messages,
  };
}

/**
 * True when `amount` is within VAT_SOFT_WARN_MAX_DELTA of a known statutory
 * VAT/GST for this currency. Checks both exclusive (net+service)×rate and
 * inclusive base×rate/(1+rate). Used by reconcile to avoid labelling
 * unexplained gaps as "tax" on THB receipts with no VAT line, while still
 * treating real ABB/ADD-GST breakdown amounts as plausible tax.
 */
export function looksLikeStatutoryVat(
  amount: number,
  net: number,
  serviceCharge: number,
  currency: string,
  inclusiveBase?: number
): boolean {
  if (amount <= MONEY_TOLERANCE) return false;
  const rates = ratesForCurrency(currency);
  if (rates == null || rates.length === 0) return false;
  const exclusiveBase = net + serviceCharge;
  const inclBase =
    inclusiveBase != null && Number.isFinite(inclusiveBase)
      ? inclusiveBase
      : exclusiveBase;
  for (const rate of rates) {
    const exclusiveExpected = round2(exclusiveBase * rate);
    if (Math.abs(exclusiveExpected - amount) <= VAT_SOFT_WARN_MAX_DELTA) {
      return true;
    }
    const inclusiveExpected = round2((inclBase * rate) / (1 + rate));
    if (Math.abs(inclusiveExpected - amount) <= VAT_SOFT_WARN_MAX_DELTA) {
      return true;
    }
  }
  return false;
}
