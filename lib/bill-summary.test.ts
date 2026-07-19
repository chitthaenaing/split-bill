import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeStoredBill } from "./bill-summary";
import type { StoredBill } from "@/types/bill";

const base: StoredBill = {
  id: "abc123XYZ0",
  createdAt: 1,
  receiptUrl: "https://example.com/r.jpg",
  receiptContentType: "image/jpeg",
  currency: "USD",
  items: [
    { name: "A", price: 10, quantity: 1 },
    { name: "B", price: 5.5, quantity: 2 },
  ],
  tax: 1,
  serviceCharge: 2,
  rounding: 0.1,
  discount: 0.5,
};

describe("summarizeStoredBill", () => {
  it("sums line prices plus fees minus discount", () => {
    const summary = summarizeStoredBill(base);
    assert.equal(summary.currency, "USD");
    assert.equal(summary.itemCount, 2);
    assert.equal(summary.receiptUrl, "https://example.com/r.jpg");
    // 10 + 5.5 + 1 + 2 + 0.1 - 0.5 = 18.1
    assert.equal(summary.total, 18.1);
  });
});
