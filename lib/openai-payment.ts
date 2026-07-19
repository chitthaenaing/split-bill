import type OpenAI from "openai";
import type { ExtractedPaymentSlip } from "@/types/bill";
import { DEFAULT_MODEL, getClient, type ExtractionModelClient } from "@/lib/openai";
import { normalizeExtractedPayment } from "@/lib/payment-extract";

/** Exported for tests / prompt contract. */
export const PAYMENT_SLIP_SYSTEM_PROMPT = `You read photographs or screenshots of bank transfers, PromptPay, PayNow, PayPal, Venmo, Wise, and similar payment confirmations.

Return structured fields for ONE successful transfer:
- "amount": the money that was SENT / transferred (not the fee, not the remaining balance, not "available balance"). Prefer the large confirmation amount labelled transfer / paid / sent / amount / สำเร็จ / โอนเงิน. Always a positive JSON number.
- "payerName": the SENDER's name when shown (From / Sender / ผู้โอน / Account name of the payer). Prefer a person's name over a bank name or account number. Use "" when no sender name is readable.
- "currency": ISO 4217 when clearly shown or implied by symbols (฿→THB, S$→SGD, RM→MYR, Rp→IDR, £→GBP, €→EUR, ¥→JPY, $ alone → USD unless the UI is clearly another dollar currency). Use "" when unknown.

Rules:
- Ignore failed / pending / cancelled transfers — if the slip is not a successful payment, set amount to 0.
- Locale decimals: "1.234,56" → 1234.56; "1,234.56" → 1234.56. Emit a JSON number.
- Do not invent a payer name from the recipient / shop / PromptPay ID.
- Photos may be rotated; read the text regardless of orientation.
- If multiple amounts appear, pick the transfer amount (usually the largest confirmation figure, excluding account balances).`;

export const PAYMENT_SLIP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    amount: {
      type: "number",
      description: "Transfer amount sent. 0 if unreadable or not a successful transfer.",
    },
    payerName: {
      type: "string",
      description: "Sender name when printed; empty string if absent.",
    },
    currency: {
      type: "string",
      description: "ISO 4217 code when known; empty string otherwise.",
    },
  },
  required: ["amount", "payerName", "currency"],
} as const;

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

async function callPaymentModel(
  client: ExtractionModelClient,
  imageDataUrl: string,
  expectedCurrency?: string
): Promise<ExtractedPaymentSlip | null> {
  const currencyHint = expectedCurrency
    ? ` The shared bill is in ${expectedCurrency}; prefer that currency when the slip is ambiguous.`
    : "";

  const messages: ChatMessage[] = [
    { role: "system", content: PAYMENT_SLIP_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Extract the transfer amount and sender name from this payment screenshot.${currencyHint}`,
        },
        {
          type: "image_url",
          image_url: { url: imageDataUrl, detail: "high" },
        },
      ],
    },
  ];

  const response = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "payment_slip",
        strict: true,
        schema: PAYMENT_SLIP_SCHEMA,
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

  return normalizeExtractedPayment(parsed);
}

export async function extractPaymentFromImageWithClient(
  imageDataUrl: string,
  client: ExtractionModelClient,
  expectedCurrency?: string
): Promise<ExtractedPaymentSlip> {
  const result = await callPaymentModel(client, imageDataUrl, expectedCurrency);
  if (!result) {
    throw Object.assign(
      new Error(
        "Couldn't read a transfer amount from this screenshot. Try a clearer photo of the successful payment."
      ),
      { status: 422 }
    );
  }
  return result;
}

/** Vision-extract amount + sender from a bank / wallet transfer screenshot. */
export async function extractPaymentFromImage(
  imageDataUrl: string,
  expectedCurrency?: string
): Promise<ExtractedPaymentSlip> {
  return extractPaymentFromImageWithClient(
    imageDataUrl,
    getClient(),
    expectedCurrency
  );
}
