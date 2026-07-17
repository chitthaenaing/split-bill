import type { BillItem, SplitBreakdown } from "@/types/bill";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The per-unit cost for an item — line total divided by quantity. Used to
 * compute the user's portion when they pick a subset of a multi-unit line.
 * Negative for promotion / discount lines.
 */
export function unitPrice(item: BillItem): number {
  const q = Math.max(1, item.quantity || 1);
  return (item.price || 0) / q;
}

/** How many ways the user's portion of this line is split. Always ≥ 1. */
export function splitCountOf(item: BillItem): number {
  return Math.max(1, Math.floor(item.splitCount || 1));
}

/**
 * What the user owes for this single line: the per-unit price times the units
 * they selected, divided by however many people they're splitting it with.
 * Selecting a minus promotion line reduces what they owe.
 */
export function itemShare(item: BillItem): number {
  return (unitPrice(item) * (item.selectedQuantity || 0)) / splitCountOf(item);
}

/**
 * Sum every item line on the receipt (including negative promotions).
 */
export function itemsTotal(items: BillItem[]): number {
  return items.reduce((s, it) => s + (it.price || 0), 0);
}

/** Sum of product lines only (price ≥ 0) — used to split tax/service. */
export function positiveItemsTotal(items: BillItem[]): number {
  return items.reduce((s, it) => s + Math.max(0, it.price || 0), 0);
}

/**
 * Compute what the user owes for the selected items, including their
 * proportional share of tax, service charge and any receipt rounding.
 *
 * Tax/service are split from the share of *positive* product lines selected.
 * Minus promotion lines reduce the items subtotal when selected, and are
 * not applied again on the total.
 */
export function computeSplit(
  items: BillItem[],
  tax: number,
  serviceCharge: number,
  rounding: number
): SplitBreakdown {
  const positiveTotal = positiveItemsTotal(items);
  const selectedSubtotal = items.reduce((s, it) => s + itemShare(it), 0);
  const selectedPositive = items.reduce((s, it) => {
    if ((it.price || 0) <= 0) return s;
    return s + itemShare(it);
  }, 0);

  const ratio =
    positiveTotal > 0 && selectedPositive > 0
      ? selectedPositive / positiveTotal
      : 0;

  const safeTax = Math.max(0, tax || 0);
  const safeSvc = Math.max(0, serviceCharge || 0);
  const safeRnd = rounding || 0;

  const taxShare = round2(safeTax * ratio);
  const serviceShare = round2(safeSvc * ratio);
  const roundingShare = round2(safeRnd * ratio);

  const subtotalRounded = round2(selectedSubtotal);
  const total = round2(
    subtotalRounded + taxShare + serviceShare + roundingShare
  );

  return {
    selectedSubtotal: subtotalRounded,
    discountShare: 0,
    taxShare,
    serviceShare,
    roundingShare,
    total,
    itemsTotal: round2(itemsTotal(items)),
    ratio,
  };
}
