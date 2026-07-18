import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createShareToken,
  hashShareToken,
  verifyShareToken,
} from "./share-tokens";

describe("share-tokens", () => {
  it("creates unique opaque tokens", () => {
    const a = createShareToken();
    const b = createShareToken();
    assert.notEqual(a, b);
    assert.match(a, /^[0-9a-f]{48}$/);
  });

  it("verifies a token against its hash", () => {
    const token = createShareToken();
    const hash = hashShareToken(token);
    assert.equal(verifyShareToken(token, hash), true);
    assert.equal(verifyShareToken("wrong", hash), false);
    assert.equal(verifyShareToken(token, hashShareToken("other")), false);
  });

  it("rejects missing or malformed inputs", () => {
    const token = createShareToken();
    const hash = hashShareToken(token);
    assert.equal(verifyShareToken(null, hash), false);
    assert.equal(verifyShareToken(token, null), false);
    assert.equal(verifyShareToken(token, "not-a-hash"), false);
    assert.equal(verifyShareToken("", hash), false);
  });
});
