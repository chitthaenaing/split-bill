import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summaryFromBill, userBillIsSettled } from "./user-bill-summary";

describe("user-bill-summary", () => {
  it("builds a summary with paidTotal from payment proofs", () => {
    const summary = summaryFromBill(
      {
        currency: "THB",
        items: [{ name: "Tea", price: 100, quantity: 1 }],
        tax: 7,
        serviceCharge: 0,
        rounding: 0,
        discount: 0,
        receiptUrl: "https://example.com/r.jpg",
      },
      [
        {
          id: "pay123ABCD",
          url: "https://example.com/p.jpg",
          contentType: "image/jpeg",
          uploadedAt: 1,
          amountPaid: 107,
        },
      ]
    );
    assert.equal(summary.total, 107);
    assert.equal(summary.paidTotal, 107);
    assert.equal(summary.itemCount, 1);
    assert.equal(userBillIsSettled(summary), true);
  });

  it("treats missing paidTotal as open", () => {
    assert.equal(
      userBillIsSettled({ total: 50, paidTotal: undefined }),
      false
    );
    assert.equal(userBillIsSettled({ total: 50, paidTotal: 20 }), false);
    assert.equal(userBillIsSettled({ total: 50, paidTotal: 50 }), true);
  });
});
