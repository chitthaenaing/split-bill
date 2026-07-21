import type { AdditionalCharge, ExtractedBill } from "@/types/bill";
import { looksLikeStatutoryVat } from "@/lib/vat-check";

/** Absolute tolerance for money reconciliation (covers float + 1-cent OCR noise). */
export const MONEY_TOLERANCE = 0.05;

const JUNK_ITEM_NAME =
  /^(sub[\s-]*total|total(\s*amount)?|grand\s*total|amount\s*due|balance\s*due|before\s*(vat|tax|gst)|after\s*(vat|tax|gst)|change|cash|card|visa|mastercard|amex|payment(\s*amount)?|paid|thank\s*you|server|table|guest|check\s*#?|chk\s*#?|order\s*#?|tax|vat(\s*\(?\s*\d+\s*%\s*\)?)?|gst(\s*\(?\s*\d+\s*%\s*\)?)?|add\s*gst|service(\s*charge)?(\s*\(?\s*\d+\s*%\s*\)?)?|gratuity|tip|rounding|round\s*(up|down|amount)|cash\s*round|total\s*savings|items?:?\s*\d+)$/i;

/**
 * Fee lines that belong in `additionalCharges`, not as pickable items.
 * Used both to salvage mis-placed model rows and to reject them from items.
 */
const ADDITIONAL_CHARGE_ITEM_NAME =
  /^(delivery(\s*(fee|charge))?|packag(e|ing)(\s*fee)?|take[\s-]?away(\s*(fee|charge))?|bag(\s*fee)?|plastic(\s*bag)?(\s*fee)?|cover(\s*charge)?|corkage|convenience(\s*fee)?|booking(\s*fee)?|platform(\s*fee)?|app(\s*fee)?|handling(\s*fee)?|container(\s*fee)?|surcharge|room\s*charge|extra\s*charge|additional\s*charge|misc(\.|ellaneous)?(\s*(fee|charge))?)$/i;

export type BillCheck = {
  ok: boolean;
  /** Sum of non-negative line totals (should match printed subtotal). */
  itemsSum: number;
  /** |itemsSum - subtotal| */
  itemsDelta: number;
  /** Sum of line quantities (units). */
  quantitySum: number;
  /** |quantitySum - printedItemUnits| when a printed count is present; else 0. */
  quantityDelta: number;
  /** Expected grand total given taxInclusive flag. */
  expectedTotal: number;
  /** |expectedTotal - total| */
  totalDelta: number;
  messages: string[];
};

export type NormalizedBill = ExtractedBill & {
  taxInclusive: boolean;
  /**
   * Printed unit count from an Items/Qty footer when present (e.g. Items: 7).
   * 0 means absent — quantity-sum checks are skipped.
   */
  printedItemUnits: number;
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
 * Promotion / discount lines with a negative price are kept.
 */
export function isJunkItemName(name: string, price = 0): boolean {
  const cleaned = name.trim().replace(/[:.]+$/, "");
  if (!cleaned) return true;
  // Allow "Discount" / "Promotion …" when they carry a negative amount.
  if (price < 0) return false;
  return JUNK_ITEM_NAME.test(cleaned);
}

/** True when a positive-priced row looks like a bill-level fee, not a product. */
export function isAdditionalChargeName(name: string): boolean {
  const cleaned = name.trim().replace(/[:.]+$/, "");
  if (!cleaned) return false;
  return ADDITIONAL_CHARGE_ITEM_NAME.test(cleaned);
}

/** Sum of additional fee amounts (delivery, packaging, …). */
export function additionalChargesSum(
  charges: AdditionalCharge[] | undefined,
  currency: string
): number {
  return roundMoney(
    (charges ?? []).reduce((s, c) => s + Math.max(0, c.amount || 0), 0),
    currency
  );
}

/**
 * Coerce raw additionalCharges into a clean list. Skips empty names and
 * non-positive amounts.
 */
export function normalizeAdditionalCharges(
  raw: unknown,
  currency: string
): AdditionalCharge[] {
  if (!Array.isArray(raw)) return [];
  const out: AdditionalCharge[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { name?: unknown; amount?: unknown };
    const name = cleanItemName(String(e.name ?? "")).slice(0, 80);
    const amount = roundMoney(Math.max(0, asFinite(e.amount)), currency);
    if (!name || amount <= MONEY_TOLERANCE) continue;
    // Never let tax/service/rounding labels leak into this bucket.
    if (JUNK_ITEM_NAME.test(name)) continue;
    out.push({ name, amount });
  }
  return out;
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
 * When the model leaves quantity at 1 but glues a leading qty digit onto the
 * name ("2 Kya Saint"), lift that digit into quantity and strip it from name.
 *
 * Only applies when quantity is still the default 1 — never overrides an
 * explicit multi-qty. Skips names that look like products that start with a
 * number+hyphen/plus ("7-Up", "100 Plus") rather than a qty column.
 */
export function liftLeadingQuantity(
  name: string,
  quantity: number
): { name: string; quantity: number } {
  if (quantity !== 1) return { name, quantity };
  const m = /^(\d{1,2})\s+(\p{L}.*)$/u.exec(name);
  if (!m) return { name, quantity };
  const leading = Number(m[1]);
  if (!Number.isFinite(leading) || leading < 2) return { name, quantity };
  return { name: m[2].trim(), quantity: leading };
}

/**
 * Normalize an optional English gloss. Returns undefined when empty or when it
 * duplicates the original name (case-insensitive).
 */
export function cleanTranslatedName(
  translated: unknown,
  original: string
): string | undefined {
  if (typeof translated !== "string") return undefined;
  const cleaned = cleanItemName(translated).slice(0, 200);
  if (!cleaned) return undefined;
  if (cleaned.localeCompare(original, undefined, { sensitivity: "accent" }) === 0) {
    return undefined;
  }
  return cleaned;
}

/**
 * True when a receipt name uses a non-Latin script that English speakers often
 * want a gloss for (Myanmar, Thai, CJK, Hangul, Arabic, etc.).
 */
export function likelyNeedsTranslation(name: string): boolean {
  try {
    return /\p{Script=Mymr}|\p{Script=Thai}|\p{Script=Hani}|\p{Script=Hira}|\p{Script=Kana}|\p{Script=Hang}|\p{Script=Arab}|\p{Script=Deva}|\p{Script=Khmer}|\p{Script=Laoo}/u.test(
      name
    );
  } catch {
    // Older runtimes without Unicode property escapes: any non-ASCII letter-ish.
    return /[^\x00-\x7F]/.test(name);
  }
}

/**
 * Resolve ISO currency from the model. Empty / missing / junk → THB.
 * Keeps an explicit USD (or any other code) when the model extracted one.
 */
export function resolveBillCurrency(rawCurrency: unknown): string {
  const currency = String(rawCurrency ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
  return currency || "THB";
}

/** Net of every line (products + negative promotions). */
export function netItemsSum(
  items: Array<{ price: number }>,
  currency: string
): number {
  return roundMoney(
    items.reduce((s, it) => s + (it.price || 0), 0),
    currency
  );
}

/** Sum of product lines only (price ≥ 0) — matches a printed pre-discount subtotal. */
export function productItemsSum(
  items: Array<{ price: number }>,
  currency: string
): number {
  return roundMoney(
    items.reduce((s, it) => s + Math.max(0, it.price || 0), 0),
    currency
  );
}

/** Grand-total equation used for validation and repair. */
export function expectedGrandTotal(bill: NormalizedBill): number {
  // Prefer the net of extracted lines (includes minus promotions). Fall back
  // to printed subtotal - discount field for older payloads.
  const net = netItemsSum(bill.items, bill.currency);
  const extras = additionalChargesSum(bill.additionalCharges, bill.currency);
  const base =
    bill.items.length > 0
      ? net
      : roundMoney(bill.subtotal - (bill.discount || 0), bill.currency);
  return roundMoney(
    bill.taxInclusive
      ? base + bill.serviceCharge + extras + bill.rounding
      : base + bill.tax + bill.serviceCharge + extras + bill.rounding,
    bill.currency
  );
}

/**
 * Coerce raw model JSON into a clean ExtractedBill + taxInclusive flag.
 * Keeps promotion lines as negative-priced items (not a separate total
 * discount). If the model only filled `discount`, materialize it as an item.
 */
export function normalizeExtractedBill(raw: unknown): NormalizedBill {
  const parsed = (raw ?? {}) as Partial<ExtractedBill> & {
    taxInclusive?: boolean;
    printedItemUnits?: unknown;
  };

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const currency = resolveBillCurrency(parsed.currency);

  const items: Array<{
    name: string;
    nameTranslated?: string;
    price: number;
    quantity: number;
  }> = [];
  const salvagedCharges: AdditionalCharge[] = [];
  for (const it of rawItems) {
    const price = roundMoney(asFinite(it?.price), currency);
    let quantity = Math.max(1, Math.floor(asFinite(it?.quantity, 1)) || 1);
    // Keep priced rows even when the model couldn't read a non-Latin name.
    let cleaned = cleanItemName(String(it?.name ?? "")).slice(0, 200);
    const lifted = liftLeadingQuantity(cleaned, quantity);
    cleaned = lifted.name;
    quantity = lifted.quantity;
    const name =
      cleaned || (price !== 0 ? "Unreadable item" : "");
    if (!name || isJunkItemName(name, price)) continue;
    // Delivery / packaging / cover / etc. belong in additionalCharges, not
    // as pickable items — salvage when the model mis-places them.
    if (price > MONEY_TOLERANCE && isAdditionalChargeName(name)) {
      salvagedCharges.push({ name: name.slice(0, 80), amount: price });
      continue;
    }
    const rawItem = it as { nameTranslated?: unknown };
    const nameTranslated = cleanTranslatedName(rawItem?.nameTranslated, name);
    items.push(
      nameTranslated ? { name, nameTranslated, price, quantity } : { name, price, quantity }
    );
  }

  // Model sometimes puts the promotion only in `discount` — show it as a
  // minus line on the bill instead of applying it again on the total.
  const discountField = roundMoney(
    Math.max(0, asFinite(parsed.discount)),
    currency
  );
  const hasNegativeItem = items.some((it) => it.price < 0);
  if (discountField > MONEY_TOLERANCE && !hasNegativeItem) {
    items.push({
      name: "Discount",
      price: -discountField,
      quantity: 1,
    });
  }

  const tax = roundMoney(Math.max(0, asFinite(parsed.tax)), currency);
  const serviceCharge = roundMoney(
    Math.max(0, asFinite(parsed.serviceCharge)),
    currency
  );
  const rounding = roundMoney(asFinite(parsed.rounding), currency);
  const taxInclusive = Boolean(parsed.taxInclusive);
  const printedItemUnits = Math.max(
    0,
    Math.floor(asFinite(parsed.printedItemUnits, 0)) || 0
  );

  const fromModel = normalizeAdditionalCharges(
    (parsed as { additionalCharges?: unknown }).additionalCharges,
    currency
  );
  // Prefer explicit model charges; append salvaged ones that aren't duplicates.
  const additionalCharges = [...fromModel];
  for (const c of salvagedCharges) {
    const dup = additionalCharges.some(
      (x) =>
        x.name.localeCompare(c.name, undefined, { sensitivity: "accent" }) ===
          0 && Math.abs(x.amount - c.amount) <= MONEY_TOLERANCE
    );
    if (!dup) additionalCharges.push(c);
  }

  const productSum = productItemsSum(items, currency);

  let subtotal = roundMoney(asFinite(parsed.subtotal), currency);
  if (subtotal === 0 && productSum !== 0) {
    subtotal = productSum;
  }

  let total = roundMoney(asFinite(parsed.total), currency);
  const draft: NormalizedBill = {
    currency,
    items,
    tax,
    serviceCharge,
    rounding,
    additionalCharges,
    // Discount is represented as a negative item; keep field at 0 so the
    // totals panel never subtracts it a second time.
    discount: 0,
    subtotal,
    total,
    taxInclusive,
    printedItemUnits,
  };

  if (total === 0) {
    draft.total = expectedGrandTotal(draft);
  }

  return reconcileBill(draft);
}

/**
 * Check that extracted numbers reconcile the way a real receipt does.
 *
 * Product lines (price ≥ 0) should match the printed subtotal. Minus
 * promotion lines then reduce the net before tax/service:
 *   sum(price ≥ 0) ≈ subtotal
 *   sum(all prices) + tax + service + rounding ≈ total   (tax-exclusive)
 */
export function checkBillMath(bill: NormalizedBill): BillCheck {
  const itemsSum = productItemsSum(bill.items, bill.currency);
  const itemsDelta = Math.abs(itemsSum - bill.subtotal);
  const quantitySum = bill.items.reduce(
    (s, it) => s + Math.max(0, Math.floor(it.quantity || 0)),
    0
  );
  const quantityDelta =
    bill.printedItemUnits > 0
      ? Math.abs(quantitySum - bill.printedItemUnits)
      : 0;
  const expectedTotal = expectedGrandTotal(bill);
  const totalDelta = Math.abs(expectedTotal - bill.total);

  const messages: string[] = [];
  if (bill.items.length === 0) {
    messages.push("No line items found on the receipt.");
  }
  if (itemsDelta > MONEY_TOLERANCE) {
    messages.push(
      `Extracted items ${itemsSum.toFixed(2)} ≠ receipt subtotal ${bill.subtotal.toFixed(2)} (off by ${itemsDelta.toFixed(2)}).`
    );
  }
  if (bill.printedItemUnits > 0 && quantityDelta > 0) {
    messages.push(
      `Extracted quantities sum to ${quantitySum} ≠ receipt Items count ${bill.printedItemUnits}. Re-read the leftmost qty digit on each item row.`
    );
  }
  if (totalDelta > MONEY_TOLERANCE) {
    messages.push(
      `Extracted total ${expectedTotal.toFixed(2)} (${bill.taxInclusive ? "incl. tax" : "excl. tax"}) ≠ receipt total ${bill.total.toFixed(2)} (off by ${totalDelta.toFixed(2)}).`
    );
  }

  return {
    ok: messages.length === 0,
    itemsSum,
    itemsDelta,
    quantitySum,
    quantityDelta,
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
    Math.abs(
      additionalChargesSum(a.additionalCharges, a.currency) -
        additionalChargesSum(b.additionalCharges, b.currency)
    ) +
    Math.abs(netItemsSum(a.items, a.currency) - netItemsSum(b.items, b.currency)) +
    (a.taxInclusive === b.taxInclusive ? 0 : 1) +
    Math.abs(a.items.length - b.items.length) * 0.01
  );
}

/**
 * When product lines match the printed subtotal but the grand total is short,
 * prefer inserting a missing minus promotion line (keeping VAT/service) over
 * rewriting tax or service.
 */
export function reconcileBill(bill: NormalizedBill): NormalizedBill {
  const check = checkBillMath(bill);
  if (check.ok) return bill;

  if (check.itemsDelta > MONEY_TOLERANCE) return bill;

  const { currency } = bill;
  const candidates: NormalizedBill[] = [];
  const extras = additionalChargesSum(bill.additionalCharges, currency);

  candidates.push({ ...bill, taxInclusive: !bill.taxInclusive });

  const net = netItemsSum(bill.items, currency);
  const exclusiveExpected = roundMoney(
    net + bill.tax + bill.serviceCharge + extras + bill.rounding,
    currency
  );
  const overshoot = roundMoney(exclusiveExpected - bill.total, currency);

  // When exclusive math overshoots by exactly the printed VAT/GST (or
  // VAT+service), the receipt is tax-inclusive — Net/VAT/"ADD GST" are a
  // breakdown, not a missing promotion. Inventing "Discount -51.91" equal to
  // VAT is wrong (Thai ABB, Singapore GST-inclusive retail).
  const overshootIsInclusiveVat =
    (bill.tax > MONEY_TOLERANCE &&
      Math.abs(overshoot - bill.tax) <= MONEY_TOLERANCE) ||
    (bill.tax + bill.serviceCharge > MONEY_TOLERANCE &&
      Math.abs(overshoot - (bill.tax + bill.serviceCharge)) <= MONEY_TOLERANCE);

  // Missing minus line (e.g. Promotion Free Tea -50).
  if (
    overshoot > MONEY_TOLERANCE &&
    !overshootIsInclusiveVat &&
    !bill.items.some((it) => it.price < 0)
  ) {
    candidates.push({
      ...bill,
      taxInclusive: false,
      items: [
        ...bill.items,
        {
          name: "Discount",
          price: -overshoot,
          quantity: 1,
        },
      ],
    });
  }

  const inclusiveExpected = roundMoney(
    net + bill.serviceCharge + extras + bill.rounding,
    currency
  );
  const inclusiveOvershoot = roundMoney(inclusiveExpected - bill.total, currency);
  if (
    inclusiveOvershoot > MONEY_TOLERANCE &&
    !bill.items.some((it) => it.price < 0)
  ) {
    candidates.push({
      ...bill,
      taxInclusive: true,
      items: [
        ...bill.items,
        {
          name: "Discount",
          price: -inclusiveOvershoot,
          quantity: 1,
        },
      ],
    });
  }

  // Prefer an explicit inclusive flip that clears informational VAT so the
  // downstream UI never adds it on top of already-inclusive item prices.
  if (overshootIsInclusiveVat) {
    candidates.push({
      ...bill,
      taxInclusive: true,
      tax: bill.tax,
      serviceCharge: bill.serviceCharge,
    });
  }

  // Remaining gap after net items + known extra fees (what tax+service should cover).
  const gap = roundMoney(bill.total - net - extras - bill.rounding, currency);

  if (gap >= -MONEY_TOLERANCE) {
    const exclusiveGap = Math.max(0, gap);

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

    if (bill.serviceCharge <= exclusiveGap + MONEY_TOLERANCE) {
      candidates.push({
        ...bill,
        taxInclusive: false,
        tax: roundMoney(exclusiveGap - bill.serviceCharge, currency),
        serviceCharge: bill.serviceCharge,
      });
    }
    if (bill.tax <= exclusiveGap + MONEY_TOLERANCE) {
      candidates.push({
        ...bill,
        taxInclusive: false,
        tax: bill.tax,
        serviceCharge: roundMoney(exclusiveGap - bill.tax, currency),
      });
    }

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

    // Prefer serviceCharge for unexplained gaps that are not ~statutory VAT
    // (common on Thai/SEA POS receipts with bare totals and no tax line).
    // Inventing tax=gap then trips the THB 7% soft check with a confusing warning.
    const gapIsVat = looksLikeStatutoryVat(
      exclusiveGap,
      net,
      bill.serviceCharge,
      currency,
      bill.total
    );
    if (gapIsVat) {
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
    } else {
      candidates.push({
        ...bill,
        taxInclusive: false,
        tax: 0,
        serviceCharge: exclusiveGap,
      });
      candidates.push({
        ...bill,
        taxInclusive: false,
        tax: exclusiveGap,
        serviceCharge: 0,
      });
    }
    candidates.push({
      ...bill,
      taxInclusive: true,
      serviceCharge: exclusiveGap,
    });
  }

  const winners = candidates
    .map((c) => ({
      c,
      check: checkBillMath(c),
      dist: chargeDistance(c, bill),
      addedMinus: c.items.some((it) => it.price < 0) &&
        !bill.items.some((it) => it.price < 0)
        ? 0
        : 1,
      // Prefer not labelling a non-VAT gap as tax (HTOO's Curry-style).
      // Inclusive ABB/ADD-GST amounts still count as plausible via the
      // inclusive statutory check (pass bill.total as the inclusive base).
      taxPlausible:
        c.tax <= MONEY_TOLERANCE ||
        looksLikeStatutoryVat(
          c.tax,
          net,
          c.serviceCharge,
          currency,
          c.total
        )
          ? 0
          : 1,
    }))
    .filter((x) => x.check.ok)
    .sort((a, b) => {
      if (a.addedMinus !== b.addedMinus) return a.addedMinus - b.addedMinus;
      if (a.taxPlausible !== b.taxPlausible) {
        return a.taxPlausible - b.taxPlausible;
      }
      const gapPositive = bill.total > net + MONEY_TOLERANCE;
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
  const missingProductsHint =
    check.itemsDelta > MONEY_TOLERANCE
      ? [
          "Product lines do not match the printed subtotal — a priced product row is likely missing or mis-read.",
          "Re-scan every amount in the Items / price column top-to-bottom. Common misses: small drinks/tea/sides, bilingual English lines between Myanmar/Thai dish names, and multi-qty lines like \"4  Daily Special  396.00\" sitting between two similar salads.",
          "Do not merge a priced English label into the previous dish as a translation or modifier — a distinct price means a distinct item.",
          "Two rows with the same dish name and two prices are TWO items (different modifiers). Keep both.",
          "If a name is illegible but the price is clear, keep the row as name \"Unreadable item\" with that price. Never drop a priced line to force the math.",
        ]
      : [];

  const quantityHint =
    bill.printedItemUnits > 0 && check.quantityDelta > 0
      ? [
          `Quantity units (${check.quantitySum}) do not match the printed Items count (${bill.printedItemUnits}).`,
          "Re-read the leftmost quantity digit on EVERY item row (Thai/SEA POS often prints \"2  ItemName  100.00\").",
          "Do not confuse Table / Guests counts above the items with line quantities.",
          "Do not move a quantity digit from one product onto a different product name to fake the Items count.",
          "Keep each item's `price` as the LINE TOTAL; only correct `quantity` (and strip a leading qty digit from `name` if you glued it there).",
          "Update printedItemUnits only if you mis-read the Items footer — usually the footer is correct and a line quantity is wrong.",
        ]
      : [];

  const serviceRateHint = impliedSubtotalHints(bill);

  return [
    "Previous extraction failed the arithmetic self-check:",
    ...check.messages.map((m) => `- ${m}`),
    "",
    "Previous JSON:",
    JSON.stringify(bill, null, 2),
    "",
    "Re-read the receipt image carefully and return a corrected extraction.",
    "Remember: each item's `price` is the LINE TOTAL (not unit price).",
    "sum(items with price ≥ 0) must equal subtotal.",
    ...missingProductsHint,
    ...quantityHint,
    ...serviceRateHint,
    "Promotion / Discount / Free-item lines belong in items with a NEGATIVE price (e.g. -50). Do not omit them.",
    "Trust the printed TOTAL / AMOUNT DUE on the receipt — do not invent extra tax or service.",
    "Put delivery / packaging / cover / bag / corkage / similar fees in additionalCharges with their printed labels — not in items or serviceCharge.",
    bill.taxInclusive
      ? "Tax is inclusive: sum(all item prices) + serviceCharge + sum(additionalCharges) + rounding must equal total."
      : "Tax is exclusive: sum(all item prices) + tax + serviceCharge + sum(additionalCharges) + rounding must equal total.",
  ].join("\n");
}

/**
 * When Service Charge looks like exactly 5%/10% of a larger base than the
 * extracted items, call out the missing product value for repair.
 */
export function impliedSubtotalHints(bill: NormalizedBill): string[] {
  if (bill.serviceCharge <= MONEY_TOLERANCE) return [];
  const itemsSum = productItemsSum(bill.items, bill.currency);
  if (itemsSum <= MONEY_TOLERANCE) return [];

  const hints: string[] = [];
  for (const rate of [0.05, 0.1]) {
    const implied = bill.serviceCharge / rate;
    const impliedRounded =
      Math.round(implied * 100) / 100;
    if (Math.abs(implied - impliedRounded) > MONEY_TOLERANCE) continue;
    if (impliedRounded <= itemsSum + MONEY_TOLERANCE) continue;
    const missing = Math.round((impliedRounded - itemsSum) * 100) / 100;
    const pct = Math.round(rate * 100);
    hints.push(
      `Service Charge ${bill.serviceCharge.toFixed(2)} looks like ${pct}% of ~${impliedRounded.toFixed(2)}, but extracted items only sum to ${itemsSum.toFixed(2)} (short by ~${missing.toFixed(2)}). Find the missing priced row(s) — often a multi-qty "Daily Special" / set menu between similar dishes.`
    );
    break;
  }
  return hints;
}

/**
 * Drop the taxInclusive flag when handing the bill to the rest of the app.
 *
 * On tax-inclusive receipts (Thai ABB "Included Vat", SG "ADD GST", EU/AU/JP
 * incl. GST/VAT) the printed VAT/Net lines are a breakdown of prices that
 * already include tax. The split UI always adds `tax` on top of selected
 * items, so informational VAT/GST must be cleared here — otherwise a ฿793
 * inclusive bill becomes ฿844.91, or an S$44.45 bill becomes S$47.74.
 */
export function toExtractedBill(bill: NormalizedBill): ExtractedBill {
  return {
    currency: bill.currency,
    items: bill.items,
    tax: bill.taxInclusive ? 0 : bill.tax,
    serviceCharge: bill.serviceCharge,
    rounding: bill.rounding,
    additionalCharges: bill.additionalCharges ?? [],
    discount: 0,
    subtotal: bill.subtotal,
    total: bill.total,
  };
}
