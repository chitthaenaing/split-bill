import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAssignmentsToItems,
  assignmentPickForParticipant,
  billHasItemAssignments,
  itemAssignedToName,
  participantIsSettled,
  sanitizeAssignedTo,
  settledParticipantKeys,
} from "./item-assignments";

describe("item-assignments", () => {
  it("detects whether a bill has any assignees", () => {
    assert.equal(billHasItemAssignments([{ assignedTo: ["Alex"] }]), true);
    assert.equal(billHasItemAssignments([{ assignedTo: [] }, {}]), false);
    assert.equal(billHasItemAssignments([]), false);
  });

  it("filters assignees against the roster", () => {
    assert.deepEqual(sanitizeAssignedTo(["alex", "Sam", "Zoe"], ["Alex", "Sam"]), [
      "Alex",
      "Sam",
    ]);
    assert.deepEqual(sanitizeAssignedTo(["Zoe"], ["Alex"]), []);
    assert.deepEqual(sanitizeAssignedTo(["Alex"], []), []);
  });

  it("applies assignments onto share items", () => {
    const items = applyAssignmentsToItems(
      [
        { name: "Tea", price: 40, quantity: 1, assignedTo: ["alex", "Unknown"] },
        { name: "Cake", price: 80, quantity: 2 },
      ],
      ["Alex", "Sam"]
    );
    assert.deepEqual(items[0]?.assignedTo, ["Alex"]);
    assert.equal(items[1]?.assignedTo, undefined);
  });

  it("builds equal-split picks for a participant", () => {
    assert.deepEqual(
      assignmentPickForParticipant(
        { quantity: 2, assignedTo: ["Alex", "Sam"] },
        "alex"
      ),
      { qty: 2, split: 2 }
    );
    assert.deepEqual(
      assignmentPickForParticipant(
        { quantity: 1, assignedTo: ["Sam"] },
        "Alex"
      ),
      null
    );
    assert.equal(itemAssignedToName({ assignedTo: ["Sam"] }, "sam"), true);
  });

  it("marks participants settled from payment includedNames", () => {
    const receipts = [
      { includedNames: ["Alex"] },
      { includedNames: ["Sam", "Jo"] },
    ];
    assert.equal(participantIsSettled("alex", receipts), true);
    assert.equal(participantIsSettled("Pat", receipts), false);
    assert.deepEqual(
      [...settledParticipantKeys(receipts)].sort(),
      ["alex", "jo", "sam"]
    );
  });
});
