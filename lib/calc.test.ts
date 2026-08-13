import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeSplit } from "./calc";
import type { BillItem } from "@/types/bill";

function item(
  partial: Partial<BillItem> & Pick<BillItem, "id" | "name" | "price">
): BillItem {
  return {
    quantity: 1,
    selectedQuantity: 0,
    splitCount: 1,
    ...partial,
  };
}

describe("computeSplit othersRemaining", () => {
  it("reports bill total and what remains for others after excluding my share", () => {
    const items = [
      item({ id: "a", name: "Pad Thai", price: 100, selectedQuantity: 1 }),
      item({ id: "b", name: "Green Curry", price: 200, selectedQuantity: 0 }),
      item({ id: "c", name: "Rice", price: 100, selectedQuantity: 0 }),
    ];
    // Bill: 400 items + 40 tax + 40 service = 480
    // My share: 100/400 = 25% → items 100 + tax 10 + service 10 = 120
    const split = computeSplit(items, 40, 40, 0);
    assert.equal(split.billTotal, 480);
    assert.equal(split.total, 120);
    assert.equal(split.othersRemaining, 360);
  });

  it("zeros othersRemaining when I take the whole bill", () => {
    const items = [
      item({ id: "a", name: "Pad Thai", price: 100, selectedQuantity: 1 }),
      item({ id: "b", name: "Rice", price: 50, selectedQuantity: 1 }),
    ];
    const split = computeSplit(items, 10, 0, 0, [], 5);
    assert.equal(split.billTotal, 155);
    assert.equal(split.total, 155);
    assert.equal(split.othersRemaining, 0);
  });

  it("includes additional charges in billTotal and othersRemaining", () => {
    const items = [
      item({ id: "a", name: "Burger", price: 200, selectedQuantity: 1 }),
      item({ id: "b", name: "Fries", price: 200, selectedQuantity: 0 }),
    ];
    const split = computeSplit(items, 0, 0, 0, [
      { name: "Delivery", amount: 40 },
    ]);
    // Bill 440; my half of positive items → 50% → 200 + 20 delivery = 220
    assert.equal(split.billTotal, 440);
    assert.equal(split.total, 220);
    assert.equal(split.othersRemaining, 220);
  });

  it("keeps full bill as othersRemaining when nothing is selected", () => {
    const items = [
      item({ id: "a", name: "Pad Thai", price: 100, selectedQuantity: 0 }),
    ];
    const split = computeSplit(items, 7, 0, 0);
    assert.equal(split.total, 0);
    assert.equal(split.billTotal, 107);
    assert.equal(split.othersRemaining, 107);
  });
});
