import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkBillMath,
  cleanItemName,
  isJunkItemName,
  normalizeExtractedBill,
  reconcileBill,
} from "./bill-extract";

describe("isJunkItemName", () => {
  it("flags totals, tax and payment labels", () => {
    assert.equal(isJunkItemName("Subtotal"), true);
    assert.equal(isJunkItemName("TOTAL"), true);
    assert.equal(isJunkItemName("Tax"), true);
    assert.equal(isJunkItemName("Service Charge"), true);
    assert.equal(isJunkItemName("Visa"), true);
    assert.equal(isJunkItemName("Rounding"), true);
  });

  it("keeps real menu items", () => {
    assert.equal(isJunkItemName("Latte"), false);
    assert.equal(isJunkItemName("Tax-free soap"), false);
    assert.equal(isJunkItemName("Total breakfast"), false);
  });
});

describe("cleanItemName", () => {
  it("strips trailing OCR garbage like '1..'", () => {
    assert.equal(cleanItemName("STHN NHAT Coffee 1.."), "STHN NHAT Coffee");
    assert.equal(cleanItemName("Latte 2..."), "Latte");
    assert.equal(cleanItemName("Soup."), "Soup");
  });
});

describe("normalizeExtractedBill", () => {
  it("filters junk rows, rounds money, uppercases currency", () => {
    const bill = normalizeExtractedBill({
      currency: "eur",
      items: [
        { name: "Latte", price: 4.5, quantity: 1 },
        { name: "Subtotal", price: 4.5, quantity: 1 },
        { name: "", price: 1, quantity: 1 },
      ],
      tax: 0.9,
      serviceCharge: 0,
      rounding: 0,
      subtotal: 4.5,
      total: 5.4,
      taxInclusive: false,
    });

    assert.equal(bill.currency, "EUR");
    assert.equal(bill.items.length, 1);
    assert.equal(bill.items[0].name, "Latte");
    assert.equal(bill.tax, 0.9);
  });

  it("fills missing subtotal from item sum", () => {
    const bill = normalizeExtractedBill({
      currency: "USD",
      items: [
        { name: "A", price: 10, quantity: 1 },
        { name: "B", price: 5, quantity: 2 },
      ],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
      subtotal: 0,
      total: 15,
      taxInclusive: true,
    });
    assert.equal(bill.subtotal, 15);
  });

  it("keeps discount lines with negative prices", () => {
    const bill = normalizeExtractedBill({
      currency: "USD",
      items: [
        { name: "Burger", price: 12, quantity: 1 },
        { name: "Discount", price: -2, quantity: 1 },
      ],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
      subtotal: 10,
      total: 10,
      taxInclusive: true,
    });
    assert.equal(bill.items.length, 2);
    assert.equal(bill.items[1].price, -2);
  });
});

describe("checkBillMath", () => {
  it("passes a clean tax-exclusive receipt", () => {
    const bill = normalizeExtractedBill({
      currency: "USD",
      items: [
        { name: "Soup", price: 8, quantity: 1 },
        { name: "Salad", price: 12, quantity: 1 },
      ],
      tax: 2,
      serviceCharge: 1,
      rounding: 0,
      subtotal: 20,
      total: 23,
      taxInclusive: false,
    });
    const check = checkBillMath(bill);
    assert.equal(check.ok, true);
    assert.deepEqual(check.messages, []);
  });

  it("passes a tax-inclusive receipt without adding tax twice", () => {
    const bill = normalizeExtractedBill({
      currency: "EUR",
      items: [{ name: "Coffee", price: 3.5, quantity: 1 }],
      tax: 0.3,
      serviceCharge: 0,
      rounding: 0,
      subtotal: 3.5,
      total: 3.5,
      taxInclusive: true,
    });
    const check = checkBillMath(bill);
    assert.equal(check.ok, true);
  });

  it("flags mismatched item sums", () => {
    const bill = {
      currency: "USD",
      items: [{ name: "Tea", price: 4, quantity: 1 }],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
      subtotal: 10,
      total: 10,
      taxInclusive: true,
    };
    const check = checkBillMath(bill);
    assert.equal(check.ok, false);
    assert.ok(check.messages.some((m) => m.includes("Item prices sum")));
  });

  it("flags mismatched grand totals when items also mismatch", () => {
    const bill = {
      currency: "USD",
      items: [{ name: "Tea", price: 4, quantity: 1 }],
      tax: 1,
      serviceCharge: 0,
      rounding: 0,
      subtotal: 10,
      total: 20,
      taxInclusive: false,
    };
    const check = checkBillMath(bill);
    assert.equal(check.ok, false);
  });
});

describe("reconcileBill", () => {
  it("fixes over-counted tax/service when items match subtotal (THB cafe case)", () => {
    // Real failure: items=849, subtotal=849, total=898, but model returned
    // tax=49 + service=50 = 99 → expected 948 (off by 50).
    const fixed = reconcileBill({
      currency: "THB",
      items: [
        { name: "Pop Seint", price: 50, quantity: 1 },
        { name: "STHN NHAT Coffee 1..", price: 70, quantity: 1 },
        { name: "STHN NHAT Coffee", price: 70, quantity: 1 },
        { name: "Kya Saint", price: 50, quantity: 1 },
        { name: "Steamed Rice", price: 90, quantity: 1 },
        { name: "Other", price: 519, quantity: 1 },
      ],
      tax: 49,
      serviceCharge: 50,
      rounding: 0,
      subtotal: 849,
      total: 898,
      taxInclusive: false,
    });

    const check = checkBillMath(fixed);
    assert.equal(check.ok, true);
    assert.equal(fixed.tax + fixed.serviceCharge + fixed.rounding, 49);
    // Prefer dropping the extra 50 service charge and keeping tax=49.
    assert.equal(fixed.serviceCharge, 0);
    assert.equal(fixed.tax, 49);
  });

  it("is applied automatically inside normalizeExtractedBill", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [{ name: "Coffee", price: 849, quantity: 1 }],
      tax: 49,
      serviceCharge: 50,
      rounding: 0,
      subtotal: 849,
      total: 898,
      taxInclusive: false,
    });
    assert.equal(checkBillMath(bill).ok, true);
    assert.equal(bill.tax + bill.serviceCharge, 49);
  });
});
