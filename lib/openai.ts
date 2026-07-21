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
- "price": the LINE TOTAL printed in the price column for this row — exactly the amount shown next to the item. Do NOT divide by quantity. Do NOT put the unit price here. Use a negative number for promotion / discount lines. When a table has Gross / Dis / Net columns (common on Singapore retail receipts), use the Net amount as "price".
    Examples:
      "3  Latte   12.00"                         -> price=12.00, quantity=3
      "Latte   3 x 4.00   12.00"                -> price=12.00, quantity=3
      "2  Kya Saint                    100.00"  -> price=100.00, quantity=2  (leading qty column; 100 is the LINE TOTAL for both)
      "Margherita Pizza 14.50"                  -> price=14.50, quantity=1
      "Promotion Free Tea (Gold Member) -50.00" -> price=-50.00, quantity=1
      "မုန့်ဟင်းခါး / ม็อคฮินกา          60.00"  -> name keeps the original script(s), price=60.00, quantity=1
      "လက်ဖက်ရည်ကြမ်း Burmese Hot Tea   30.00"  -> its OWN item, price=30.00 (never merge into the previous dish)
    If the receipt prints a unit price but no line total, multiply unit \u00d7 quantity yourself and put that LINE TOTAL in "price".
- "quantity": units of this item on this line, as printed in the qty / count column (often the leftmost number on the row). Do NOT default to 1 when a leading digit is printed. Do NOT confuse Table / Guests / Staff IDs above the items with line quantities. Put the digit in "quantity", not in "name" (name should be "Kya Saint", not "2 Kya Saint"). Only use 1 when the receipt truly shows one unit or omits qty.
- "printedItemUnits": when the receipt prints a footer like "Items: 7" / "Item(s): 7" / "Qty: 7" counting sold units, put that number here. It must equal sum(items[i].quantity). Use 0 when no such count is printed.
- "nameTranslated": a short English gloss of "name" when the printed name is non-Latin, mixed-script, or hard for an English reader (Myanmar, Thai, Chinese, Japanese, Korean, Arabic, etc.). Keep it concise (menu-style). If the printed row already includes English, put that English text here (without repeating the non-Latin script). Use "" when "name" is already plain English / Latin and needs no gloss. Never invent a different dish — translate or romanize the same item only.
- "discount": always 0. Promotions belong in items with a negative price — do not also put them here.
- "tax": TAX / VAT / GST / Sales Tax / ADD GST AMOUNT (not the percentage). If multiple tax lines are shown, sum them. Do NOT invent a tax line from the GST registration number.
- "serviceCharge": SERVICE CHARGE / SERVICE / GRATUITY / TIP / AUTO-GRAT amount printed on the receipt (not a handwritten tip unless clearly written as part of the total).
- "rounding": cash-rounding adjustments ("Rounding", "Round Amount", "Round Down", "Round Up", "Cash Round"). May be negative. When the printed Round Amount reduces the payable total (e.g. Total Amount 44.46 with Round Amount 0.01 and cash due 44.45), store rounding as -0.01. 0 if absent.
- "subtotal": the printed items subtotal BEFORE discount (sum of the positive product lines). On Gross/Dis/Net tables, prefer the sum of Net line amounts when no separate subtotal is printed.
- "total": the printed grand total / amount due (after rounding). Not cash tendered / change.
- "currency": ISO 4217 code when clearly shown or implied by a symbol (\u0e3f=THB, $=USD, \u00a3=GBP, \u20ac=EUR, \u00a5=JPY, RM=MYR, Rp=IDR, S$=SGD, A$=AUD). When the receipt prints bare amounts with NO currency symbol and no currency code, return "" (empty string) — do NOT guess USD or any other code. The app defaults empty currency to THB.
- "taxInclusive": true when tax is already baked into item prices / the subtotal. Common in EU, AU, JP, Singapore (SGD GST — even when labelled "ADD GST"), "incl. VAT" / "incl. GST", and Thai Tax Invoice / ABB lines labelled "Sub Total (Included Vat)" / "Included Vat". false when tax is added on top of the subtotal (common in US, and some THB receipts that list VAT after a pre-tax subtotal). On inclusive receipts, still extract the printed VAT/GST amount into "tax", but the grand-total equation must NOT add it again — "Net Total" / "ADD GST" is only a breakdown of the inclusive total.

Accuracy guidance:
- Locale decimals: "1.234,56" means 1234.56 in many EU receipts; "1,234.56" means 1234.56 in US/UK. Always emit a JSON number (1234.56), never a string.
- Thai / Southeast Asian / Burmese receipts often use \u0e3f / THB with VAT 7% and service 5% or 10% calculated on (subtotal + negative promotions). Extract the printed AMOUNTS; do not invent charges.
- Singapore (SGD) retail / F&B receipts almost always price GST-inclusive. A line like "ADD GST" (or GST amount under Total Amount) is usually an informational breakdown of GST already inside the Net/Total figures — set taxInclusive=true and do not add that GST on top. GST rates have been 8% (2023) or 9% (from 2024); extract the printed amount, do not recompute.
- Multilingual / non-Latin names: extract EVERY priced product row even when the name is only Myanmar, Thai, Chinese, Japanese, Korean, Arabic, or another non-Latin script — or mixes several scripts with no English. Keep the original script in "name". Put any English gloss in "nameTranslated" (preferred) rather than appending English in parentheses onto "name". Never skip a row because you cannot romanize or translate the name. If the name is illegible but a price is clear, still include the row with name "Unreadable item" and nameTranslated "".
- One price column amount = one item. Walk every amount in the price column top-to-bottom before answering. Small drinks, tea, sides, and bilingual rows between larger dishes are still separate items when they have their own amount — do NOT fold "Burmese Hot Tea" / similar English labels into the previous dish as a translation or modifier if that row has its own price.
- Completeness over omission: emit one item per priced product/promo row. Do NOT drop a priced line to make the math work, and do NOT invent products that are not on the receipt. Prefer a best-effort name (or "Unreadable item") over omitting a real priced line.
- Photos may be rotated or sideways — read the receipt text regardless of orientation.
- Watch for OCR confusables: 0/O, 1/I/l, 5/S, 8/B. Prefer the reading that makes the arithmetic check out.
- Clean item names: drop trailing OCR garbage like "1.." or lone dots. Keep the real product name (any script).
- Thai / SEA POS receipts (FoodStory, etc.) often print a dedicated quantity column on the far left of each item row ("2  Kya Saint  100.00"). Read that column for every row. A line total that looks like a round drink/food price with quantity=1 is a common miss when the left digit was actually 2+.
- Before answering, run this self-check and fix anything that fails:
    count(amounts in the price column for products/promos) should equal items.length
    sum(items[i].quantity) should equal printedItemUnits when printedItemUnits > 0 (e.g. "Items: 7")
    sum(items[i].price where price \u2265 0) \u2248 subtotal
    sum(all items[i].price) + tax + serviceCharge + rounding \u2248 total   (when not taxInclusive)
    sum(all items[i].price) + serviceCharge + rounding \u2248 total   (when taxInclusive — do NOT add tax again)
  If sum(quantity) is short of "Items: N", re-read the leftmost digit on every item row — do not leave quantity at 1 when 2+ is printed.
  If product lines sum short of the printed subtotal, you likely missed a priced row (often a small drink/tea/side, or a bilingual English line between dishes) — re-read every amount in the price column.
  If tax+service make the total too high by a promotion amount, you missed a minus line — add it to items.
  If adding GST/VAT makes the total too high by exactly the printed tax (especially SGD "ADD GST" or Thai "Included Vat"), the receipt is taxInclusive — flip the flag instead of inventing a discount.
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
      description:
        "ISO 4217 when a symbol/code is on the receipt (e.g. THB, USD, EUR). Empty string when no currency is printed.",
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
          quantity: {
            type: "number",
            description:
              "Units on this line from the qty column (leading digit). Not the Table/Guests count.",
          },
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
    printedItemUnits: {
      type: "number",
      description:
        "Printed unit count from an Items/Qty footer (e.g. Items: 7). 0 if absent.",
    },
    taxInclusive: {
      type: "boolean",
      description:
        "True if tax is already included in item prices / subtotal (EU/AU/JP/SG GST, Thai Included Vat). False if tax is added on top (typical US).",
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
    "printedItemUnits",
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
          text: "Extract the bill from this receipt photo. Include every priced product/promo row top-to-bottom — including small drinks/tea/sides and bilingual Myanmar/Thai/English lines that have their own price. Read the leftmost quantity digit on each item row (do not default every line to 1). Do not merge a priced English name into the previous dish. Double-check that the numbers — and quantity units vs any Items: N footer — add up before answering.",
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
