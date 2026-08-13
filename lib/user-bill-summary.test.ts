import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summaryFromBill, userBillIsSettled } from "./user-bill-summary";

describe("user-bill-summary", () => {
  it("builds a summary with paidTotal and payers from payment proofs", () => {
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
          payerName: "Alex",
          amountPaid: 60,
        },
        {
          id: "pay123EFGH",
          url: "https://example.com/p2.jpg",
          contentType: "image/jpeg",
          uploadedAt: 2,
          payerName: "Sam",
          amountPaid: 47,
        },
      ]
    );
    assert.equal(summary.total, 107);
    assert.equal(summary.paidTotal, 107);
    assert.equal(summary.itemCount, 1);
    assert.deepEqual(summary.payers, [
      { name: "Alex", amountPaid: 60 },
      { name: "Sam", amountPaid: 47 },
    ]);
    assert.equal(userBillIsSettled(summary), true);
  });

  it("returns an empty payers list when there are no proofs", () => {
    const summary = summaryFromBill({
      currency: "THB",
      items: [{ name: "Tea", price: 50, quantity: 1 }],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
    });
    assert.deepEqual(summary.payers, []);
    assert.deepEqual(summary.unpaid, []);
    assert.equal(summary.hasRoster, false);
    assert.equal(summary.paidTotal, 0);
  });

  it("lists unpaid roster people not covered by proofs", () => {
    const summary = summaryFromBill(
      {
        currency: "THB",
        items: [{ name: "Tea", price: 100, quantity: 1 }],
        tax: 0,
        serviceCharge: 0,
        rounding: 0,
        participants: ["Alex", "Sam", "Jo"],
      },
      [
        {
          id: "pay123ABCD",
          url: "https://example.com/p.jpg",
          contentType: "image/jpeg",
          uploadedAt: 1,
          payerName: "Alex",
          amountPaid: 40,
          includedNames: ["Alex"],
        },
      ]
    );
    assert.deepEqual(summary.unpaid, ["Sam", "Jo"]);
    assert.equal(summary.hasRoster, true);
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
