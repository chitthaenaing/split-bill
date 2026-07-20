import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkBillMath,
  cleanItemName,
  cleanTranslatedName,
  formatCheckForRepair,
  isJunkItemName,
  liftLeadingQuantity,
  likelyNeedsTranslation,
  normalizeExtractedBill,
  reconcileBill,
  toExtractedBill,
} from "./bill-extract";
import { computeSplit } from "./calc";

describe("isJunkItemName", () => {
  it("flags totals, tax and payment labels", () => {
    assert.equal(isJunkItemName("Subtotal"), true);
    assert.equal(isJunkItemName("TOTAL"), true);
    assert.equal(isJunkItemName("Total Amount"), true);
    assert.equal(isJunkItemName("Tax"), true);
    assert.equal(isJunkItemName("ADD GST"), true);
    assert.equal(isJunkItemName("Service Charge"), true);
    assert.equal(isJunkItemName("Visa"), true);
    assert.equal(isJunkItemName("Rounding"), true);
    assert.equal(isJunkItemName("Round Amount"), true);
    assert.equal(isJunkItemName("TOTAL SAVINGS"), true);
    assert.equal(isJunkItemName("Payment Amount"), true);
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

describe("liftLeadingQuantity", () => {
  it("lifts a glued leading qty when quantity defaulted to 1", () => {
    assert.deepEqual(liftLeadingQuantity("2 Kya Saint", 1), {
      name: "Kya Saint",
      quantity: 2,
    });
    assert.deepEqual(liftLeadingQuantity("3  Latte", 1), {
      name: "Latte",
      quantity: 3,
    });
  });

  it("does not override an explicit multi-qty or leave single units alone", () => {
    assert.deepEqual(liftLeadingQuantity("2 Kya Saint", 2), {
      name: "2 Kya Saint",
      quantity: 2,
    });
    assert.deepEqual(liftLeadingQuantity("Kya Saint", 1), {
      name: "Kya Saint",
      quantity: 1,
    });
  });

  it("does not treat hyphenated or plus drink names as a qty column", () => {
    assert.deepEqual(liftLeadingQuantity("7-Up", 1), {
      name: "7-Up",
      quantity: 1,
    });
    assert.deepEqual(liftLeadingQuantity("100 Plus", 1), {
      name: "100 Plus",
      quantity: 1,
    });
  });
});

describe("cleanTranslatedName / likelyNeedsTranslation", () => {
  it("drops empty or duplicate glosses", () => {
    assert.equal(cleanTranslatedName("", "Latte"), undefined);
    assert.equal(cleanTranslatedName("  latte  ", "Latte"), undefined);
    assert.equal(cleanTranslatedName("Mohinga", "မုန့်ဟင်းခါး"), "Mohinga");
  });

  it("detects non-Latin scripts that benefit from a gloss", () => {
    assert.equal(likelyNeedsTranslation("Latte"), false);
    assert.equal(likelyNeedsTranslation("မုန့်ဟင်းခါး"), true);
    assert.equal(likelyNeedsTranslation("ข้าวซอย"), true);
    assert.equal(likelyNeedsTranslation("抹茶ラテ"), true);
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

  it("lifts a leading qty glued into the item name when quantity defaulted to 1", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        { name: "2 Kya Saint", price: 100, quantity: 1 },
        { name: "Pop Seint", price: 50, quantity: 1 },
      ],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 150,
      total: 150,
      printedItemUnits: 3,
      taxInclusive: false,
    });

    assert.equal(bill.items[0].name, "Kya Saint");
    assert.equal(bill.items[0].quantity, 2);
    assert.equal(bill.printedItemUnits, 3);
    assert.equal(checkBillMath(bill).ok, true);
  });

  it("flags quantity undercount when Items footer disagrees even if money reconciles", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        { name: "Kya Saint", price: 100, quantity: 1 },
        { name: "Pop Seint", price: 50, quantity: 1 },
        { name: "Daily Special Menu (Mutton)", price: 120, quantity: 1 },
        { name: "Fried Rice Royal Bean with Fried Egg", price: 90, quantity: 1 },
        { name: "Mote Hin Gar Soup", price: 25, quantity: 1 },
        { name: "Rice with Shrimp Kaprao", price: 159, quantity: 1 },
      ],
      tax: 39.98,
      serviceCharge: 27.2,
      rounding: -0.18,
      discount: 0,
      subtotal: 544,
      total: 611,
      printedItemUnits: 7,
      taxInclusive: false,
    });

    const check = checkBillMath(bill);
    assert.equal(check.ok, false);
    assert.equal(check.quantitySum, 6);
    assert.equal(check.quantityDelta, 1);
    assert.match(check.messages.join(" "), /Items count 7/);
    const repair = formatCheckForRepair(bill, check);
    assert.match(repair, /leftmost quantity/i);
  });

  it("keeps English glosses on non-Latin names and drops duplicates", () => {
    const bill = normalizeExtractedBill({
      currency: "THB",
      items: [
        {
          name: "မုန့်ဟင်းခါး",
          nameTranslated: "Mohinga",
          price: 60,
          quantity: 1,
        },
        {
          name: "Latte",
          nameTranslated: "Latte",
          price: 40,
          quantity: 1,
        },
      ],
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 100,
      total: 100,
      taxInclusive: true,
    });
    assert.equal(bill.items[0].nameTranslated, "Mohinga");
    assert.equal(bill.items[1].nameTranslated, undefined);
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

describe("Thai ABB tax-inclusive VAT (Air Plus / Included Vat)", () => {
  /**
   * Tax Invoice (ABB) from Air Plus Restaurant, Central World:
   *   Sub Total (Included Vat) 793.00
   *   Net Total                741.09   ← informational breakdown
   *   VAT                       51.91   ← informational (and often off by a few satang)
   *   Total                    793.00
   *
   * Item prices already include VAT. Adding the printed VAT again would make
   * the split ฿844.91 instead of the paid ฿793.
   */
  const abbItems = [
    { name: "MIXED BEEF NOODLES", price: 150, quantity: 1 },
    { name: "MANDI WITH BRAISED BEE", price: 165, quantity: 1 },
    { name: "FRUITPUNCH", price: 59, quantity: 1 },
    { name: "LEMON TEA", price: 59, quantity: 1 },
    { name: "BEEF SUKI YAKI SIZZING", price: 185, quantity: 1 },
    { name: "RICE AND SLICED BEEF S", price: 145, quantity: 1 },
    { name: "EST COLA", price: 30, quantity: 1 },
    { name: "ICE", price: 0, quantity: 2 },
  ];

  it("does not charge printed VAT again when taxInclusive is set", () => {
    const normalized = normalizeExtractedBill({
      currency: "THB",
      items: abbItems,
      tax: 51.91,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 793,
      total: 793,
      taxInclusive: true,
    });
    assert.equal(checkBillMath(normalized).ok, true);
    assert.equal(normalized.taxInclusive, true);

    const extracted = toExtractedBill(normalized);
    assert.equal(extracted.tax, 0);
    assert.equal(extracted.total, 793);

    const splitItems = extracted.items.map((it, i) => ({
      id: String(i),
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      selectedQuantity: it.quantity,
      splitCount: 1,
    }));
    const split = computeSplit(
      splitItems,
      extracted.tax,
      extracted.serviceCharge,
      extracted.rounding
    );
    assert.equal(split.total, 793);
    assert.equal(split.taxShare, 0);
  });

  it("reconciles a mis-labelled exclusive extract and still zeros VAT for the UI", () => {
    // Model often returns taxInclusive=false for Thai ABB because a VAT line
    // is printed — arithmetic then fails (793+51.91 ≠ 793) and reconcile flips.
    const normalized = normalizeExtractedBill({
      currency: "THB",
      items: abbItems,
      tax: 51.91,
      serviceCharge: 0,
      rounding: 0,
      discount: 0,
      subtotal: 793,
      total: 793,
      taxInclusive: false,
    });
    assert.equal(checkBillMath(normalized).ok, true);
    assert.equal(normalized.taxInclusive, true);
    assert.equal(
      normalized.items.some((it) => it.price < 0),
      false,
      "must not invent a Discount equal to the VAT"
    );

    const extracted = toExtractedBill(normalized);
    assert.equal(extracted.tax, 0);
    assert.equal(extracted.items.length, abbItems.length);

    const splitItems = extracted.items.map((it, i) => ({
      id: String(i),
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      selectedQuantity: it.quantity,
      splitCount: 1,
    }));
    assert.equal(
      computeSplit(
        splitItems,
        extracted.tax,
        extracted.serviceCharge,
        extracted.rounding
      ).total,
      793
    );
  });
});

describe("Singapore GST-inclusive retail (ADD GST)", () => {
  /**
   * SG bakery/retail style receipt:
   *   Net line totals              44.46
   *   Total Amount                 44.46
   *   ADD GST                       3.29  ← informational 8% breakdown
   *   Round Amount                 -0.01
   *   Amount due                   44.45
   *
   * Item Net prices already include GST. Adding ADD GST again would make the
   * split S$47.74 instead of the paid S$44.45.
   */
  const sgItems = [
    { name: "Gold Coin Bak Kwa (200g)", price: 11.22, quantity: 1 },
    { name: "Chicken Bak Kwa (200g)", price: 11.22, quantity: 1 },
    { name: "Mini Square Bak Kwa (200g)", price: 11.22, quantity: 1 },
    { name: "Salted Egg Fish Skin (70g)", price: 3.2, quantity: 1 },
    {
      name: "Salted Egg Chilli Crab Fish Skin (70g)",
      price: 0,
      quantity: 1,
    },
    {
      name: "Salted Egg Chilli Crab Fish Skin (70g)",
      price: 7.6,
      quantity: 1,
    },
  ];

  it("does not charge ADD GST again when taxInclusive is set", () => {
    const normalized = normalizeExtractedBill({
      currency: "SGD",
      items: sgItems,
      tax: 3.29,
      serviceCharge: 0,
      rounding: -0.01,
      discount: 0,
      subtotal: 44.46,
      total: 44.45,
      taxInclusive: true,
    });
    assert.equal(checkBillMath(normalized).ok, true);
    assert.equal(normalized.taxInclusive, true);

    const extracted = toExtractedBill(normalized);
    assert.equal(extracted.tax, 0);
    assert.equal(extracted.total, 44.45);
    assert.equal(extracted.rounding, -0.01);

    const splitItems = extracted.items.map((it, i) => ({
      id: String(i),
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      selectedQuantity: it.quantity,
      splitCount: 1,
    }));
    const split = computeSplit(
      splitItems,
      extracted.tax,
      extracted.serviceCharge,
      extracted.rounding
    );
    assert.equal(split.total, 44.45);
    assert.equal(split.taxShare, 0);
  });

  it("reconciles a mis-labelled exclusive extract and still zeros GST for the UI", () => {
    // Model often returns taxInclusive=false for SG because of "ADD GST".
    const normalized = normalizeExtractedBill({
      currency: "SGD",
      items: sgItems,
      tax: 3.29,
      serviceCharge: 0,
      rounding: -0.01,
      discount: 0,
      subtotal: 44.46,
      total: 44.45,
      taxInclusive: false,
    });
    assert.equal(checkBillMath(normalized).ok, true);
    assert.equal(normalized.taxInclusive, true);
    assert.equal(
      normalized.items.some((it) => it.price < 0),
      false,
      "must not invent a Discount equal to the GST"
    );

    const extracted = toExtractedBill(normalized);
    assert.equal(extracted.tax, 0);
    assert.equal(extracted.items.length, sgItems.length);

    const splitItems = extracted.items.map((it, i) => ({
      id: String(i),
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      selectedQuantity: it.quantity,
      splitCount: 1,
    }));
    assert.equal(
      computeSplit(
        splitItems,
        extracted.tax,
        extracted.serviceCharge,
        extracted.rounding
      ).total,
      44.45
    );
  });
});
