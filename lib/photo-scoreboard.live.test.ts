/**
 * Live vision scoreboard against fixtures/photos/*.json.
 *
 * Skips unless RUN_PHOTO_SCOREBOARD=1 and OPENAI_API_KEY is set.
 * Locked fixtures must pass; unlocked failures are reported but non-fatal.
 *
 *   RUN_PHOTO_SCOREBOARD=1 npm run test:photos:live
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractBillFromImage } from "./openai";
import {
  evaluatePhotoExtraction,
  fetchReceiptDataUrl,
  type PhotoFixture,
} from "./photo-scoreboard";

const FIXTURES_DIR = join(process.cwd(), "fixtures", "photos");
const enabled =
  process.env.RUN_PHOTO_SCOREBOARD === "1" &&
  Boolean(process.env.OPENAI_API_KEY);

function loadFixtures(): PhotoFixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8")) as PhotoFixture
    );
}

describe("photo live vision scoreboard", () => {
  it(
    enabled
      ? "re-extracts Blob receipts and scores against gold"
      : "skipped (set RUN_PHOTO_SCOREBOARD=1 and OPENAI_API_KEY)",
    async () => {
      if (!enabled) {
        console.log(
          "Photo live scoreboard skipped — set RUN_PHOTO_SCOREBOARD=1 and OPENAI_API_KEY"
        );
        return;
      }

      const fixtures = loadFixtures().filter((f) => f.receiptUrl);
      assert.ok(fixtures.length > 0, "no photo fixtures with receiptUrl");

      const lockedFailures: string[] = [];
      const softFailures: string[] = [];
      let passed = 0;

      for (const fixture of fixtures) {
        process.stdout.write(`  live extract ${fixture.id}… `);
        try {
          const dataUrl = await fetchReceiptDataUrl(
            fixture.receiptUrl,
            fixture.receiptContentType || "image/jpeg"
          );
          const result = await extractBillFromImage(dataUrl);
          const score = evaluatePhotoExtraction(
            fixture,
            result.bill,
            result.reconciled
          );
          if (score.failures.length === 0) {
            passed += 1;
            console.log(
              `ok (recall=${(score.itemRecall ?? 0).toFixed(2)} mae=${(score.priceMae ?? 0).toFixed(2)})`
            );
          } else {
            const line = `[${fixture.id}] ${score.failures.join("; ")}`;
            console.log("FAIL");
            if (fixture.locked) lockedFailures.push(line);
            else softFailures.push(line);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const line = `[${fixture.id}] extract error: ${msg}`;
          console.log("ERROR");
          if (fixture.locked) lockedFailures.push(line);
          else softFailures.push(line);
        }
      }

      console.log(
        `Photo live: ${passed}/${fixtures.length} passed` +
          (softFailures.length
            ? `; soft fails: ${softFailures.length}`
            : "")
      );
      if (softFailures.length) {
        console.log("Unlocked failures:\n" + softFailures.join("\n"));
      }
      assert.equal(
        lockedFailures.length,
        0,
        lockedFailures.length
          ? "Locked photo fixtures failed:\n" + lockedFailures.join("\n")
          : undefined
      );
    }
  );
});
