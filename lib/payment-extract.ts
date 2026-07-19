import type { ExtractedPaymentSlip } from "@/types/bill";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const MAX_PAYER_NAME_LEN = 40;

/**
 * Coerce raw model JSON for a payment-slip scan into a clean result.
 * Returns null when the transfer amount cannot be read.
 */
export function normalizeExtractedPayment(
  raw: unknown
): ExtractedPaymentSlip | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const amount = Number(o.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    return null;
  }
  const payerName = String(o.payerName ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_PAYER_NAME_LEN);
  const currency = String(o.currency ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 8);

  return {
    amount: round2(amount),
    payerName,
    currency,
  };
}
