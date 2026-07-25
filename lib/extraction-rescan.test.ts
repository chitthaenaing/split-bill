import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_EXTRACTION_RESCANS,
  canRescanExtraction,
  rescansRemaining,
} from "./extraction-rescan";

describe("extraction rescan limits", () => {
  it("allows up to MAX_EXTRACTION_RESCANS rescans when warnings exist", () => {
    assert.equal(MAX_EXTRACTION_RESCANS, 2);
    assert.equal(rescansRemaining(0), 2);
    assert.equal(rescansRemaining(1), 1);
    assert.equal(rescansRemaining(2), 0);
    assert.equal(canRescanExtraction(1, 0, true), true);
    assert.equal(canRescanExtraction(1, 1, true), true);
    assert.equal(canRescanExtraction(1, 2, true), false);
  });

  it("blocks rescan without warnings or without a receipt image", () => {
    assert.equal(canRescanExtraction(0, 0, true), false);
    assert.equal(canRescanExtraction(2, 0, false), false);
  });
});
