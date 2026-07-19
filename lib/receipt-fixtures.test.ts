import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkBillMath,
  normalizeExtractedBill,
  toExtractedBill,
} from "./bill-extract";
import { checkVatConsistency } from "./vat-check";

type FixtureExpect = {
  taxInclusive: boolean;
  taxForUi: number;
  total: number;
  itemCount: number;
  noNegativeItems: boolean;
  reconciled: boolean;
  vatConsistency: "ok" | "warn" | "skip";
};

type ReceiptFixture = {
  id: string;
  description: string;
  raw: unknown;
  expect: FixtureExpect;
};

const FIXTURES_DIR = join(process.cwd(), "fixtures", "receipts");

function loadFixtures(): ReceiptFixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      return JSON.parse(
        readFileSync(join(FIXTURES_DIR, f), "utf8")
      ) as ReceiptFixture;
    });
}

function evaluateFixture(fixture: ReceiptFixture): string[] {
  const normalized = normalizeExtractedBill(fixture.raw);
  const check = checkBillMath(normalized);
  const extracted = toExtractedBill(normalized);
  const vat = checkVatConsistency(normalized);
  const exp = fixture.expect;
  const failures: string[] = [];

  if (normalized.taxInclusive !== exp.taxInclusive) {
    failures.push(
      `taxInclusive: got ${normalized.taxInclusive}, want ${exp.taxInclusive}`
    );
  }
  if (extracted.tax !== exp.taxForUi) {
    failures.push(`taxForUi: got ${extracted.tax}, want ${exp.taxForUi}`);
  }
  if (extracted.total !== exp.total) {
    failures.push(`total: got ${extracted.total}, want ${exp.total}`);
  }
  if (extracted.items.length !== exp.itemCount) {
    failures.push(
      `itemCount: got ${extracted.items.length}, want ${exp.itemCount}`
    );
  }
  const hasNegative = extracted.items.some((it) => it.price < 0);
  if (exp.noNegativeItems && hasNegative) {
    failures.push("expected no negative items");
  }
  if (!exp.noNegativeItems && !hasNegative) {
    failures.push("expected a negative promotion item");
  }
  if (check.ok !== exp.reconciled) {
    failures.push(
      `reconciled: got ${check.ok}, want ${exp.reconciled}` +
        (check.messages.length ? ` (${check.messages.join("; ")})` : "")
    );
  }

  if (exp.vatConsistency === "skip") {
    if (!vat.skipped) {
      failures.push("vatConsistency: expected skip");
    }
  } else if (exp.vatConsistency === "ok") {
    if (vat.skipped || !vat.ok) {
      failures.push(
        `vatConsistency: expected ok, got skipped=${vat.skipped} ok=${vat.ok}`
      );
    }
  } else if (exp.vatConsistency === "warn") {
    if (vat.skipped || vat.ok || vat.messages.length === 0) {
      failures.push(
        `vatConsistency: expected warn, got skipped=${vat.skipped} ok=${vat.ok}`
      );
    }
  }

  return failures;
}

describe("receipt fixture scoreboard", () => {
  it("evaluates all fixtures and reports pass/fail counts", () => {
    const fixtures = loadFixtures();
    assert.ok(
      fixtures.length >= 5,
      `expected ≥5 fixtures, got ${fixtures.length}`
    );

    const required = [
      "th-abb-inclusive-air-plus",
      "th-exclusive-with-service",
      "th-promo-minus-line",
      "us-tax-exclusive",
      "eu-tax-inclusive",
      "sg-gst-inclusive-bak-kwa",
      "sg-gst-mislabelled-exclusive",
    ];
    const ids = new Set(fixtures.map((f) => f.id));
    for (const id of required) {
      assert.ok(ids.has(id), `missing fixture ${id}`);
    }

    const failures: string[] = [];
    let passed = 0;

    for (const fixture of fixtures) {
      const issues = evaluateFixture(fixture);
      if (issues.length === 0) {
        passed += 1;
      } else {
        failures.push(`[${fixture.id}] ${issues.join("; ")}`);
      }
    }

    console.log(`Receipt fixtures: ${passed}/${fixtures.length} passed`);
    assert.equal(
      failures.length,
      0,
      failures.length
        ? failures.join("\n")
        : undefined
    );
  });
});
