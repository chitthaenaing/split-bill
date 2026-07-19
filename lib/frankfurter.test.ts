import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  convertAmount,
  displayCurrencyOptions,
  fetchFrankfurterRate,
  isValidCurrencyCode,
  normalizeCurrency,
  parseFrankfurterRate,
} from "./frankfurter";

describe("frankfurter helpers", () => {
  it("normalizes and validates currency codes", () => {
    assert.equal(normalizeCurrency(" thb "), "THB");
    assert.equal(isValidCurrencyCode("USD"), true);
    assert.equal(isValidCurrencyCode("us"), false);
    assert.equal(isValidCurrencyCode("USDT"), false);
  });

  it("includes the bill currency in display options", () => {
    const opts = displayCurrencyOptions("nok");
    assert.ok(opts.includes("NOK"));
    assert.ok(opts.includes("THB"));
    assert.deepEqual(opts, [...opts].sort((a, b) => a.localeCompare(b)));
  });

  it("converts amounts with a mid-market rate", () => {
    assert.equal(convertAmount(100, 0.02976), 2.976);
    assert.equal(convertAmount(Number.NaN, 1), 0);
  });

  it("parses a Frankfurter rate payload", () => {
    const q = parseFrankfurterRate(
      { date: "2026-07-19", base: "THB", quote: "USD", rate: 0.02976 },
      "THB",
      "USD"
    );
    assert.equal(q.rate, 0.02976);
    assert.equal(q.date, "2026-07-19");
    assert.equal(q.from, "THB");
    assert.equal(q.to, "USD");
  });

  it("rejects missing rates", () => {
    assert.throws(() => parseFrankfurterRate({ rate: 0 }, "THB", "USD"));
  });

  it("short-circuits same-currency fetches", async () => {
    let called = false;
    const quote = await fetchFrankfurterRate("usd", "USD", {
      fetch: async () => {
        called = true;
        return new Response("{}");
      },
    });
    assert.equal(called, false);
    assert.equal(quote.rate, 1);
    assert.equal(quote.from, "USD");
    assert.equal(quote.to, "USD");
  });

  it("fetches a cross rate via the injected fetch", async () => {
    const quote = await fetchFrankfurterRate("THB", "USD", {
      fetch: async (input) => {
        assert.match(String(input), /\/rate\/THB\/USD$/);
        return new Response(
          JSON.stringify({
            date: "2026-07-19",
            base: "THB",
            quote: "USD",
            rate: 0.02976,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
    });
    assert.equal(quote.rate, 0.02976);
    assert.equal(quote.date, "2026-07-19");
  });

  it("surfaces Frankfurter error messages", async () => {
    await assert.rejects(
      () =>
        fetchFrankfurterRate("ABC", "USD", {
          fetch: async () =>
            new Response(JSON.stringify({ message: "Could not find currency ABC" }), {
              status: 422,
              headers: { "Content-Type": "application/json" },
            }),
        }),
      /422.*Could not find currency ABC/
    );
  });
});
