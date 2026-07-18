import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { httpStatusFromError, readMultipartImage } from "./multipart-image";

describe("multipart-image", () => {
  it("reads an image file from FormData", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const form = new FormData();
    form.append("file", new File([bytes], "shot.jpg", { type: "image/jpeg" }));
    const out = await readMultipartImage(form, "file", 1024);
    assert.ok(out);
    assert.equal(out!.mime, "image/jpeg");
    assert.equal(out!.buffer.length, 4);
  });

  it("returns null when the field is missing", async () => {
    const form = new FormData();
    assert.equal(await readMultipartImage(form, "file"), null);
  });

  it("rejects oversized images with status 413", async () => {
    const bytes = new Uint8Array(16);
    const form = new FormData();
    form.append("file", new File([bytes], "big.jpg", { type: "image/jpeg" }));
    await assert.rejects(
      () => readMultipartImage(form, "file", 8),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 413);
        return true;
      }
    );
  });

  it("maps tagged errors to HTTP status", () => {
    assert.equal(httpStatusFromError({ status: 413 }, 500), 413);
    assert.equal(httpStatusFromError(new Error("x"), 500), 500);
  });
});
