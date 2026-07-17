import type { ExtractedBill } from "@/types/bill";

/** Absolute tolerance for money reconciliation (covers float + 1-cent OCR noise). */
export const MONEY_TOLERANCE = 0.05;

const JUNK_ITEM_NAME =
  /^(sub\s*total|total|grand\s*total|amount\s*due|balance\s*due|change|cash|card|visa|mastercard|amex|payment|paid|thank\s*you|server|table|guest|check\s*#?|chk\s*#?|order\s*#?|tax|vat|gst|service(\s*charge)?|gratuity|tip|rounding|round\s*(up|down)|cash\s*round)$/i;

export type BillCheck = {
  ok: boolean;
  /** Sum of extracted line totals. */
  itemsSum: number;
  /** |itemsSum - subtotal| */
  itemsDelta: number;
  /** Expected grand total given taxInclusive flag. */
  expectedTotal: number;
  /** |expectedTotal - total| */
  totalDelta: number;
  messages: string[];
};

export type NormalizedBill = ExtractedBill & {
  taxInclusive: boolean;
};

function roundMoney(n: number, currency: string): number {
  const digits = zeroDecimalCurrency(currency) ? 0 : 2;
  const f = 10 ** digits;
  return Math.round((Number.isFinite(n) ? n : 0) * f) / f;
}

function zeroDecimalCurrency(currency: string): boolean {
  return /^(JPY|KRW|VND|IDR|CLP|ISK)$/i.test(currency);
}

function asFinite(n: unknown, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Drop non-product lines the model sometimes leaks into `items`
 * (headers, payment rows, tax/total lines with a price).
 */
export function isJunkItemName(name: string): boolean {
  const cleaned = name.trim().replace(/[:.]+$/, "");
  if (!cleaned) return true;
  return JUNK_ITEM_NAME.test(cleaned);
}

/**
 * Strip common OCR junk glued onto product names, e.g. "Coffee 1.." → "Coffee".
 */
export function cleanItemName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    // Trailing "1.." / "2..." / lone dots left by bad OCR.
    .replace(/\s+\d+\.{2,}$/g, "")
    .replace(/[.\s]+$/g, "")
    .trim();
}

/**
 * Coerce raw model JSON into a clean ExtractedBill + taxInclusive flag.
 * Filters junk rows, rounds money, and fills missing subtotal/total when
 * the printed values were omitted.
 */
export function normalizeExtractedBill(raw: unknown): NormalizedBill {
  const parsed = (raw ?? {}) as Partial<ExtractedBill> & {
    taxInclusive?: boolean;
  };

  const currency = String(parsed.currency || "USD")
    .trim()
    .toUpperCase()
    .slice(0, 3) || "USD";

  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((it) => {
      const name = cleanItemName(String(it?.name ?? "")).slice(0, 200);
      const price = roundMoney(asFinite(it?.price), currency);
      const quantity = Math.max(1, Math.floor(asFinite(it?.quantity, 1)) || 1);
      return { name, price, quantity };
    })
    .filter((it) => it.name.length > 0 && !isJunkItemName(it.name))
    // Keep zero-price modifiers only if they look like real product notes
    // already filtered; drop empty-price junk leftovers.
    .filter((it) => it.price !== 0 || it.name.length > 0);

  const tax = roundMoney(Math.max(0, asFinite(parsed.tax)), currency);
  const serviceCharge = roundMoney(
    Math.max(0, asFinite(parsed.serviceCharge)),
    currency
  );
  const rounding = roundMoney(asFinite(parsed.rounding), currency);
  const taxInclusive = Boolean(parsed.taxInclusive);

  const itemsSum = roundMoney(
    items.reduce((s, it) => s + it.price, 0),
    currency
  );

  let subtotal = roundMoney(asFinite(parsed.subtotal), currency);
  if (subtotal === 0 && itemsSum !== 0) {
    subtotal = itemsSum;
  }

  let total = roundMoney(asFinite(parsed.total), currency);
  if (total === 0) {
    total = roundMoney(
      taxInclusive
        ? subtotal + serviceCharge + rounding
        : subtotal + tax + serviceCharge + rounding,
      currency
    );
  }

  return reconcileBill({
    currency,
    items,
    tax,
    serviceCharge,
    rounding,
    subtotal,
    total,
    taxInclusive,
  });
}

/**
 * Check that extracted numbers reconcile the way a real receipt does.
 *
 * Tax-exclusive:  sum(items) ≈ subtotal
 *                 subtotal + tax + service + rounding ≈ total
 * Tax-inclusive:  sum(items) ≈ subtotal  (tax already baked into prices)
 *                 subtotal + service + rounding ≈ total
 */
export function checkBillMath(bill: NormalizedBill): BillCheck {
  const itemsSum = roundMoney(
    bill.items.reduce((s, it) => s + it.price, 0),
    bill.currency
  );
  const itemsDelta = Math.abs(itemsSum - bill.subtotal);
  const expectedTotal = roundMoney(
    bill.taxInclusive
      ? bill.subtotal + bill.serviceCharge + bill.rounding
      : bill.subtotal + bill.tax + bill.serviceCharge + bill.rounding,
    bill.currency
  );
  const totalDelta = Math.abs(expectedTotal - bill.total);

  const messages: string[] = [];
  if (bill.items.length === 0) {
    messages.push("No line items were extracted from the receipt.");
  }
  if (itemsDelta > MONEY_TOLERANCE) {
    messages.push(
      `Item prices sum to ${itemsSum.toFixed(2)} but subtotal is ${bill.subtotal.toFixed(2)} (off by ${itemsDelta.toFixed(2)}).`
    );
  }
  if (totalDelta > MONEY_TOLERANCE) {
    messages.push(
      `Expected total ${expectedTotal.toFixed(2)} (${bill.taxInclusive ? "tax-inclusive" : "tax-exclusive"}) but printed total is ${bill.total.toFixed(2)} (off by ${totalDelta.toFixed(2)}).`
    );
  }

  return {
    ok: messages.length === 0,
    itemsSum,
    itemsDelta,
    expectedTotal,
    totalDelta,
    messages,
  };
}

function chargeDistance(a: NormalizedBill, b: NormalizedBill): number {
  return (
    Math.abs(a.tax - b.tax) +
    Math.abs(a.serviceCharge - b.serviceCharge) +
    Math.abs(a.rounding - b.rounding) +
    (a.taxInclusive === b.taxInclusive ? 0 : 1)
  );
}

/**
 * When line items already match the printed subtotal but tax/service make the
 * grand total wrong (common model mistake), trust the printed subtotal + total
 * and adjust the charge fields so the receipt arithmetic holds.
 *
 * Example from a THB cafe receipt: items=849, subtotal=849, total=898, but the
 * model returned tax+service=99 → expected 948. We collapse charges to the
 * printed gap of 49.
 */
export function reconcileBill(bill: NormalizedBill): NormalizedBill {
  const check = checkBillMath(bill);
  if (check.ok) return bill;

  // Only auto-fix charges when the item lines already look trustworthy.
  if (check.itemsDelta > MONEY_TOLERANCE) return bill;

  const { currency } = bill;
  const gap = roundMoney(
    bill.total - bill.subtotal - bill.rounding,
    currency
  );

  const candidates: NormalizedBill[] = [];

  // Flip inclusive/exclusive flag — often the only mistake.
  candidates.push({ ...bill, taxInclusive: !bill.taxInclusive });

  if (gap >= -MONEY_TOLERANCE) {
    const exclusiveGap = Math.max(0, gap);

    // Drop whichever charge equals the excess (classic double-count of a
    // ฿50 service/tip line), then fit the remainder into the other field.
    const excess = roundMoney(
      bill.tax + bill.serviceCharge - exclusiveGap,
      currency
    );
    if (
      bill.serviceCharge > MONEY_TOLERANCE &&
      Math.abs(excess - bill.serviceCharge) <= MONEY_TOLERANCE
    ) {
      candidates.push({
        ...bill,
        taxInclusive: false,
        serviceCharge: 0,
        tax: exclusiveGap,
      });
    }
    if (
      bill.tax > MONEY_TOLERANCE &&
      Math.abs(excess - bill.tax) <= MONEY_TOLERANCE
    ) {
      candidates.push({
        ...bill,
        taxInclusive: false,
        tax: 0,
        serviceCharge: exclusiveGap,
      });
    }

    // Keep service if it already fits; put the rest in tax.
    if (bill.serviceCharge <= exclusiveGap + MONEY_TOLERANCE) {
      candidates.push({
        ...bill,
        taxInclusive: false,
        tax: roundMoney(exclusiveGap - bill.serviceCharge, currency),
        serviceCharge: bill.serviceCharge,
      });
    }
    // Keep tax if it already fits; put the rest in service.
    if (bill.tax <= exclusiveGap + MONEY_TOLERANCE) {
      candidates.push({
        ...bill,
        taxInclusive: false,
        tax: bill.tax,
        serviceCharge: roundMoney(exclusiveGap - bill.tax, currency),
      });
    }

    // Scale both charges proportionally to the printed gap.
    const chargeSum = bill.tax + bill.serviceCharge;
    if (chargeSum > MONEY_TOLERANCE) {
      const scale = exclusiveGap / chargeSum;
      candidates.push({
        ...bill,
        taxInclusive: false,
        tax: roundMoney(bill.tax * scale, currency),
        serviceCharge: roundMoney(bill.serviceCharge * scale, currency),
      });
    }

    // Put the whole gap into one field.
    candidates.push({
      ...bill,
      taxInclusive: false,
      tax: exclusiveGap,
      serviceCharge: 0,
    });
    candidates.push({
      ...bill,
      taxInclusive: false,
      tax: 0,
      serviceCharge: exclusiveGap,
    });

    // Tax-inclusive: service (or rounding) absorbs the gap; tax is informational.
    candidates.push({
      ...bill,
      taxInclusive: true,
      serviceCharge: exclusiveGap,
    });
    candidates.push({
      ...bill,
      taxInclusive: true,
      serviceCharge: 0,
      rounding: roundMoney(bill.total - bill.subtotal, currency),
    });
  }

  const winners = candidates
    .map((c) => ({
      c,
      check: checkBillMath(c),
      dist: chargeDistance(c, bill),
    }))
    .filter((x) => x.check.ok)
    .sort((a, b) => {
      // When the printed total is above the subtotal, prefer tax-exclusive
      // solutions so we don't keep an "informational" tax that computeSplit
      // would still charge on top of item prices.
      const gapPositive = bill.total > bill.subtotal + MONEY_TOLERANCE;
      if (gapPositive && a.c.taxInclusive !== b.c.taxInclusive) {
        return Number(a.c.taxInclusive) - Number(b.c.taxInclusive);
      }
      return a.dist - b.dist;
    });

  return winners[0]?.c ?? bill;
}

/**
 * Human-readable brief of a failed check, used as the repair prompt payload.
 */
export function formatCheckForRepair(
  bill: NormalizedBill,
  check: BillCheck
): string {
  return [
    "Previous extraction failed the arithmetic self-check:",
    ...check.messages.map((m) => `- ${m}`),
    "",
    "Previous JSON:",
    JSON.stringify(bill, null, 2),
    "",
    "Re-read the receipt image carefully and return a corrected extraction.",
    "Remember: each item's `price` is the LINE TOTAL (not unit price).",
    "sum(items[].price) must equal subtotal.",
    "Trust the printed TOTAL / AMOUNT DUE on the receipt — do not invent extra tax or service.",
    bill.taxInclusive
      ? "Tax is inclusive: subtotal + serviceCharge + rounding must equal total (do not add tax again)."
      : "Tax is exclusive: subtotal + tax + serviceCharge + rounding must equal total.",
  ].join("\n");
}

/** Drop the taxInclusive flag when handing the bill to the rest of the app. */
export function toExtractedBill(bill: NormalizedBill): ExtractedBill {
  return {
    currency: bill.currency,
    items: bill.items,
    tax: bill.tax,
    serviceCharge: bill.serviceCharge,
    rounding: bill.rounding,
    subtotal: bill.subtotal,
    total: bill.total,
  };
}
