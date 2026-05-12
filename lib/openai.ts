import OpenAI from "openai";
import type { ExtractedBill } from "@/types/bill";

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

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
- "items": every line that has a product name and a price. Combine sub-modifiers / toppings / notes into the parent line when they have no price of their own. Skip headers, dividers, server names, table numbers, payment lines, and anything labelled "subtotal" or "total".
- "price": the LINE total printed in the price column for this row — exactly the amount shown next to the item on the receipt. Do NOT divide by quantity. Examples:
    "3  Latte   12.00"        -> price=12.00, quantity=3
    "Latte   3 x 4.00   12.00" -> price=12.00, quantity=3
    "Margherita Pizza 14.50"   -> price=14.50, quantity=1
  If the receipt prints a unit price but no line total, multiply unit \u00d7 quantity yourself and put the LINE TOTAL in "price".
- "quantity": the number of units of this item on this line, as printed. Default 1. Always extract when the receipt shows it.
- "tax": TAX / VAT / GST / Sales Tax amount. If multiple tax lines are shown, sum them.
- "serviceCharge": SERVICE CHARGE / SERVICE / GRATUITY / TIP / AUTO-GRAT.
- "rounding": cash-rounding adjustments (lines like "Rounding", "Round Down", "Round Up", "Cash Round"). May be negative. 0 if absent.
- "subtotal": items before tax + service, as printed on the receipt.
- "total": the grand total printed on the receipt.
- "currency": ISO 4217 code (USD, EUR, GBP, THB, JPY, SGD, AUD, MYR, IDR, INR, etc). Infer from symbols (\u00a3 = GBP, \u20ac = EUR, \u00a5 = JPY, \u0e3f = THB, RM = MYR, Rp = IDR, S$ = SGD, A$ = AUD). Default to USD only when nothing on the receipt suggests another currency.

Accuracy guidance:
- Decimal points and thousand separators vary by locale. "1.234,56" means 1234.56 in many EU receipts. Re-read prices carefully.
- Watch for OCR confusables: 0/O, 1/I/l, 5/S, 8/B. Cross-check by verifying that sum(price * quantity) is approximately equal to "subtotal".
- Tax-inclusive receipts (common in EU/AU/JP): tax may already be baked into item prices. If the receipt prints tax as informational ("incl. VAT 7%"), still extract the printed tax AMOUNT into "tax", but do NOT subtract it from item prices.
- Before answering, run this self-check:
    sum(items[i].price) \u2248 subtotal
    subtotal + tax + serviceCharge + rounding \u2248 total
  If the numbers are off by more than a few cents, re-examine the items and prices and fix them.
- If a value really isn't on the receipt, return 0 (don't invent).
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
              "The line total printed in the price column for this row. Not the unit price.",
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
  },
  required: [
    "currency",
    "items",
    "tax",
    "serviceCharge",
    "rounding",
    "subtotal",
    "total",
  ],
} as const;

export async function extractBillFromImage(
  imageDataUrl: string
): Promise<ExtractedBill> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the bill from this receipt photo.",
          },
          {
            type: "image_url",
            image_url: { url: imageDataUrl, detail: "high" },
          },
        ],
      },
    ],
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

  let parsed: ExtractedBill;
  try {
    parsed = JSON.parse(raw) as ExtractedBill;
  } catch {
    throw new Error("The model response was not valid JSON.");
  }

  return {
    currency: parsed.currency || "USD",
    items: (parsed.items || []).map((it) => ({
      name: it.name || "",
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1,
    })),
    tax: Number(parsed.tax) || 0,
    serviceCharge: Number(parsed.serviceCharge) || 0,
    rounding: Number(parsed.rounding) || 0,
    subtotal: Number(parsed.subtotal) || 0,
    total: Number(parsed.total) || 0,
  };
}
