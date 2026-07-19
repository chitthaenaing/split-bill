import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeStoredBill } from "./normalize-stored-bill";

describe("normalizeStoredBill", () => {
  it("accepts a well-formed stored bill", () => {
    const bill = normalizeStoredBill({
      id: "abc123XYZ1",
      createdAt: 100,
      receiptUrl: "https://example.com/r.jpg",
      receiptContentType: "image/jpeg",
      currency: "THB",
      items: [{ name: "Pad Thai", price: 120, quantity: 2 }],
      tax: 7,
      serviceCharge: 10,
      rounding: -0.5,
      discount: 20,
      ownerTokenHash: "c".repeat(64),
      revision: 2,
      lastWriteId: "w1",
    });
    assert.ok(bill);
    assert.equal(bill!.currency, "THB");
    assert.equal(bill!.items.length, 1);
    assert.equal(bill!.discount, 20);
    assert.equal(bill!.ownerTokenHash, "c".repeat(64));
  });

  it("rejects missing receipt or invalid id", () => {
    assert.equal(normalizeStoredBill(null), null);
    assert.equal(
      normalizeStoredBill({
        id: "../evil",
        receiptUrl: "https://example.com/r.jpg",
        items: [],
      }),
      null
    );
    assert.equal(
      normalizeStoredBill({
        id: "abc123XYZ1",
        items: [],
      }),
      null
    );
  });

  it("drops malformed payment receipts and items", () => {
    const bill = normalizeStoredBill({
      id: "abc123XYZ1",
      receiptUrl: "https://example.com/r.jpg",
      items: [
        { name: "Ok", price: 10, quantity: 1 },
        null,
        { name: "", price: 0, quantity: 1 },
      ],
      paymentReceipts: [
        {
          id: "pay123ABCD",
          url: "https://example.com/p.jpg",
          contentType: "image/png",
          uploadedAt: 1,
          payerName: "Sam",
          amountPaid: 55.25,
          deleteTokenHash: "d".repeat(64),
        },
        { id: "bad", url: "x" },
        null,
      ],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
    });
    assert.ok(bill);
    assert.equal(bill!.items.length, 1);
    assert.equal(bill!.paymentReceipts?.length, 1);
    assert.equal(bill!.paymentReceipts?.[0]?.payerName, "Sam");
    assert.equal(bill!.paymentReceipts?.[0]?.amountPaid, 55.25);
  });
});
