import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DATA_URL_SIZE_FACTOR,
  MAX_EDGE_PX,
  MAX_OUTPUT_BYTES,
  approxBytesFromDataUrl,
  maxDataUrlLength,
} from "./image-prep";

describe("image prep size budget", () => {
  it("keeps the output budget under Vercel's ~4.5 MB body limit", () => {
    assert.ok(MAX_OUTPUT_BYTES <= 3.5 * 1024 * 1024);
    assert.ok(maxDataUrlLength() < 4.5 * 1024 * 1024);
  });

  it("keeps enough pixels for dense non-Latin thermal text", () => {
    assert.ok(MAX_EDGE_PX >= 2048);
  });

  it("approxBytesFromDataUrl matches the 4/3 base64 expansion", () => {
    // 3 raw bytes → 4 base64 chars
    const dataUrl = "data:image/jpeg;base64,AAAA";
    assert.equal(approxBytesFromDataUrl(dataUrl), 3);
    assert.ok(DATA_URL_SIZE_FACTOR >= 4 / 3);
  });
});
