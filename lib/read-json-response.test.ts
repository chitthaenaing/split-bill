import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readJsonResponse } from "./read-json-response";

function fakeResponse(
  body: string,
  init: { status?: number; contentType?: string } = {}
): Response {
  const status = init.status ?? 200;
  return new Response(body, {
    status,
    headers: {
      "content-type": init.contentType ?? "application/json",
    },
  });
}

describe("readJsonResponse", () => {
  it("parses valid JSON", async () => {
    const data = await readJsonResponse<{ ok: boolean }>(
      fakeResponse('{"ok":true}')
    );
    assert.equal(data.ok, true);
  });

  it("maps HTML error bodies to a clear message (Safari pattern case)", async () => {
    await assert.rejects(
      () =>
        readJsonResponse(
          fakeResponse("<html>Request Entity Too Large</html>", {
            status: 413,
            contentType: "text/html",
          })
        ),
      /too large/i
    );
  });

  it("maps 500 HTML pages without the Safari pattern message", async () => {
    await assert.rejects(
      () =>
        readJsonResponse(
          fakeResponse("<html>Internal Server Error</html>", {
            status: 500,
            contentType: "text/html",
          })
        ),
      /Server error \(500\)/
    );
  });

  it("surfaces empty error responses", async () => {
    await assert.rejects(
      () => readJsonResponse(fakeResponse("", { status: 502 })),
      /Server error \(502\)/
    );
  });
});
