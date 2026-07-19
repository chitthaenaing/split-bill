import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeExtractedPayment } from "./payment-extract";

describe("normalizeExtractedPayment", () => {
  it("accepts a clean slip payload", () => {
    assert.deepEqual(
      normalizeExtractedPayment({
        amount: 120.5,
        payerName: "Alex Wong",
        currency: "thb",
      }),
      { amount: 120.5, payerName: "Alex Wong", currency: "THB" }
    );
  });

  it("rejects missing or non-positive amounts", () => {
    assert.equal(normalizeExtractedPayment({ amount: 0, payerName: "A" }), null);
    assert.equal(normalizeExtractedPayment({ amount: -5 }), null);
    assert.equal(normalizeExtractedPayment({}), null);
  });

  it("allows empty payer / currency", () => {
    assert.deepEqual(
      normalizeExtractedPayment({ amount: 40, payerName: "", currency: "" }),
      { amount: 40, payerName: "", currency: "" }
    );
  });
});
