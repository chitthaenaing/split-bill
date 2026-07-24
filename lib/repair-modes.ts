/**
 * Narrow failure classes for the one-shot vision repair call.
 * Prefer these targeted hints over growing EXTRACTION_SYSTEM_PROMPT.
 *
 * Kept free of imports from bill-extract to avoid circular init
 * (bill-extract → repair-modes → bill-extract).
 */

export type RepairMode =
  | "missing_products"
  | "quantity_mismatch"
  | "tax_inclusive_flip"
  | "missing_promo"
  | "fee_misclassified"
  | "generic_math";

const MONEY_TOLERANCE = 0.05;

/** Minimal bill shape needed for repair classification. */
export type RepairBillView = {
  taxInclusive: boolean;
  tax: number;
  serviceCharge: number;
  rounding: number;
  total: number;
  currency: string;
  printedItemUnits: number;
  items: Array<{ name: string; price: number; quantity: number }>;
  additionalCharges?: Array<{ name: string; amount: number }>;
};

export type RepairCheckView = {
  ok: boolean;
  itemsDelta: number;
  quantityDelta: number;
  quantitySum: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function netItemsSum(items: RepairBillView["items"]): number {
  return roundMoney(items.reduce((s, it) => s + (it.price || 0), 0));
}

function extrasSum(charges: RepairBillView["additionalCharges"]): number {
  return roundMoney(
    (charges ?? []).reduce((s, c) => s + Math.max(0, c.amount || 0), 0)
  );
}

export function classifyRepairModes(
  bill: RepairBillView,
  check: RepairCheckView
): RepairMode[] {
  const modes: RepairMode[] = [];

  if (check.itemsDelta > MONEY_TOLERANCE) {
    modes.push("missing_products");
  }

  if (bill.printedItemUnits > 0 && check.quantityDelta > 0) {
    modes.push("quantity_mismatch");
  }

  const extras = extrasSum(bill.additionalCharges);
  const net = netItemsSum(bill.items);
  const exclusiveExpected = roundMoney(
    net + bill.tax + bill.serviceCharge + extras + bill.rounding
  );
  const overshoot = roundMoney(exclusiveExpected - bill.total);
  const overshootIsInclusiveVat =
    (bill.tax > MONEY_TOLERANCE &&
      Math.abs(overshoot - bill.tax) <= MONEY_TOLERANCE) ||
    (bill.tax + bill.serviceCharge > MONEY_TOLERANCE &&
      Math.abs(overshoot - (bill.tax + bill.serviceCharge)) <= MONEY_TOLERANCE);

  if (!bill.taxInclusive && overshootIsInclusiveVat) {
    modes.push("tax_inclusive_flip");
  }

  if (
    overshoot > MONEY_TOLERANCE &&
    !overshootIsInclusiveVat &&
    !bill.items.some((it) => it.price < 0) &&
    check.itemsDelta <= MONEY_TOLERANCE
  ) {
    modes.push("missing_promo");
  }

  const feeLikeInItems = bill.items.some((it) =>
    /delivery|packag|takeaway|bag fee|cover charge|corkage/i.test(it.name)
  );
  if (feeLikeInItems) {
    modes.push("fee_misclassified");
  }

  if (modes.length === 0 && !check.ok) {
    modes.push("generic_math");
  }

  return modes;
}

/** Short lead-in lines for each repair mode (before the shared self-check text). */
export function repairModeHints(modes: RepairMode[]): string[] {
  const hints: string[] = [];
  if (modes.includes("missing_products")) {
    hints.push(
      "Focus: missing or mis-read product rows (price column). Do not invent rows — re-read the image."
    );
  }
  if (modes.includes("quantity_mismatch")) {
    hints.push(
      "Focus: line quantities vs the printed Items/Qty footer. Fix quantity digits; do not move qty across products."
    );
  }
  if (modes.includes("tax_inclusive_flip")) {
    hints.push(
      "Focus: taxInclusive flag. Exclusive math overshoots by exactly the printed VAT/GST — set taxInclusive=true instead of inventing a discount."
    );
  }
  if (modes.includes("missing_promo")) {
    hints.push(
      "Focus: missing promotion / free-item line. Add it as an item with a NEGATIVE price equal to the overshoot."
    );
  }
  if (modes.includes("fee_misclassified")) {
    hints.push(
      "Focus: delivery / packaging / cover / bag / corkage belong in additionalCharges, not items or serviceCharge."
    );
  }
  if (modes.includes("generic_math")) {
    hints.push(
      "Focus: make the grand-total equation match the printed TOTAL without dropping priced rows."
    );
  }
  return hints;
}
