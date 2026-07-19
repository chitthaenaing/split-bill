import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firebaseProjectId } from "./firebase-config";

describe("firebaseProjectId", () => {
  it("falls back to the web config project when env is unset", () => {
    const prev = process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_PROJECT_ID;
    try {
      assert.equal(firebaseProjectId(), "split-bill-noti");
    } finally {
      if (prev === undefined) delete process.env.FIREBASE_PROJECT_ID;
      else process.env.FIREBASE_PROJECT_ID = prev;
    }
  });
});
