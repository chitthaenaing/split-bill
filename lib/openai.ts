import OpenAI from "openai";
import type { ExtractedBill } from "@/types/bill";
import {
  checkBillMath,
  cleanItemName,
  formatCheckForRepair,
  normalizeExtractedBill,
  toExtractedBill,
  type NormalizedBill,
} from "@/lib/bill-extract";
import { checkVatConsistency } from "@/lib/vat-check";

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

/** How many repair attempts after the first extraction. */
const MAX_REPAIR_ATTEMPTS = 1;

export function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local to use receipt extraction."
    );
  }
  return new OpenAI({ apiKey });
}

/**
 * Minimal chat-completions surface used by extraction. Tests inject a scripted
 * client so prompt/repair/finalize regressions are caught without live OpenAI.
 */
export type ExtractionModelClient = {
  chat: {
    completions: {
      create: (
        params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
      ) => Promise<{
        choices: Array<{ message?: { content?: string | null } | null } | null>;
      }>;
    };
  };
};

/** Exported for transcript regression assertions (prompt contract). */
export const EXTRACTION_SYSTEM_PROMPT = `You read photographs of restaurant, cafe, bar and retail receipts and return a clean structured breakdown.

What goes in each field:
- "items": every product / food / drink / merchandise line AND every promotion / discount / free-item line that has a price. Promotions that print as a minus amount (e.g. "Promotion Free Tea -50.00") MUST be included as their own item with a NEGATIVE price. Only combine sub-modifiers / toppings / notes into the parent line when they have NO amount in the price column. Skip headers, dividers, server names, table numbers, payment method lines, change lines, and anything labelled subtotal / total / amount due / tax / VAT / service / tip / rounding.
- "price": the LINE TOTAL printed in the price column for this row — exactly the amount shown next to the item. Do NOT divide by quantity. Do NOT put the unit price here. Use a negative number for promotion / discount lines.
    Examples:
      "3  Latte   12.00"                         -> price=12.00, quantity=3
      "Latte   3 x 4.00   12.00"                -> price=12.00, quantity=3
      "Margherita Pizza 14.50"                  -> price=14.50, quantity=1
      "Promotion Free Tea (Gold Member) -50.00" -> price=-50.00, quantity=1
      "မုန့်ဟင်းခါး / ม็อคฮินกา          60.00"  -> name keeps the original script(s), price=60.00, quantity=1
      "လက်ဖက်ရည်ကြမ်း Burmese Hot Tea   30.00"  -> its OWN item, price=30.00 (never merge into the previous dish)
    If the receipt prints a unit price but no line total, multiply unit \u00d7 quantity yourself and put that LINE TOTAL in "price".
- "quantity": units of this item on this line, as printed. Default 1. Always extract when shown.
- "nameTranslated": a short English gloss of "name" when the printed name is non-Latin, mixed-script, or hard for an English reader (Myanmar, Thai, Chinese, Japanese, Korean, Arabic, etc.). Keep it concise (menu-style). If the printed row already includes English, put that English text here (without repeating the non-Latin script). Use "" when "name" is already plain English / Latin and needs no gloss. Never invent a different dish — translate or romanize the same item only.
- "discount": always 0. Promotions belong in items with a negative price — do not also put them here.
- "tax": TAX / VAT / GST / Sales Tax AMOUNT (not the percentage). If multiple tax lines are shown, sum them.
- "serviceCharge": SERVICE CHARGE / SERVICE / GRATUITY / TIP / AUTO-GRAT amount printed on the receipt (not a handwritten tip unless clearly written as part of the total).
- "rounding": cash-rounding adjustments ("Rounding", "Round Down", "Round Up", "Cash Round"). May be negative. 0 if absent.
- "subtotal": the printed items subtotal BEFORE discount (sum of the positive product lines).
- "total": the printed grand total / amount due.
- "currency": ISO 4217 code (USD, EUR, GBP, THB, JPY, SGD, AUD, MYR, IDR, INR, etc). Infer from symbols (\u00a3=GBP, \u20ac=EUR, \u00a5=JPY, \u0e3f=THB, RM=MYR, Rp=IDR, S$=SGD, A$=AUD). Default to USD only when nothing suggests another currency.
- "taxInclusive": true when tax is already baked into item prices / the subtotal (common in EU, AU, JP, "incl. VAT", and Thai Tax Invoice / ABB lines labelled "Sub Total (Included Vat)" / "Included Vat"). false when tax is added on top of the subtotal (common in US, and some THB receipts that list VAT after a pre-tax subtotal). On inclusive receipts, still extract the printed VAT amount into "tax", but the grand-total equation must NOT add it again — "Net Total" is only a breakdown of the inclusive total.

Accuracy guidance:
- Locale decimals: "1.234,56" means 1234.56 in many EU receipts; "1,234.56" means 1234.56 in US/UK. Always emit a JSON number (1234.56), never a string.
- Thai / Southeast Asian / Burmese receipts often use \u0e3f / THB with VAT 7% and service 5% or 10% calculated on (subtotal + negative promotions). Extract the printed AMOUNTS; do not invent charges.
- Multilingual / non-Latin names: extract EVERY priced product row even when the name is only Myanmar, Thai, Chinese, Japanese, Korean, Arabic, or another non-Latin script — or mixes several scripts with no English. Keep the original script in "name". Put any English gloss in "nameTranslated" (preferred) rather than appending English in parentheses onto "name". Never skip a row because you cannot romanize or translate the name. If the name is illegible but a price is clear, still include the row with name "Unreadable item" and nameTranslated "".
- One price column amount = one item. Walk every amount in the price column top-to-bottom before answering. Small drinks, tea, sides, and bilingual rows between larger dishes are still separate items when they have their own amount — do NOT fold "Burmese Hot Tea" / similar English labels into the previous dish as a translation or modifier if that row has its own price.
- Completeness over omission: emit one item per priced product/promo row. Do NOT drop a priced line to make the math work, and do NOT invent products that are not on the receipt. Prefer a best-effort name (or "Unreadable item") over omitting a real priced line.
- Photos may be rotated or sideways — read the receipt text regardless of orientation.
- Watch for OCR confusables: 0/O, 1/I/l, 5/S, 8/B. Prefer the reading that makes the arithmetic check out.
- Clean item names: drop trailing OCR garbage like "1.." or lone dots. Keep the real product name (any script).
- Before answering, run this self-check and fix anything that fails:
    count(amounts in the price column for products/promos) should equal items.length
    sum(items[i].price where price \u2265 0) \u2248 subtotal
    sum(all items[i].price) + tax + serviceCharge + rounding \u2248 total   (when not taxInclusive)
  If product lines sum short of the printed subtotal, you likely missed a priced row (often a small drink/tea/side, or a bilingual English line between dishes) — re-read every amount in the price column.
  If tax+service make the total too high by a promotion amount, you missed a minus line — add it to items.
  Tolerance is a few cents. If numbers are off, re-examine items and prices.
- If a numeric field really isn't on the receipt, return 0 (don't invent).
- Use the exact item names from the receipt, lightly cleaned of OCR noise (fix obvious mis-reads; preserve capitalisation for Latin text).`;

/** Exported for transcript regression assertions (schema contract). */
export const EXTRACTION_BILL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    currency: {
      type: "string",
      description: "ISO 4217 currency code, e.g. USD, EUR, THB.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          nameTranslated: {
            type: "string",
            description:
              "English gloss of name for non-Latin/mixed names; empty string when unnecessary.",
          },
          price: {
            type: "number",
            description:
              "Line total for this row. Negative for promotion/discount lines.",
          },
          quantity: { type: "number" },
        },
        required: ["name", "nameTranslated", "price", "quantity"],
      },
    },
    tax: { type: "number" },
    serviceCharge: { type: "number" },
    rounding: {
      type: "number",
      description: "Receipt rounding adjustment, 0 if absent.",
    },
    discount: {
      type: "number",
      description: "Always 0. Promotions go in items as negative prices.",
    },
    subtotal: { type: "number" },
    total: { type: "number" },
    taxInclusive: {
      type: "boolean",
      description:
        "True if tax is already included in item prices / subtotal. False if tax is added on top.",
    },
  },
  required: [
    "currency",
    "items",
    "tax",
    "serviceCharge",
    "rounding",
    "discount",
    "subtotal",
    "total",
    "taxInclusive",
  ],
} as const;

export type ExtractionResult = {
  bill: ExtractedBill;
  /** True when the final extraction passes arithmetic reconciliation. */
  reconciled: boolean;
  /** Human-readable issues still present after any repair attempts. */
  warnings: string[];
};

/**
 * Build the API/UI result from a normalized bill: arithmetic status plus soft
 * VAT consistency warnings (warnings may appear even when reconciled is true).
 */
export function finalizeExtraction(bill: NormalizedBill): ExtractionResult {
  const check = checkBillMath(bill);
  const vat = checkVatConsistency(bill);
  return {
    bill: toExtractedBill(bill),
    reconciled: check.ok,
    warnings: [...(check.ok ? [] : check.messages), ...vat.messages],
  };
}

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

async function callModel(
  client: ExtractionModelClient,
  messages: ChatMessage[]
): Promise<NormalizedBill> {
  const response = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "bill",
        strict: true,
        schema: EXTRACTION_BILL_SCHEMA,
      },
    },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("The model returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The model response was not valid JSON.");
  }

  return normalizeExtractedBill(parsed);
}

/**
 * Extract a structured bill using an injected chat-completions client.
 * Production uses the real OpenAI SDK; tests inject scripted transcripts.
 */
export async function extractBillFromImageWithClient(
  imageDataUrl: string,
  client: ExtractionModelClient
): Promise<ExtractionResult> {
  const baseMessages: ChatMessage[] = [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Extract the bill from this receipt photo. Include every priced product/promo row top-to-bottom — including small drinks/tea/sides and bilingual Myanmar/Thai/English lines that have their own price. Do not merge a priced English name into the previous dish. Double-check that the numbers add up before answering.",
        },
        {
          type: "image_url",
          image_url: { url: imageDataUrl, detail: "high" },
        },
      ],
    },
  ];

  let bill = await callModel(client, baseMessages);
  // normalizeExtractedBill already runs reconcileBill; re-check after.
  let check = checkBillMath(bill);

  for (
    let attempt = 0;
    !check.ok && attempt < MAX_REPAIR_ATTEMPTS;
    attempt++
  ) {
    bill = await callModel(client, [
      ...baseMessages,
      {
        role: "assistant",
        content: JSON.stringify(bill),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: formatCheckForRepair(bill, check),
          },
          {
            type: "image_url",
            image_url: { url: imageDataUrl, detail: "high" },
          },
        ],
      },
    ]);
    check = checkBillMath(bill);
  }

  return finalizeExtraction(bill);
}

/**
 * Extract a structured bill from a receipt image.
 *
 * Runs a strict JSON-schema vision call, validates arithmetic, and if the
 * numbers don't reconcile, asks the model once more to repair using the
 * mismatch details + the same image.
 */
export async function extractBillFromImage(
  imageDataUrl: string
): Promise<ExtractionResult> {
  return extractBillFromImageWithClient(imageDataUrl, getClient());
}

const TRANSLATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    translations: {
      type: "array",
      items: { type: "string" },
      description:
        "English glosses in the same order as the input names. Empty string when no gloss is needed.",
    },
  },
  required: ["translations"],
} as const;

/**
 * Translate / gloss a list of receipt item names into short English labels.
 * Returns one string per input (empty when no gloss is useful).
 */
export async function translateItemNames(
  names: string[],
  targetLang = "English"
): Promise<string[]> {
  const cleaned = names.map((n) => cleanItemName(String(n ?? "")).slice(0, 200));
  if (cleaned.length === 0) return [];

  const client = getClient();
  const response = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You translate restaurant receipt line-item names into short ${targetLang} menu-style labels.
Rules:
- Return exactly one translation per input name, same order and length.
- Keep promotions/discounts recognizable (e.g. "Free tea promo").
- If the name is already plain ${targetLang}/Latin and needs no gloss, return "".
- Do not invent a different dish — translate or lightly romanize the same item.
- Be concise; no sentences.`,
      },
      {
        role: "user",
        content: JSON.stringify({ names: cleaned }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "item_translations",
        strict: true,
        schema: TRANSLATE_SCHEMA,
      },
    },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("The model returned an empty response.");
  }

  let parsed: { translations?: unknown };
  try {
    parsed = JSON.parse(raw) as { translations?: unknown };
  } catch {
    throw new Error("The model response was not valid JSON.");
  }

  const list = Array.isArray(parsed.translations) ? parsed.translations : [];
  return cleaned.map((_name, i) => {
    const t = list[i];
    return typeof t === "string" ? t : "";
  });
}
