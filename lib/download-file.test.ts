import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  asImageBlob,
  getDownloadFileName,
} from "./download-file";

describe("getDownloadFileName", () => {
  it("uses mime type for extension", () => {
    assert.equal(
      getDownloadFileName({
        baseName: "Payment QR",
        src: "https://example.com/x",
        mimeType: "image/png",
      }),
      "payment-qr.png"
    );
  });

  it("falls back to url extension then jpg", () => {
    assert.equal(
      getDownloadFileName({
        baseName: "payment-qr",
        src: "https://blob.vercel-storage.com/bills/abc/banking-qr.webp",
      }),
      "payment-qr.webp"
    );
    assert.equal(
      getDownloadFileName({
        baseName: "payment-qr",
        src: "https://example.com/no-ext",
      }),
      "payment-qr.jpg"
    );
  });

  it("reads mime from data urls", () => {
    assert.equal(
      getDownloadFileName({
        baseName: "payment-qr",
        src: "data:image/jpeg;base64,/9j/4AAQ",
      }),
      "payment-qr.jpg"
    );
  });
});

describe("asImageBlob", () => {
  it("keeps an existing image mime type", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const out = asImageBlob(blob, "image/jpeg");
    assert.equal(out.type, "image/png");
    assert.equal(out, blob);
  });

  it("applies mime hint when blob type is missing", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const out = asImageBlob(blob, "image/png");
    assert.equal(out.type, "image/png");
  });

  it("infers jpeg from filename when needed", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: "application/octet-stream",
    });
    const out = asImageBlob(
      blob,
      null,
      "https://example.com/bills/x/banking-qr.jpg"
    );
    assert.equal(out.type, "image/jpeg");
  });
});
