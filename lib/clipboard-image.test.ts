import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  imageFileFromDataTransfer,
  isEditablePasteTarget,
} from "./clipboard-image";

function mockDataTransfer(opts: {
  items?: Array<{
    kind: string;
    type: string;
    file: File | null;
  }>;
  files?: File[];
}): DataTransfer {
  const items = opts.items ?? [];
  const files = opts.files ?? [];
  return {
    items: {
      length: items.length,
      ...Object.fromEntries(
        items.map((item, i) => [
          i,
          {
            kind: item.kind,
            type: item.type,
            getAsFile: () => item.file,
          },
        ])
      ),
    },
    files: {
      length: files.length,
      ...Object.fromEntries(files.map((f, i) => [i, f])),
    },
  } as unknown as DataTransfer;
}

describe("imageFileFromDataTransfer", () => {
  it("returns null for empty clipboard data", () => {
    assert.equal(imageFileFromDataTransfer(null), null);
    assert.equal(imageFileFromDataTransfer(undefined), null);
    assert.equal(imageFileFromDataTransfer(mockDataTransfer({})), null);
  });

  it("prefers an image item from clipboard items", () => {
    const image = new File(["img"], "slip.png", { type: "image/png" });
    const text = new File(["hi"], "note.txt", { type: "text/plain" });
    const data = mockDataTransfer({
      items: [
        { kind: "string", type: "text/plain", file: null },
        { kind: "file", type: "text/plain", file: text },
        { kind: "file", type: "image/png", file: image },
      ],
    });
    assert.equal(imageFileFromDataTransfer(data), image);
  });

  it("falls back to files list when items have no image", () => {
    const image = new File(["img"], "proof.jpg", { type: "image/jpeg" });
    const data = mockDataTransfer({
      items: [{ kind: "string", type: "text/plain", file: null }],
      files: [image],
    });
    assert.equal(imageFileFromDataTransfer(data), image);
  });

  it("ignores non-image files", () => {
    const pdf = new File(["%PDF"], "doc.pdf", { type: "application/pdf" });
    const data = mockDataTransfer({
      items: [{ kind: "file", type: "application/pdf", file: pdf }],
      files: [pdf],
    });
    assert.equal(imageFileFromDataTransfer(data), null);
  });
});

describe("isEditablePasteTarget", () => {
  it("returns false for null and non-objects", () => {
    assert.equal(isEditablePasteTarget(null), false);
  });

  it("detects common editable targets", () => {
    const asTarget = (v: {
      tagName: string;
      isContentEditable: boolean;
    }) => v as unknown as EventTarget;

    assert.equal(
      isEditablePasteTarget(
        asTarget({ tagName: "INPUT", isContentEditable: false })
      ),
      true
    );
    assert.equal(
      isEditablePasteTarget(
        asTarget({ tagName: "TEXTAREA", isContentEditable: false })
      ),
      true
    );
    assert.equal(
      isEditablePasteTarget(
        asTarget({ tagName: "SELECT", isContentEditable: false })
      ),
      true
    );
    assert.equal(
      isEditablePasteTarget(
        asTarget({ tagName: "DIV", isContentEditable: true })
      ),
      true
    );
    assert.equal(
      isEditablePasteTarget(
        asTarget({ tagName: "DIV", isContentEditable: false })
      ),
      false
    );
  });
});
