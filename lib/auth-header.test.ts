import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bearerTokenFromRequest } from "./auth-header";

describe("bearerTokenFromRequest", () => {
  it("reads a Bearer token from Authorization", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Bearer abc.def.ghi" },
    });
    assert.equal(bearerTokenFromRequest(req), "abc.def.ghi");
  });

  it("is case-insensitive on the Bearer scheme", () => {
    const req = new Request("https://example.com", {
      headers: { authorization: "bearer tok" },
    });
    assert.equal(bearerTokenFromRequest(req), "tok");
  });

  it("returns null when missing or malformed", () => {
    assert.equal(
      bearerTokenFromRequest(new Request("https://example.com")),
      null
    );
    assert.equal(
      bearerTokenFromRequest(
        new Request("https://example.com", {
          headers: { Authorization: "Basic x" },
        })
      ),
      null
    );
  });
});
