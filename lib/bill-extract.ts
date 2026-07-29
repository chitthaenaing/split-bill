import type { AdditionalCharge, ExtractedBill } from "@/types/bill";
import {
  looksLikeStatutoryVat,
  ratesForCurrency,
  VAT_MATCH_TOLERANCE,
} from "@/lib/vat-check";
import {
  classifyRepairModes,
  repairModeHints,
} from "@/lib/repair-modes";

/** Absolute tolerance for money reconciliation (covers float + 1-cent OCR noise). */
export const MONEY_TOLERANCE = 0.05;

const JUNK_ITEM_NAME =
  /^(sub[\s-]*total|total(\s*amount)?|grand\s*total|amount\s*due|balance\s*due|before\s*(vat|tax|gst)|after\s*(vat|tax|gst)|change|cash|card|visa|mastercard|amex|payment(\s*amount)?|paid|thank\s*you|server|table|guest|check\s*#?|chk\s*#?|order\s*#?|tax|vat(\s*\(?\s*\d+\s*%\s*\)?)?|gst(\s*\(?\s*\d+\s*%\s*\)?)?|add\s*gst|service(\s*charge)?(\s*\(?\s*\d+\s*%\s*\)?)?|gratuity|tip|rounding|round\s*(up|down|amount)|cash\s*round|total\s*savings|items?:?\s*\d+)$/i;

/**
 * Repair / workshop lines that must stay as pickable items — never junked as
 * F&B "Service" and never salvaged into additionalCharges.
 */
const LABOR_OR_PARTS_ITEM_NAME =
  /ค่าแรง|ค่าบริการ|ค่าตรวจ|ค่ามัดจำ|labor|labour|technician|mechanic|workshop|deposit|round[\s-]*trip|gasket|piston|spark\s*plug|drive\s*belt|air\s*filter|oil\s*filter|roller|o-?ring|final\s*gear|engine\s*oil|throttle|handlebar|exhaust|ปะเก็น|ประเก็น|หัวเทียน|สายพาน|กรอง|ไส้กรอง|เม็ด|น้ำมันเครื่อง|ท่อไอเสีย|แฮนด์|ไป\s*-?\s*กลับ|ฝาข้าง|ชุดปะ/i;

/**
 * Fee lines that belong in `additionalCharges`, not as pickable items.
 * Used both to salvage mis-placed model rows and to reject them from items.
 */
const ADDITIONAL_CHARGE_ITEM_NAME =
  /^(delivery(\s*(fee|charge))?|packag(e|ing)(\s*fee)?|take[\s-]?away(\s*(fee|charge))?|bag(\s*fee)?|plastic(\s*bag)?(\s*fee)?|cover(\s*charge)?|corkage|convenience(\s*fee)?|booking(\s*fee)?|platform(\s*fee)?|app(\s*fee)?|handling(\s*fee)?|container(\s*fee)?|surcharge|room\s*charge|extra\s*charge|additional\s*charge|misc(\.|ellaneous)?(\s*(fee|charge))?)$/i;

/**
 * Bill-level discounts / tier promos that belong in `discount` (totals panel),
 * not as pickable items. Free-item promos ("Promotion Free Tea") stay in items
 * so the person who got the freebie can claim them.
 */
const BILL_LEVEL_DISCOUNT_NAME =
  /^(discount(\s*\(?\s*\d+\s*%?\s*\)?)?|total\s*savings|member(ship)?(\s+\w+)*\s*disc\w*|loyalty(\s+\w+)*\s*disc\w*|voucher|coupon|promo(tion)?(\s+tier)?(\s*disc\w*)?|tier\s*disc\w*|promo(tion)?\s*\d+\s*%)$/i;

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
 * True for garage/repair labor and parts labels that must remain pickable
 * items (not F&B serviceCharge junk, not delivery-style additionalCharges).
 */
export function isLaborOrPartsItemName(name: string): boolean {
  const cleaned = name.trim().replace(/[:.]+$/, "");
  if (!cleaned) return false;
  return LABOR_OR_PARTS_ITEM_NAME.test(cleaned);
}

/**
 * Bare POS product / PLU / SKU codes (e.g. S&P "1133371101") with no price.
 * These often appear as their own qty-column row and are counted in an
 * "Items: N" footer, but they are not pickable products — keeping them (or
 * inflating other rows' quantities to make Items: N match) corrupts qty.
 */
export function isBareProductCodeName(name: string): boolean {
  const cleaned = name.trim().replace(/[:.\s]+$/g, "");
  if (!cleaned) return false;
  // Pure digits, optionally with spaces/dashes between digit groups.
  return /^[0-9][0-9\s-]{2,}$/.test(cleaned);
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
  // Garage labor / parts must never be dropped as F&B "Service".
  if (isLaborOrPartsItemName(cleaned)) return false;
  // Zero-priced PLU/SKU code rows are not menu items.
  if (Math.abs(price) <= MONEY_TOLERANCE && isBareProductCodeName(cleaned)) {
    return true;
  }
  return JUNK_ITEM_NAME.test(cleaned);
}

/** True when a positive-priced row looks like a bill-level fee, not a product. */
export function isAdditionalChargeName(name: string): boolean {
  const cleaned = name.trim().replace(/[:.]+$/, "");
  if (!cleaned) return false;
  // Never demote repair labor/parts into additionalCharges.
  if (isLaborOrPartsItemName(cleaned)) return false;
  return ADDITIONAL_CHARGE_ITEM_NAME.test(cleaned);
}

/**
 * True for bill-level discount / tier / voucher lines that should live in the
 * totals `discount` field (positive amount off), not as pickable items.
 * Free-item promotions ("Promotion Free Tea") return false so they stay
 * selectable minus lines.
 */
export function isBillLevelDiscountName(name: string): boolean {
  const cleaned = name.trim().replace(/[:.]+$/, "");
  if (!cleaned) return false;
  // Named freebies stay pickable — only one diner claims them.
  if (/\bfree\b/i.test(cleaned)) return false;
  return BILL_LEVEL_DISCOUNT_NAME.test(cleaned);
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
 * Staple / side lines that commonly print qty 2+ for real (Rice ×2).
 * When Items:N is short vs sum(qty), prefer deflating a non-staple
 * over-read (e.g. Pone Mhan 1→2) instead of touching Rice.
 */
export function isStapleSideItemName(name: string): boolean {
  const cleaned = name.trim().replace(/[:.]+$/g, "");
  if (!cleaned) return false;
  return /^(steamed\s+)?rice$|^plain\s+rice$|^white\s+rice$|^ข้าว(สวย|เปล่า)?$|^ice$|^น้ำแข็ง$|^water$|^น้ำเปล่า$/i.test(
    cleaned
  );
}

/**
 * Sold-unit count for Items:N reconciliation — product lines only.
 * Promotion / discount rows (price < 0) are pickable minus lines but are not
 * counted in POS "Items: N" footers.
 */
export function productQuantitySum(
  items: Array<{ price?: number; quantity?: number }>
): number {
  return items.reduce((s, it) => {
    if ((it.price || 0) < 0) return s;
    return s + Math.max(0, Math.floor(it.quantity || 0));
  }, 0);
}

/**
 * When money already reconciles but sum(qty) exceeds Items:N, shrink an
 * over-read quantity. FoodStory OCR often turns a leftmost "1" into "2"
 * (Brew/Shwe "Pone Mhan" biased by other receipts that truly have qty 2).
 *
 * Only runs when line totals already match the printed subtotal — quantity
 * does not affect price math here (prices are line totals) — so a pure
 * Items-footer overcount is safe to correct locally.
 *
 * Minus promotion lines are ignored in the quantity sum (and never deflated).
 */
export function deflateQuantityOvercount<
  T extends { name: string; quantity: number; price?: number },
>(
  items: T[],
  printedItemUnits: number,
  /** When false, only the high-confidence excess===1 non-staple 2→1 flip runs. */
  moneyMatches = true
): T[] {
  if (printedItemUnits <= 0 || items.length === 0) return items;

  const quantitySum = productQuantitySum(items);
  const excess = quantitySum - printedItemUnits;
  if (excess <= 0) return items;

  // Prefer a unique qty===2 non-staple when excess is 1 (classic 1→2 OCR).
  // Safe even when a priced row is still missing — Items:N is trusted over a
  // memorized "Pone Mhan ×2" from a different receipt.
  if (excess === 1) {
    const twos = items
      .map((it, index) => ({ it, index }))
      .filter(
        ({ it }) =>
          (it.price ?? 0) >= 0 && Math.floor(it.quantity || 0) === 2
      );
    const nonStaple = twos.filter(({ it }) => !isStapleSideItemName(it.name));
    const pick =
      nonStaple.length === 1 ? nonStaple[0] : twos.length === 1 ? twos[0] : null;
    if (pick) {
      const next = items.slice();
      next[pick.index] = { ...pick.it, quantity: 1 };
      return next;
    }
  }

  if (!moneyMatches) return items;

  // Exactly one multi-qty line can absorb the entire excess.
  const multis = items
    .map((it, index) => ({ it, index }))
    .filter(
      ({ it }) => (it.price ?? 0) >= 0 && Math.floor(it.quantity || 0) >= 2
    );
  if (multis.length === 1) {
    const { it, index } = multis[0];
    const q = Math.floor(it.quantity || 0);
    if (q - excess >= 1) {
      const next = items.slice();
      next[index] = { ...it, quantity: q - excess };
      return next;
    }
  }

  return items;
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
  // Net of extracted lines (includes free-item minus promos) minus any
  // bill-level discount field. Fall back to printed subtotal - discount when
  // there are no items yet.
  const net = netItemsSum(bill.items, bill.currency);
  const discount = Math.max(0, bill.discount || 0);
  const extras = additionalChargesSum(bill.additionalCharges, bill.currency);
  const base =
    bill.items.length > 0
      ? roundMoney(net - discount, bill.currency)
      : roundMoney(bill.subtotal - discount, bill.currency);
  return roundMoney(
    bill.taxInclusive
      ? base + bill.serviceCharge + extras + bill.rounding
      : base + bill.tax + bill.serviceCharge + extras + bill.rounding,
    bill.currency
  );
}

/**
 * Coerce raw model JSON into a clean ExtractedBill + taxInclusive flag.
 * Bill-level Discount / Tier promo lines go into `discount` (totals panel).
 * Free-item promos stay as negative-priced pickable items.
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
  /** Absolute amounts salvaged from bill-level discount item rows. */
  let salvagedDiscount = 0;
  /** Bare PLU/SKU rows dropped (also counted in some Items: N footers). */
  let droppedBareProductCodes = 0;
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
    if (!name || isJunkItemName(name, price)) {
      if (name && isBareProductCodeName(name) && Math.abs(price) <= MONEY_TOLERANCE) {
        droppedBareProductCodes += Math.max(1, quantity);
      }
      continue;
    }
    // Delivery / packaging / cover / etc. belong in additionalCharges, not
    // as pickable items — salvage when the model mis-places them.
    if (price > MONEY_TOLERANCE && isAdditionalChargeName(name)) {
      salvagedCharges.push({ name: name.slice(0, 80), amount: price });
      continue;
    }
    // Bill-level Discount / Tier promo → totals `discount`, not a pickable row.
    if (price < -MONEY_TOLERANCE && isBillLevelDiscountName(name)) {
      salvagedDiscount = roundMoney(
        salvagedDiscount + Math.abs(price),
        currency
      );
      continue;
    }
    const rawItem = it as { nameTranslated?: unknown };
    const nameTranslated = cleanTranslatedName(rawItem?.nameTranslated, name);
    items.push(
      nameTranslated ? { name, nameTranslated, price, quantity } : { name, price, quantity }
    );
  }

  // Prefer an explicit model `discount` when present; otherwise use amounts
  // salvaged from bill-level minus rows. Do not also keep those as items.
  const discountField = roundMoney(
    Math.max(0, asFinite(parsed.discount)),
    currency
  );
  const discount = roundMoney(
    Math.max(discountField, salvagedDiscount),
    currency
  );

  const tax = roundMoney(Math.max(0, asFinite(parsed.tax)), currency);
  const serviceCharge = roundMoney(
    Math.max(0, asFinite(parsed.serviceCharge)),
    currency
  );
  const rounding = roundMoney(asFinite(parsed.rounding), currency);
  const taxInclusive = Boolean(parsed.taxInclusive);
  let printedItemUnits = Math.max(
    0,
    Math.floor(asFinite(parsed.printedItemUnits, 0)) || 0
  );
  // Items: N often counts bare PLU/SKU rows. After dropping those, shrink the
  // footer count so quantity reconciliation does not inflate real dish qtys
  // (S&P "1133371101" between salad and coffee → Pone Mhan/Tempura qty bugs).
  if (printedItemUnits > 0 && droppedBareProductCodes > 0) {
    printedItemUnits = Math.max(0, printedItemUnits - droppedBareProductCodes);
  }

  const fromModel = normalizeAdditionalCharges(
    (parsed as { additionalCharges?: unknown }).additionalCharges,
    currency
  );
  // Prefer explicit model charges; append salvaged ones that aren't duplicates.
  // Labor/parts that the model stuck in additionalCharges move back to items.
  const additionalCharges: AdditionalCharge[] = [];
  for (const c of [...fromModel, ...salvagedCharges]) {
    if (isLaborOrPartsItemName(c.name)) {
      items.push({ name: c.name, price: c.amount, quantity: 1 });
      continue;
    }
    const dup = additionalCharges.some(
      (x) =>
        x.name.localeCompare(c.name, undefined, { sensitivity: "accent" }) ===
          0 && Math.abs(x.amount - c.amount) <= MONEY_TOLERANCE
    );
    if (!dup) additionalCharges.push(c);
  }

  let productSum = productItemsSum(items, currency);

  let subtotal = roundMoney(asFinite(parsed.subtotal), currency);
  if (subtotal === 0 && productSum !== 0) {
    subtotal = productSum;
  }

  // Items:N overcount — shrink an over-read qty (Brew Tea "Pone Mhan" 1→2
  // while Rice stays ×2). When line totals already match subtotal, allow the
  // broader deflate; when money is still short, only the high-confidence
  // excess===1 non-staple 2→1 flip runs inside deflateQuantityOvercount.
  if (printedItemUnits > 0) {
    const moneyMatches =
      Math.abs(productSum - subtotal) <= MONEY_TOLERANCE;
    const deflated = deflateQuantityOvercount(
      items,
      printedItemUnits,
      moneyMatches
    );
    if (deflated !== items) {
      items.length = 0;
      items.push(...deflated);
      productSum = productItemsSum(items, currency);
    }
  }

  let total = roundMoney(asFinite(parsed.total), currency);
  // Handwritten garage invoices: model often dumps ค่าแรง into serviceCharge
  // even though parts/labor rows are already items. If items alone match the
  // printed total (no VAT), clear the spurious F&B serviceCharge.
  let clearedService = serviceCharge;
  const looksLikeGarage = items.some((it) => isLaborOrPartsItemName(it.name));
  if (
    looksLikeGarage &&
    tax <= MONEY_TOLERANCE &&
    clearedService > MONEY_TOLERANCE
  ) {
    const net = netItemsSum(items, currency);
    const extras = additionalChargesSum(additionalCharges, currency);
    const withoutSvc = roundMoney(
      net - discount + extras + rounding,
      currency
    );
    if (
      total > MONEY_TOLERANCE &&
      Math.abs(withoutSvc - total) <= MONEY_TOLERANCE
    ) {
      clearedService = 0;
    }
  }

  const draft: NormalizedBill = {
    currency,
    items,
    tax,
    serviceCharge: clearedService,
    rounding,
    additionalCharges,
    discount,
    subtotal,
    total,
    taxInclusive,
    printedItemUnits,
  };

  if (total === 0) {
    draft.total = expectedGrandTotal(draft);
  }

  return preferInclusiveWhenTaxIsBreakdown(reconcileBill(draft));
}

/**
 * When the model labels a GST/VAT *breakdown* as exclusive (common for SGD
 * "ADD GST" and Thai "Included Vat") and invents total = items + tax, exclusive
 * math can still "reconcile" — so reconcileBill early-returns and never flips.
 *
 * If printed tax matches the inclusive statutory breakdown of the items/
 * subtotal much better than the exclusive rate, force taxInclusive and set
 * the payable total to items (+ fees + rounding) without adding tax again.
 * Also try flipping the rounding sign when the model stored Round Amount as
 * positive but cash-round should reduce the due amount.
 */
export function preferInclusiveWhenTaxIsBreakdown(
  bill: NormalizedBill
): NormalizedBill {
  if (bill.taxInclusive || bill.tax <= MONEY_TOLERANCE) return bill;

  const rates = ratesForCurrency(bill.currency);
  if (rates == null || rates.length === 0) return bill;

  const net = netItemsSum(bill.items, bill.currency);
  const discount = Math.max(0, bill.discount || 0);
  const payableNet = roundMoney(net - discount, bill.currency);
  const extras = additionalChargesSum(bill.additionalCharges, bill.currency);
  const base =
    bill.subtotal > MONEY_TOLERANCE ? bill.subtotal : net;

  let bestIncl = Number.POSITIVE_INFINITY;
  let bestExcl = Number.POSITIVE_INFINITY;
  for (const rate of rates) {
    const incl = Math.round(((base * rate) / (1 + rate)) * 100) / 100;
    const excl =
      Math.round((payableNet + bill.serviceCharge) * rate * 100) / 100;
    bestIncl = Math.min(bestIncl, Math.abs(incl - bill.tax));
    bestExcl = Math.min(bestExcl, Math.abs(excl - bill.tax));
  }

  // Tax is an inclusive breakdown, not an add-on.
  if (
    !(
      bestIncl <= VAT_MATCH_TOLERANCE &&
      bestExcl > VAT_MATCH_TOLERANCE
    )
  ) {
    return bill;
  }

  const exclusiveTotal = roundMoney(
    payableNet + bill.tax + bill.serviceCharge + extras + bill.rounding,
    bill.currency
  );
  const modelUsedExclusiveTotal =
    Math.abs(bill.total - exclusiveTotal) <= MONEY_TOLERANCE;

  const withRound = (rounding: number): NormalizedBill => ({
    ...bill,
    taxInclusive: true,
    rounding,
    total: roundMoney(
      payableNet + bill.serviceCharge + extras + rounding,
      bill.currency
    ),
  });

  const asPrintedRound = withRound(bill.rounding);
  const flippedRound = withRound(-bill.rounding);

  // Prefer the cash-round sign that reconciles; when the model clearly used
  // exclusive total = items+tax+round, prefer flipping a small positive round
  // to negative (SG "Round Amount" reducing amount due).
  const printedOk = checkBillMath(asPrintedRound).ok;
  const flippedOk = checkBillMath(flippedRound).ok;

  if (
    flippedOk &&
    modelUsedExclusiveTotal &&
    bill.rounding > 0 &&
    Math.abs(bill.rounding) <= 0.1 + MONEY_TOLERANCE
  ) {
    return flippedRound;
  }
  if (printedOk) return asPrintedRound;
  if (flippedOk) return flippedRound;
  return bill;
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
  // Items:N counts sold products only — not minus promo / discount rows.
  const quantitySum = productQuantitySum(bill.items);
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
    Math.abs((a.discount || 0) - (b.discount || 0)) +
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
 * prefer filling a missing bill-level discount (keeping VAT/service) over
 * rewriting tax or service. Free-item promos the model already named stay in
 * items; anonymous gaps become the totals `discount` field.
 */
export function reconcileBill(bill: NormalizedBill): NormalizedBill {
  const check = checkBillMath(bill);
  if (check.ok) return bill;

  if (check.itemsDelta > MONEY_TOLERANCE) return bill;

  const { currency } = bill;
  const candidates: NormalizedBill[] = [];
  const extras = additionalChargesSum(bill.additionalCharges, currency);
  const existingDiscount = Math.max(0, bill.discount || 0);

  candidates.push({ ...bill, taxInclusive: !bill.taxInclusive });

  const net = netItemsSum(bill.items, currency);
  const payableNet = roundMoney(net - existingDiscount, currency);
  const exclusiveExpected = roundMoney(
    payableNet + bill.tax + bill.serviceCharge + extras + bill.rounding,
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

  // Missing bill-level discount (e.g. Promotion Tier / % off) — put it in the
  // totals field, not as a fake pickable item.
  const hasPromoRelief =
    existingDiscount > MONEY_TOLERANCE ||
    bill.items.some((it) => it.price < 0);
  if (
    overshoot > MONEY_TOLERANCE &&
    !overshootIsInclusiveVat &&
    !hasPromoRelief
  ) {
    candidates.push({
      ...bill,
      taxInclusive: false,
      discount: overshoot,
    });
  }

  const inclusiveExpected = roundMoney(
    payableNet + bill.serviceCharge + extras + bill.rounding,
    currency
  );
  const inclusiveOvershoot = roundMoney(inclusiveExpected - bill.total, currency);
  if (
    inclusiveOvershoot > MONEY_TOLERANCE &&
    !hasPromoRelief
  ) {
    candidates.push({
      ...bill,
      taxInclusive: true,
      discount: inclusiveOvershoot,
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

  // Remaining gap after payable items + known extra fees (what tax+service should cover).
  const gap = roundMoney(
    bill.total - payableNet - extras - bill.rounding,
    currency
  );

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
      payableNet,
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
      // Prefer filling a missing bill-level discount over rewriting tax/service.
      addedDiscount:
        (c.discount || 0) > (bill.discount || 0) + MONEY_TOLERANCE &&
        !((bill.discount || 0) > MONEY_TOLERANCE) &&
        !bill.items.some((it) => it.price < 0)
          ? 0
          : 1,
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
          payableNet,
          c.serviceCharge,
          currency,
          c.total
        )
          ? 0
          : 1,
    }))
    .filter((x) => x.check.ok)
    .sort((a, b) => {
      if (a.addedDiscount !== b.addedDiscount) {
        return a.addedDiscount - b.addedDiscount;
      }
      if (a.addedMinus !== b.addedMinus) return a.addedMinus - b.addedMinus;
      if (a.taxPlausible !== b.taxPlausible) {
        return a.taxPlausible - b.taxPlausible;
      }
      const gapPositive = bill.total > payableNet + MONEY_TOLERANCE;
      if (gapPositive && a.c.taxInclusive !== b.c.taxInclusive) {
        return Number(a.c.taxInclusive) - Number(b.c.taxInclusive);
      }
      return a.dist - b.dist;
    });

  return winners[0]?.c ?? bill;
}

/**
 * Human-readable brief of a failed check, used as the repair prompt payload.
 * Leads with classified repair modes so the model gets a narrow focus instead of
 * stuffing more permanent rules into EXTRACTION_SYSTEM_PROMPT.
 */
export function formatCheckForRepair(
  bill: NormalizedBill,
  check: BillCheck
): string {
  const modes = classifyRepairModes(bill, check);
  const modeHints = repairModeHints(modes);

  const missingProductsHint =
    modes.includes("missing_products")
      ? [
          "Product lines do not match the printed subtotal — a priced product row is likely missing or mis-read.",
          "Re-scan every amount in the Items / price column top-to-bottom. Common misses: small drinks/tea/sides, bilingual English lines between Myanmar/Thai dish names, and multi-qty lines like \"4  Daily Special  396.00\" sitting between two similar salads.",
          "Do not merge a priced English label into the previous dish as a translation or modifier — a distinct price means a distinct item.",
          "Two rows with the same dish name and two prices are TWO items (different modifiers). Keep both.",
          "If a name is illegible but the price is clear, keep the row as name \"Unreadable item\" with that price. Never drop a priced line to force the math.",
        ]
      : [];

  const quantityHint =
    modes.includes("quantity_mismatch")
      ? [
          `Quantity units (${check.quantitySum}) do not match the printed Items count (${bill.printedItemUnits}).`,
          "Re-read the leftmost quantity digit on EVERY product row (Thai/SEA POS often prints \"2  ItemName  100.00\").",
          "Do not confuse Table / Guests counts above the items with line quantities.",
          "Do not move a quantity digit from one product onto a different product name to fake the Items count.",
          "Keep each item's `price` as the LINE TOTAL; only correct `quantity` (and strip a leading qty digit from `name` if you glued it there).",
          "Minus free-item promotion lines (e.g. Promotion Free Tea, negative price) stay in items and are NOT counted in Items: N — compare the footer only to sum(quantity where price ≥ 0).",
          "Bill-level Discount / Promotion Tier / % off lines belong in the `discount` field (positive amount), not in items.",
          "Bare numeric PLU/SKU rows with no price (e.g. \"1133371101\") are not menu items — omit them. Items: N may still count those rows; do NOT raise other dishes' quantities to match. Prefer setting printedItemUnits to the sum of priced product-line quantities when the only shortfall is an unpriced product code.",
          "If sum(product qty) EXCEEDS Items:N, decrease an over-read quantity (OCR often turns a leftmost 1 into 2). Do not keep Pone Mhan/Hman at qty 2 from memory of another receipt — read THIS receipt's digit. Prefer lowering a dish qty over changing a correct Rice ×2 staple line.",
          "Update printedItemUnits only if you mis-read the Items footer or it counted an unpriced PLU/SKU — otherwise the footer is correct and a line quantity is wrong.",
        ]
      : [];

  const serviceRateHint = impliedSubtotalHints(bill);

  return [
    "Previous extraction failed the arithmetic self-check:",
    ...check.messages.map((m) => `- ${m}`),
    "",
    `Repair focus: ${modes.join(", ") || "generic_math"}`,
    ...modeHints,
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
    "Bill-level Discount / Promotion Tier / % off belong in `discount` (positive amount). Free-item promos (e.g. Promotion Free Tea -50) stay in items with a NEGATIVE price. Do not omit either.",
    "Trust the printed TOTAL / AMOUNT DUE on the receipt — do not invent extra tax or service.",
    "Put delivery / packaging / cover / bag / corkage / similar fees in additionalCharges with their printed labels — not in items or serviceCharge.",
    "Repair / garage labor (ค่าแรง, technician fees) and parts stay in items — never fold them into serviceCharge.",
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
    discount: Math.max(0, bill.discount || 0),
    subtotal: bill.subtotal,
    total: bill.total,
  };
}
