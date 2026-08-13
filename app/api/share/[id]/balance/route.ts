import { NextResponse } from "next/server";
import { computePaymentBalance, isBillSettled } from "@/lib/payment-balance";
import { unpaidParticipants } from "@/lib/participants";
import { getShare, isValidShareId } from "@/lib/share";
import { payersFromBalance } from "@/lib/user-bill-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight public balance for a share — used by My bills to show per-person
 * paid / unpaid totals without loading the full share page.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isValidShareId(id)) {
    return NextResponse.json({ error: "Invalid share id" }, { status: 400 });
  }

  const bill = await getShare(id);
  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const receipts = bill.paymentReceipts ?? [];
  const balance = computePaymentBalance(bill, receipts);
  const payers = payersFromBalance(balance.byPayer);
  const roster = bill.participants ?? [];
  const hasRoster = roster.length > 0;
  const unpaid = hasRoster ? unpaidParticipants(roster, receipts) : [];
  return NextResponse.json({
    shareId: id,
    currency: bill.currency || "THB",
    total: balance.billTotal,
    paidTotal: balance.paidTotal,
    remaining: balance.remaining,
    settled: isBillSettled(balance.remaining),
    itemCount: bill.items.length,
    payers,
    unpaid,
    hasRoster,
    ...(bill.receiptUrl ? { receiptUrl: bill.receiptUrl } : {}),
  });
}
