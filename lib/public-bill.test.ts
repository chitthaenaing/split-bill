import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPublicPaymentReceipt, toPublicStoredBill } from "./public-bill";
import type { StoredBill } from "@/types/bill";

describe("public-bill", () => {
  it("strips delete token hashes from payment receipts", () => {
    const publicReceipt = toPublicPaymentReceipt({
      id: "abc123XYZ1",
      url: "https://example.com/p.jpg",
      contentType: "image/jpeg",
      uploadedAt: 1,
      payerName: "Alex",
      deleteTokenHash: "deadbeef".repeat(8),
    });
    assert.equal(publicReceipt.payerName, "Alex");
    assert.equal(publicReceipt.deleteTokenHash, undefined);
  });

  it("strips owner secrets, notify tokens, and concurrency fields", () => {
    const bill: StoredBill = {
      id: "abc123XYZ1",
      createdAt: 1,
      receiptUrl: "https://example.com/r.jpg",
      receiptContentType: "image/jpeg",
      ownerTokenHash: "a".repeat(64),
      notifyTokens: ["fcm-token"],
      revision: 3,
      lastWriteId: "write1",
      paymentReceipts: [
        {
          id: "pay123ABCD",
          url: "https://example.com/p.jpg",
          contentType: "image/jpeg",
          uploadedAt: 2,
          deleteTokenHash: "b".repeat(64),
        },
      ],
      currency: "THB",
      items: [{ name: "Tea", price: 40, quantity: 1 }],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
    };

    const pub = toPublicStoredBill(bill);
    assert.equal(pub.ownerTokenHash, undefined);
    assert.equal(pub.notifyTokens, undefined);
    assert.equal(pub.revision, undefined);
    assert.equal(pub.lastWriteId, undefined);
    assert.equal(pub.paymentReceipts?.[0]?.deleteTokenHash, undefined);
    assert.equal(pub.items[0].name, "Tea");
  });
});
