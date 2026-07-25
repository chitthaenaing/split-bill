import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyRepairModes, repairModeHints } from "./repair-modes";

describe("classifyRepairModes", () => {
  it("flags missing products when itemsDelta is large", () => {
    const modes = classifyRepairModes(
      {
        taxInclusive: false,
        tax: 10,
        serviceCharge: 5,
        rounding: 0,
        total: 100,
        currency: "THB",
        printedItemUnits: 0,
        items: [{ name: "A", price: 50, quantity: 1 }],
      },
      {
        ok: false,
        itemsDelta: 20,
        quantityDelta: 0,
        quantitySum: 1,
      }
    );
    assert.ok(modes.includes("missing_products"));
    assert.ok(repairModeHints(modes).some((h) => /missing/i.test(h)));
  });

  it("flags quantity mismatch vs Items footer", () => {
    const modes = classifyRepairModes(
      {
        taxInclusive: false,
        tax: 0,
        serviceCharge: 0,
        rounding: 0,
        total: 100,
        currency: "THB",
        printedItemUnits: 7,
        items: [{ name: "Kya Saint", price: 100, quantity: 1 }],
      },
      {
        ok: false,
        itemsDelta: 0,
        quantityDelta: 6,
        quantitySum: 1,
      }
    );
    assert.ok(modes.includes("quantity_mismatch"));
  });

  it("flags taxInclusive flip when exclusive overshoots by VAT", () => {
    const modes = classifyRepairModes(
      {
        taxInclusive: false,
        tax: 50,
        serviceCharge: 0,
        rounding: 0,
        total: 793,
        currency: "THB",
        printedItemUnits: 0,
        items: [{ name: "Item", price: 793, quantity: 1 }],
      },
      {
        ok: false,
        itemsDelta: 0,
        quantityDelta: 0,
        quantitySum: 1,
      }
    );
    assert.ok(modes.includes("tax_inclusive_flip"));
  });

  it("flags missing promo when exclusive overshoots by a non-VAT gap", () => {
    const modes = classifyRepairModes(
      {
        taxInclusive: false,
        tax: 58.73,
        serviceCharge: 39.95,
        rounding: 0.32,
        total: 898,
        currency: "THB",
        printedItemUnits: 0,
        items: [{ name: "Food", price: 849, quantity: 1 }],
      },
      {
        ok: false,
        itemsDelta: 0,
        quantityDelta: 0,
        quantitySum: 1,
      }
    );
    // 849+58.73+39.95+0.32 = 948 → overshoot 50, not equal to VAT
    assert.ok(modes.includes("missing_promo"));
  });
});
