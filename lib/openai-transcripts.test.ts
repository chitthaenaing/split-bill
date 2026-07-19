import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type OpenAI from "openai";
import {
  EXTRACTION_BILL_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  extractBillFromImageWithClient,
  type ExtractionModelClient,
} from "./openai";

type TranscriptExpect = {
  calls: number;
  reconciled: boolean;
  taxForUi: number;
  total: number;
  itemCount: number;
  hasNegativeItem: boolean;
  hasRepairPrompt: boolean;
  nameTranslatedIncludes?: string[];
  itemNameIncludes?: string[];
};

type TranscriptFixture = {
  id: string;
  description: string;
  imageDataUrl: string;
  responses: Array<{ content: unknown }>;
  expect: TranscriptExpect;
};

type CapturedCall = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

const FIXTURES_DIR = join(process.cwd(), "fixtures", "model-transcripts");

function loadFixtures(): TranscriptFixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      return JSON.parse(
        readFileSync(join(FIXTURES_DIR, f), "utf8")
      ) as TranscriptFixture;
    });
}

function makeScriptedClient(responses: unknown[]): {
  client: ExtractionModelClient;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  let index = 0;
  const client: ExtractionModelClient = {
    chat: {
      completions: {
        create: async (params) => {
          calls.push(params);
          if (index >= responses.length) {
            throw new Error(
              `Unexpected model call #${index + 1}; only ${responses.length} scripted response(s).`
            );
          }
          const payload = responses[index++];
          const content =
            typeof payload === "string" ? payload : JSON.stringify(payload);
          return {
            choices: [{ message: { content } }],
          };
        },
      },
    },
  };
  return { client, calls };
}

function messageText(content: CapturedCall["messages"][number]["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (part && typeof part === "object" && "type" in part) {
        if (part.type === "text" && "text" in part) {
          return String(part.text ?? "");
        }
      }
      return "";
    })
    .join("\n");
}

function assertPromptContract(calls: CapturedCall[]): string[] {
  const failures: string[] = [];
  if (calls.length === 0) {
    failures.push("no model calls captured");
    return failures;
  }

  const first = calls[0];
  const system = first.messages.find((m) => m.role === "system");
  if (!system || messageText(system.content) !== EXTRACTION_SYSTEM_PROMPT) {
    failures.push("first call missing exact EXTRACTION_SYSTEM_PROMPT");
  }

  // Prompt must keep the hard-won guidance for THB VAT, promos, multilingual.
  for (const needle of [
    "taxInclusive",
    "nameTranslated",
    "NEGATIVE",
    "Included Vat",
    "Myanmar",
  ]) {
    if (!EXTRACTION_SYSTEM_PROMPT.includes(needle)) {
      failures.push(`system prompt missing "${needle}"`);
    }
  }

  const format = first.response_format;
  if (
    !format ||
    typeof format !== "object" ||
    format.type !== "json_schema" ||
    format.json_schema?.strict !== true ||
    format.json_schema?.name !== "bill"
  ) {
    failures.push("first call must use strict json_schema named bill");
  } else {
    const schema = format.json_schema.schema as {
      required?: string[];
      properties?: {
        items?: {
          items?: { required?: string[]; properties?: Record<string, unknown> };
        };
      };
    };
    const required = schema.required ?? [];
    for (const key of ["taxInclusive", "items", "discount", "total"]) {
      if (!required.includes(key)) {
        failures.push(`bill schema required[] missing "${key}"`);
      }
    }
    const itemRequired = schema.properties?.items?.items?.required ?? [];
    for (const key of ["name", "nameTranslated", "price", "quantity"]) {
      if (!itemRequired.includes(key)) {
        failures.push(`item schema required[] missing "${key}"`);
      }
    }
    // Keep exported schema and live request schema in lockstep.
    assert.deepEqual(schema, EXTRACTION_BILL_SCHEMA);
  }

  const firstUser = first.messages.find((m) => m.role === "user");
  const firstUserText = firstUser ? messageText(firstUser.content) : "";
  if (!/Extract the bill from this receipt photo/i.test(firstUserText)) {
    failures.push("first user message missing extract instruction");
  }
  if (
    !Array.isArray(firstUser?.content) ||
    !firstUser.content.some(
      (p) => p && typeof p === "object" && "type" in p && p.type === "image_url"
    )
  ) {
    failures.push("first user message must include image_url part");
  }

  return failures;
}

async function evaluateFixture(fixture: TranscriptFixture): Promise<string[]> {
  const failures: string[] = [];
  const scripted = fixture.responses.map((r) => r.content);
  const { client, calls } = makeScriptedClient(scripted);

  const result = await extractBillFromImageWithClient(
    fixture.imageDataUrl,
    client
  );
  const exp = fixture.expect;

  failures.push(...assertPromptContract(calls));

  if (calls.length !== exp.calls) {
    failures.push(`calls: got ${calls.length}, want ${exp.calls}`);
  }
  if (result.reconciled !== exp.reconciled) {
    failures.push(
      `reconciled: got ${result.reconciled}, want ${exp.reconciled}` +
        (result.warnings.length ? ` (${result.warnings.join("; ")})` : "")
    );
  }
  if (result.bill.tax !== exp.taxForUi) {
    failures.push(`taxForUi: got ${result.bill.tax}, want ${exp.taxForUi}`);
  }
  if (result.bill.total !== exp.total) {
    failures.push(`total: got ${result.bill.total}, want ${exp.total}`);
  }
  if (result.bill.items.length !== exp.itemCount) {
    failures.push(
      `itemCount: got ${result.bill.items.length}, want ${exp.itemCount}`
    );
  }

  const hasNegative = result.bill.items.some((it) => it.price < 0);
  if (exp.hasNegativeItem !== hasNegative) {
    failures.push(
      `hasNegativeItem: got ${hasNegative}, want ${exp.hasNegativeItem}`
    );
  }

  const repairTexts = calls.slice(1).flatMap((call) =>
    call.messages
      .filter((m) => m.role === "user")
      .map((m) => messageText(m.content))
  );
  const sawRepair = repairTexts.some((t) =>
    /Previous extraction failed the arithmetic self-check/i.test(t)
  );
  if (exp.hasRepairPrompt !== sawRepair) {
    failures.push(
      `hasRepairPrompt: got ${sawRepair}, want ${exp.hasRepairPrompt}`
    );
  }
  if (exp.hasRepairPrompt) {
    const joined = repairTexts.join("\n");
    if (!/priced product row is likely missing|drinks\/tea|distinct price/i.test(joined)) {
      failures.push("repair prompt missing missing-row guidance");
    }
  }

  for (const gloss of exp.nameTranslatedIncludes ?? []) {
    const hit = result.bill.items.some((it) => it.nameTranslated === gloss);
    if (!hit) {
      failures.push(`missing nameTranslated "${gloss}"`);
    }
  }
  for (const fragment of exp.itemNameIncludes ?? []) {
    const hit = result.bill.items.some((it) => it.name.includes(fragment));
    if (!hit) {
      failures.push(`missing item name fragment "${fragment}"`);
    }
  }

  return failures;
}

describe("model transcript harness", () => {
  it("replays scripted vision responses through extract + repair", async () => {
    const fixtures = loadFixtures();
    assert.ok(
      fixtures.length >= 4,
      `expected ≥4 transcript fixtures, got ${fixtures.length}`
    );

    const required = [
      "th-abb-mislabelled-exclusive",
      "th-promo-local-reconcile",
      "multilingual-missed-tea-repair",
      "th-exclusive-clean",
    ];
    const ids = new Set(fixtures.map((f) => f.id));
    for (const id of required) {
      assert.ok(ids.has(id), `missing transcript fixture ${id}`);
    }

    const failures: string[] = [];
    let passed = 0;

    for (const fixture of fixtures) {
      const issues = await evaluateFixture(fixture);
      if (issues.length === 0) {
        passed += 1;
      } else {
        failures.push(`[${fixture.id}] ${issues.join("; ")}`);
      }
    }

    console.log(`Model transcripts: ${passed}/${fixtures.length} passed`);
    assert.equal(
      failures.length,
      0,
      failures.length ? failures.join("\n") : undefined
    );
  });
});
