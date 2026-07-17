import OpenAI from "openai";
import type { ExtractedBill } from "@/types/bill";
import {
  checkBillMath,
  formatCheckForRepair,
  normalizeExtractedBill,
  toExtractedBill,
  type NormalizedBill,
} from "@/lib/bill-extract";

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

const SYSTEM_PROMPT = `You read photographs of restaurant, cafe, bar and retail receipts and return a clean structured breakdown.

What goes in each field:
- "items": every product / food / drink / merchandise line that has a price (including priced modifiers like "+ Extra shot 1.00", sides, and discount lines with a negative amount). Combine unpriced sub-modifiers / toppings / notes into the parent line's name. Skip headers, dividers, server names, table numbers, payment method lines, change lines, and anything labelled subtotal / total / amount due / tax / VAT / service / tip / rounding.
- "price": the LINE TOTAL printed in the price column for this row — exactly the amount shown next to the item. Do NOT divide by quantity. Do NOT put the unit price here.
    Examples:
      "3  Latte   12.00"              -> price=12.00, quantity=3
      "Latte   3 x 4.00   12.00"     -> price=12.00, quantity=3
      "Margherita Pizza 14.50"       -> price=14.50, quantity=1
      "Discount          -2.00"      -> price=-2.00, quantity=1
    If the receipt prints a unit price but no line total, multiply unit \u00d7 quantity yourself and put that LINE TOTAL in "price".
- "quantity": units of this item on this line, as printed. Default 1. Always extract when shown.
- "tax": TAX / VAT / GST / Sales Tax AMOUNT (not the percentage). If multiple tax lines are shown, sum them.
- "serviceCharge": SERVICE CHARGE / SERVICE / GRATUITY / TIP / AUTO-GRAT amount printed on the receipt (not a handwritten tip unless clearly written as part of the total).
- "rounding": cash-rounding adjustments ("Rounding", "Round Down", "Round Up", "Cash Round"). May be negative. 0 if absent.
- "subtotal": the printed items subtotal (before tax+service on tax-exclusive receipts; usually equals sum of item line totals).
- "total": the printed grand total / amount due.
- "currency": ISO 4217 code (USD, EUR, GBP, THB, JPY, SGD, AUD, MYR, IDR, INR, etc). Infer from symbols (\u00a3=GBP, \u20ac=EUR, \u00a5=JPY, \u0e3f=THB, RM=MYR, Rp=IDR, S$=SGD, A$=AUD). Default to USD only when nothing suggests another currency.
- "taxInclusive": true when tax is already baked into item prices / the subtotal (common in EU, AU, JP, "incl. VAT"). false when tax is added on top of the subtotal (common in US).

Accuracy guidance:
- Locale decimals: "1.234,56" means 1234.56 in many EU receipts; "1,234.56" means 1234.56 in US/UK. Always emit a JSON number (1234.56), never a string.
- Watch for OCR confusables: 0/O, 1/I/l, 5/S, 8/B. Prefer the reading that makes the arithmetic check out.
- Discount / promo / coupon lines belong in "items" with a negative price (or reduce the parent line if clearly attached).
- Before answering, run this self-check and fix anything that fails:
    sum(items[i].price) \u2248 subtotal
    if taxInclusive:  subtotal + serviceCharge + rounding \u2248 total
    else:             subtotal + tax + serviceCharge + rounding \u2248 total
  Tolerance is a few cents. If numbers are off, re-examine items and prices.
- If a value really isn't on the receipt, return 0 (don't invent). Prefer omitting a doubtful item over inventing one.
- Use the exact item names from the receipt, lightly cleaned of OCR noise (fix obvious mis-reads, preserve capitalisation).`;

const BILL_SCHEMA = {
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
          price: {
            type: "number",
            description:
              "The line total printed in the price column for this row. Not the unit price. May be negative for discounts.",
          },
          quantity: { type: "number" },
        },
        required: ["name", "price", "quantity"],
      },
    },
    tax: { type: "number" },
    serviceCharge: { type: "number" },
    rounding: {
      type: "number",
      description: "Receipt rounding adjustment, 0 if absent.",
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

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

async function callModel(
  client: OpenAI,
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
        schema: BILL_SCHEMA,
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
 * Extract a structured bill from a receipt image.
 *
 * Runs a strict JSON-schema vision call, validates arithmetic, and if the
 * numbers don't reconcile, asks the model once more to repair using the
 * mismatch details + the same image.
 */
export async function extractBillFromImage(
  imageDataUrl: string
): Promise<ExtractionResult> {
  const client = getClient();

  const baseMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Extract the bill from this receipt photo. Double-check that the numbers add up before answering.",
        },
        {
          type: "image_url",
          image_url: { url: imageDataUrl, detail: "high" },
        },
      ],
    },
  ];

  let bill = await callModel(client, baseMessages);
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

  return {
    bill: toExtractedBill(bill),
    reconciled: check.ok,
    warnings: check.ok ? [] : check.messages,
  };
}
