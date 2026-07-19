import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  DISPLAY_CURRENCY_KEY,
  loadDisplayCurrency,
  saveDisplayCurrency,
} from "./display-currency";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

describe("display-currency", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      localStorage: new MemoryStorage(),
    };
  });

  it("persists a valid ISO code", () => {
    saveDisplayCurrency("thb");
    assert.equal(loadDisplayCurrency(), "THB");
    assert.equal(
      window.localStorage.getItem(DISPLAY_CURRENCY_KEY),
      "THB"
    );
  });

  it("rejects junk and clears with null", () => {
    saveDisplayCurrency("USDT");
    assert.equal(loadDisplayCurrency(), null);
    saveDisplayCurrency("USD");
    assert.equal(loadDisplayCurrency(), "USD");
    saveDisplayCurrency(null);
    assert.equal(loadDisplayCurrency(), null);
  });
});
