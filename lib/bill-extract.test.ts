import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkBillMath,
  cleanItemName,
  formatCheckForRepair,
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
  });

  it("keeps real menu items and minus promotions", () => {
    assert.equal(isJunkItemName("Latte"), false);
    assert.equal(isJunkItemName("Tax-free soap"), false);
    assert.equal(
      isJunkItemName("Promotion Free Tea (Gold Member)", -50),
      false
    );
    assert.equal(isJunkItemName("Discount", -50), false);
  });

  it("does not treat non-Latin product names as junk", () => {
    assert.equal(isJunkItemName("မုန့်ဟင်းခါး"), false);
    assert.equal(isJunkItemName("ข้าวซอย"), false);
    assert.equal(isJunkItemName("မုန့်ဟင်းခါး / ขนมจีนน้ำยา"), false);
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
        // Zero-price empty names are noise; priced empty names become Unreadable item.
        { name: "", price: 0, quantity: 1 },
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

  it("keeps minus promotion lines on the item list", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        { name: "Pop Seint", price: 50, quantity: 1 },
        { name: "Promotion Free Tea (Gold Member)", price: -50, quantity: 1 },
      ],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 50,
      total: 0,
      taxInclusive: true,
    });
    assert.equal(bill.items.length, 2);
    assert.equal(bill.items[1].price, -50);
    assert.equal(bill.discount, 0);
  });

  it("materializes a discount field as a minus item", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [{ name: "Coffee", price: 100, quantity: 1 }],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
      discount: 20,
      subtotal: 100,
      total: 80,
      taxInclusive: true,
    });
    assert.ok(bill.items.some((it) => it.price === -20));
    assert.equal(bill.discount, 0);
  });

  it("keeps Myanmar/Thai-only product names", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        { name: "မုန့်ဟင်းခါး / ขนมจีนน้ำยา", price: 60, quantity: 1 },
        { name: "Burmese Hot Tea", price: 30, quantity: 1 },
        { name: "Shan Tofu", price: 70, quantity: 1 },
      ],
      tax: 11.2,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 160,
      total: 171.2,
      taxInclusive: false,
    });
    assert.equal(bill.items.length, 3);
    assert.equal(bill.items[0].name, "မုန့်ဟင်းခါး / ขนมจีนน้ำยา");
    assert.equal(bill.items[0].price, 60);
    assert.equal(checkBillMath(bill).ok, true);
  });

  it("keeps priced rows when the name is empty as Unreadable item", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        { name: "", price: 60, quantity: 1 },
        { name: "Shan Tofu", price: 70, quantity: 1 },
      ],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 130,
      total: 130,
      taxInclusive: true,
    });
    assert.equal(bill.items.length, 2);
    assert.equal(bill.items[0].name, "Unreadable item");
    assert.equal(bill.items[0].price, 60);
  });
});

describe("formatCheckForRepair", () => {
  it("hints at a missing priced drink/tea row (Mandalay-style shortfall)", () => {
    // First dish + foods kept; Burmese Hot Tea 30 omitted → sum 330 vs subtotal 360.
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        { name: "မုန့်ဟင်းခါး / ขนมจีนน้ำยา", price: 60, quantity: 1 },
        { name: "Shan Tofu", price: 70, quantity: 1 },
        { name: "Pone Yay Gyi Rice Salad", price: 80, quantity: 1 },
        { name: "Rice Noodles Hot Pot", price: 120, quantity: 1 },
      ],
      tax: 25.2,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 360,
      total: 385.2,
      taxInclusive: false,
    });
    const check = checkBillMath(bill);
    assert.equal(check.ok, false);
    assert.equal(check.itemsSum, 330);
    assert.ok(Math.abs(check.itemsDelta - 30) < 0.01);
    const prompt = formatCheckForRepair(bill, check);
    assert.match(prompt, /priced product row is likely missing/i);
    assert.match(prompt, /Burmese Hot Tea|drinks\/tea|distinct price/i);
    assert.match(prompt, /Unreadable item/);
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
    assert.equal(checkBillMath(bill).ok, true);
  });

  it("passes a receipt with a minus promotion line", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        { name: "Noodle", price: 160, quantity: 1 },
        { name: "Promotion Free Tea", price: -50, quantity: 1 },
      ],
      tax: 7.7,
      serviceCharge: 5.5,
      rounding: 0,
      discount: 0,
      subtotal: 160,
      total: 123.2,
      taxInclusive: false,
    });
    assert.equal(checkBillMath(bill).ok, true);
  });
});

describe("reconcileBill", () => {
  it("adds a missing minus promotion instead of shrinking VAT (Shwe Tea House)", () => {
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

    assert.equal(checkBillMath(fixed).ok, true);
    const promo = fixed.items.find((it) => it.price < 0);
    assert.ok(promo);
    assert.equal(promo?.price, -50);
    assert.equal(fixed.tax, 58.73);
    assert.equal(fixed.serviceCharge, 39.95);
    assert.equal(fixed.discount, 0);
  });
});

describe("computeSplit with minus items", () => {
  it("lets a selected minus line reduce the items total without a separate discount", () => {
    const items = [
      {
        id: "1",
        name: "Food",
        price: 849,
        quantity: 1,
        selectedQuantity: 1,
        splitCount: 1,
      },
      {
        id: "2",
        name: "Promotion Free Tea",
        price: -50,
        quantity: 1,
        selectedQuantity: 1,
        splitCount: 1,
      },
    ];
    const split = computeSplit(items, 58.73, 39.95, 0.32);
    assert.equal(split.selectedSubtotal, 799);
    assert.equal(split.discountShare, 0);
    assert.equal(split.total, 898);
  });
});
