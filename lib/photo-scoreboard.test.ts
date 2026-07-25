import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluatePhotoGold,
  type PhotoFixture,
} from "./photo-scoreboard";

const FIXTURES_DIR = join(process.cwd(), "fixtures", "photos");

function loadFixtures(): PhotoFixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      return JSON.parse(
        readFileSync(join(FIXTURES_DIR, f), "utf8")
      ) as PhotoFixture;
    });
}

describe("photo fixture gold scoreboard (offline)", () => {
  it("keeps locked Blob receipt gold labels self-consistent", () => {
    const fixtures = loadFixtures();
    assert.ok(
      fixtures.length >= 3,
      `expected ≥3 photo fixtures, got ${fixtures.length}`
    );

    const required = [
      "blob-TgBHtkvDzE-shwe-daily-special",
      "blob-UiAJOpWQsq-leading-qty",
      "blob-Ch1yPfjeCx-promo-minus",
      "blob-kmTL56WhbE-xiaomi-myr",
      "blob-qqbz9Ka12A-daily-special-pair",
    ];
    const ids = new Set(fixtures.map((f) => f.id));
    for (const id of required) {
      assert.ok(ids.has(id), `missing photo fixture ${id}`);
    }

    const failures: string[] = [];
    let passed = 0;

    for (const fixture of fixtures) {
      assert.ok(fixture.receiptUrl, `${fixture.id}: receiptUrl required`);
      assert.equal(typeof fixture.locked, "boolean", `${fixture.id}: locked`);
      const issues = evaluatePhotoGold(fixture);
      if (issues.length === 0) {
        passed += 1;
      } else {
        failures.push(`[${fixture.id}] ${issues.join("; ")}`);
      }
    }

    console.log(`Photo gold fixtures: ${passed}/${fixtures.length} passed`);
    assert.equal(
      failures.length,
      0,
      failures.length ? failures.join("\n") : undefined
    );
  });
});
