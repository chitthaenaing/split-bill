import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  forgetMyProof,
  loadMyProofs,
  loadOwnerToken,
  myProofsKey,
  ownerTokenKey,
  rememberMyProof,
  saveOwnerToken,
} from "./share-client";

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
  clear() {
    this.map.clear();
  }
}

describe("share-client", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      localStorage: new MemoryStorage(),
    };
  });

  it("persists and loads owner tokens", () => {
    saveOwnerToken("abc123XYZ1", "owner-secret");
    assert.equal(loadOwnerToken("abc123XYZ1"), "owner-secret");
    assert.equal(
      window.localStorage.getItem(ownerTokenKey("abc123XYZ1")),
      "owner-secret"
    );
  });

  it("migrates legacy proof id arrays and stores delete tokens", () => {
    window.localStorage.setItem(
      myProofsKey("abc123XYZ1"),
      JSON.stringify(["oldProof01"])
    );
    const legacy = loadMyProofs("abc123XYZ1");
    assert.deepEqual(legacy, [{ id: "oldProof01" }]);

    const next = rememberMyProof("abc123XYZ1", {
      id: "newProof02",
      deleteToken: "del-token",
    });
    assert.equal(next.length, 2);
    assert.ok(next.some((p) => p.id === "newProof02" && p.deleteToken === "del-token"));

    const afterDelete = forgetMyProof("abc123XYZ1", "oldProof01");
    assert.deepEqual(afterDelete, [
      { id: "newProof02", deleteToken: "del-token" },
    ]);
  });
});
