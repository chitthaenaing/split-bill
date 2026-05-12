import type { BillItem, SplitBreakdown } from "@/types/bill";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The per-unit cost for an item — line total divided by quantity. Used to
 * compute the user's portion when they pick a subset of a multi-unit line.
 */
export function unitPrice(item: BillItem): number {
  const q = Math.max(1, item.quantity || 1);
  return (item.price || 0) / q;
}

/**
 * Sum every item line on the receipt (the printed line totals), regardless of
 * selection. This is the denominator we use to split tax / service / rounding
 * across the selected subset.
 */
export function itemsTotal(items: BillItem[]): number {
  return items.reduce((s, it) => s + (it.price || 0), 0);
}

/**
 * Compute what the user owes for the selected items, including their
 * proportional share of tax, service charge and any receipt rounding.
 *
 * The share is based on the selected items' subtotal as a fraction of the
 * receipt's items total. If nothing is selected, everything is zero.
 */
export function computeSplit(
  items: BillItem[],
  tax: number,
  serviceCharge: number,
  rounding: number
): SplitBreakdown {
  const fullTotal = itemsTotal(items);
  const selectedSubtotal = items.reduce(
    (s, it) => s + unitPrice(it) * (it.selectedQuantity || 0),
    0
  );

  const ratio =
    fullTotal > 0 && selectedSubtotal > 0
      ? selectedSubtotal / fullTotal
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
    taxShare,
    serviceShare,
    roundingShare,
    total,
    itemsTotal: round2(fullTotal),
    ratio,
  };
}
