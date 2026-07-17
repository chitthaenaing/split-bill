import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkBillMath,
  cleanItemName,
  isJunkItemName,
  normalizeExtractedBill,
  reconcileBill,
} from "./bill-extract";
import { computeSplit } from "./calc";

describe("isJunkItemName", () => {
  it("flags totals, tax and payment labels", () => {
    assert.equal(isJunkItemName("Subtotal"), true);
    assert.equal(isJunkItemName("TOTAL"), true);
    assert.equal(isJunkItemName("Tax"), true);
    assert.equal(isJunkItemName("Service Charge"), true);
    assert.equal(isJunkItemName("Visa"), true);
    assert.equal(isJunkItemName("Rounding"), true);
    assert.equal(isJunkItemName("Discount"), true);
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
      discount: 0,
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
      discount: 0,
      subtotal: 0,
      total: 15,
      taxInclusive: true,
    });
    assert.equal(bill.subtotal, 15);
  });

  it("lifts promotion / negative lines into discount", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        { name: "Burger", price: 12, quantity: 1 },
        { name: "Promotion Free Tea (Gold Member)", price: -50, quantity: 1 },
      ],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 12,
      total: -38, // nonsense total so reconcile won't invent; we'll override check
      taxInclusive: true,
    });
    // Promotion lifted out of items
    assert.equal(bill.items.length, 1);
    assert.equal(bill.items[0].name, "Burger");
    assert.equal(bill.discount, 50);
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
      discount: 0,
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
      discount: 0,
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
      discount: 0,
      subtotal: 10,
      total: 10,
      taxInclusive: true,
    };
    const check = checkBillMath(bill);
    assert.equal(check.ok, false);
    assert.ok(check.messages.some((m) => m.includes("Item prices sum")));
  });
});

describe("reconcileBill", () => {
  it("recovers a missed ฿50 promotion instead of shrinking VAT (Shwe Tea House)", () => {
    // Real receipt: items 849, Discount 50, Service 39.95, VAT 58.73,
    // Rounding 0.32 → Total 898. Model often returns charges but drops discount.
    const fixed = reconcileBill({
      currency: "THB",
      items: [
        { name: "Pop Seint", price: 50, quantity: 1 },
        { name: "STHN NHAT Coffee", price: 70, quantity: 1 },
        { name: "STHN NHAT Coffee", price: 70, quantity: 1 },
        { name: "Kya Saint", price: 50, quantity: 1 },
        { name: "Steamed Rice", price: 90, quantity: 1 },
        { name: "Tea Leaf Salad", price: 90, quantity: 1 },
        { name: "Chicken Curry", price: 109, quantity: 1 },
        { name: "Mote Hin Gar", price: 90, quantity: 1 },
        { name: "Fried Chicken", price: 50, quantity: 1 },
        { name: "Rice", price: 20, quantity: 1 },
        { name: "SHWE Korean Noodle", price: 160, quantity: 1 },
      ],
      tax: 58.73,
      serviceCharge: 39.95,
      rounding: 0.32,
      discount: 0,
      subtotal: 849,
      total: 898,
      taxInclusive: false,
    });

    const check = checkBillMath(fixed);
    assert.equal(check.ok, true);
    assert.equal(fixed.discount, 50);
    assert.equal(fixed.tax, 58.73);
    assert.equal(fixed.serviceCharge, 39.95);
    assert.equal(fixed.rounding, 0.32);
  });

  it("is applied automatically inside normalizeExtractedBill", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [{ name: "Coffee", price: 849, quantity: 1 }],
      tax: 58.73,
      serviceCharge: 39.95,
      rounding: 0.32,
      discount: 0,
      subtotal: 849,
      total: 898,
      taxInclusive: false,
    });
    assert.equal(checkBillMath(bill).ok, true);
    assert.equal(bill.discount, 50);
    assert.equal(bill.tax, 58.73);
  });
});

describe("computeSplit with discount", () => {
  it("applies proportional discount so full selection matches printed total", () => {
    const items = [
      {
        id: "1",
        name: "All",
        price: 849,
        quantity: 1,
        selectedQuantity: 1,
        splitCount: 1,
      },
    ];
    const split = computeSplit(items, 58.73, 39.95, 0.32, 50);
    assert.equal(split.discountShare, 50);
    assert.equal(split.total, 898);
  });
});
