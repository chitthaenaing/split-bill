import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterIncludedAgainstRoster,
  sanitizeParticipantList,
  sanitizeParticipantName,
} from "./participants";

describe("participants", () => {
  it("sanitizes a single name", () => {
    assert.equal(sanitizeParticipantName("  Alex  "), "Alex");
    assert.equal(sanitizeParticipantName("\u0000Sam"), "Sam");
    assert.equal(sanitizeParticipantName("   "), null);
    assert.equal(sanitizeParticipantName(null), null);
  });

  it("dedupes and caps a list", () => {
    assert.deepEqual(
      sanitizeParticipantList(["Alex", "alex", "Sam", "", null, "  Jo  "]),
      ["Alex", "Sam", "Jo"]
    );
  });

  it("filters included names against the roster spelling", () => {
    assert.deepEqual(
      filterIncludedAgainstRoster(["sam", "Alex", "Zoe"], ["Alex", "Sam", "Jo"]),
      ["Sam", "Alex"]
    );
    assert.deepEqual(filterIncludedAgainstRoster(["Zoe"], ["Alex"]), []);
  });
});
