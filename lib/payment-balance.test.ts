import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  billAmountDue,
  computePaymentBalance,
  isBillSettled,
  paidByPayer,
  totalPaid,
} from "./payment-balance";

describe("payment-balance", () => {
  it("computes bill amount due", () => {
    assert.equal(
      billAmountDue({
        items: [
          { name: "Tea", price: 100, quantity: 1 },
          { name: "Promo", price: -10, quantity: 1 },
        ],
        tax: 7,
        serviceCharge: 10,
        rounding: -0.5,
        discount: 5,
      }),
      101.5
    );
  });

  it("sums paid amounts and rolls up by payer", () => {
    assert.equal(
      totalPaid([{ amountPaid: 40 }, { amountPaid: 25.5 }, {}]),
      65.5
    );
    assert.deepEqual(
      paidByPayer([
        { payerName: "Alex", amountPaid: 40 },
        { payerName: "alex", amountPaid: 10 },
        { amountPaid: 5 },
      ]),
      [
        { payerName: "Alex", amountPaid: 50, proofCount: 2 },
        { payerName: "Transfer", amountPaid: 5, proofCount: 1 },
      ]
    );
  });

  it("computes remaining and flags legacy proofs", () => {
    const bal = computePaymentBalance(
      {
        items: [{ name: "Meal", price: 200, quantity: 1 }],
        tax: 0,
        serviceCharge: 0,
        rounding: 0,
      },
      [
        {
          id: "pay123ABCD",
          url: "https://example.com/p.jpg",
          contentType: "image/jpeg",
          uploadedAt: 1,
          payerName: "Alex",
          amountPaid: 80,
        },
        {
          id: "pay123EFGH",
          url: "https://example.com/p2.jpg",
          contentType: "image/jpeg",
          uploadedAt: 2,
          payerName: "Sam",
        },
      ]
    );
    assert.equal(bal.billTotal, 200);
    assert.equal(bal.transfersPaid, 80);
    assert.equal(bal.ownerPaid, 0);
    assert.equal(bal.paidTotal, 80);
    assert.equal(bal.remaining, 120);
    assert.equal(bal.hasUnknownAmounts, true);
    assert.equal(isBillSettled(bal.remaining), false);
    assert.equal(isBillSettled(0), true);
    assert.equal(isBillSettled(0.004), true);
    assert.equal(isBillSettled(0.01), false);
  });

  it("subtracts organiser pre-share amount from remaining", () => {
    const bal = computePaymentBalance(
      {
        items: [{ name: "Meal", price: 400, quantity: 1 }],
        tax: 0,
        serviceCharge: 0,
        rounding: 0,
        ownerPaid: 120.5,
      },
      [
        {
          id: "pay123ABCD",
          url: "https://example.com/p.jpg",
          contentType: "image/jpeg",
          uploadedAt: 1,
          payerName: "Alex",
          amountPaid: 100,
        },
      ]
    );
    assert.equal(bal.billTotal, 400);
    assert.equal(bal.ownerPaid, 120.5);
    assert.equal(bal.transfersPaid, 100);
    assert.equal(bal.paidTotal, 220.5);
    assert.equal(bal.remaining, 179.5);
  });
});
