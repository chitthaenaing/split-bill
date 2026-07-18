import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeExtractedBill } from "./bill-extract";
import { finalizeExtraction } from "./openai";
import { checkVatConsistency } from "./vat-check";

describe("checkVatConsistency", () => {
  it("warns when inclusive THB printed VAT is a few satang off 7% (Air Plus)", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        { name: "MIXED BEEF NOODLES", price: 150, quantity: 1 },
        { name: "MANDI WITH BRAISED BEE", price: 165, quantity: 1 },
        { name: "FRUITPUNCH", price: 59, quantity: 1 },
        { name: "LEMON TEA", price: 59, quantity: 1 },
        { name: "BEEF SUKI YAKI SIZZING", price: 185, quantity: 1 },
        { name: "RICE AND SLICED BEEF S", price: 145, quantity: 1 },
        { name: "EST COLA", price: 30, quantity: 1 },
        { name: "ICE", price: 0, quantity: 2 },
      ],
      tax: 51.91,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 793,
      total: 793,
      taxInclusive: true,
    });

    const vat = checkVatConsistency(bill);
    assert.equal(vat.skipped, false);
    assert.equal(vat.ok, false);
    assert.equal(vat.expectedVat, 51.88);
    assert.equal(vat.printedVat, 51.91);
    assert.match(vat.messages[0] ?? "", /51\.91/);
    assert.match(vat.messages[0] ?? "", /51\.88/);
    assert.match(vat.messages[0] ?? "", /left unchanged/i);
  });

  it("passes exclusive THB VAT at 7% on (net + service)", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        { name: "Pad Thai", price: 120, quantity: 1 },
        { name: "Green Curry", price: 140, quantity: 1 },
        { name: "Iced Tea", price: 40, quantity: 1 },
      ],
      tax: 22.05,
      serviceCharge: 15,
      rounding: 0,
      discount: 0,
      subtotal: 300,
      total: 337.05,
      taxInclusive: false,
    });

    const vat = checkVatConsistency(bill);
    assert.equal(vat.ok, true);
    assert.equal(vat.skipped, false);
    assert.equal(vat.expectedVat, 22.05);
    assert.equal(vat.messages.length, 0);
  });

  it("skips non-THB currencies without an explicit rate", () => {
    const bill = normalizeExtractedBill({
      currency: "USD",
      items: [{ name: "Soup", price: 8, quantity: 1 }],
      tax: 0.7,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 8,
      total: 8.7,
      taxInclusive: false,
    });
    const vat = checkVatConsistency(bill);
    assert.equal(vat.skipped, true);
    assert.equal(vat.ok, true);
  });
});

describe("finalizeExtraction", () => {
  it("keeps reconciled true but surfaces soft VAT warnings for Air Plus", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        { name: "MIXED BEEF NOODLES", price: 150, quantity: 1 },
        { name: "MANDI WITH BRAISED BEE", price: 165, quantity: 1 },
        { name: "FRUITPUNCH", price: 59, quantity: 1 },
        { name: "LEMON TEA", price: 59, quantity: 1 },
        { name: "BEEF SUKI YAKI SIZZING", price: 185, quantity: 1 },
        { name: "RICE AND SLICED BEEF S", price: 145, quantity: 1 },
        { name: "EST COLA", price: 30, quantity: 1 },
        { name: "ICE", price: 0, quantity: 2 },
      ],
      tax: 51.91,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 793,
      total: 793,
      taxInclusive: true,
    });

    const result = finalizeExtraction(bill);
    assert.equal(result.reconciled, true);
    assert.equal(result.bill.tax, 0);
    assert.equal(result.bill.total, 793);
    assert.equal(result.warnings.length, 1);
    assert.match(
      result.warnings[0] ?? "",
      /Printed VAT 51\.91 differs from expected 7% inclusive VAT 51\.88/
    );
  });
});
