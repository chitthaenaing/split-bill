import { NextResponse } from "next/server";
import { parseDataUrl } from "@/lib/data-url";
import {
  appendPaymentReceipt,
  deletePaymentReceipt,
  isValidShareId,
  sanitizePayerName,
} from "@/lib/share";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const RECEIPT_ID_RE = /^[A-Za-z0-9]{6,32}$/;

type Body = { imageDataUrl?: string; payerName?: string };

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isValidShareId(id)) {
      return NextResponse.json({ error: "Invalid bill id." }, { status: 400 });
    }

    const body = (await req.json()) as Body;
    const image = body.imageDataUrl
      ? parseDataUrl(body.imageDataUrl)
      : null;
    if (!image) {
      return NextResponse.json(
        { error: "Missing or malformed `imageDataUrl`." },
        { status: 400 }
      );
    }
    if (image.buffer.length > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large (max 8 MB)." },
        { status: 413 }
      );
    }

    const payerName = sanitizePayerName(body.payerName);
    if (!payerName) {
      return NextResponse.json(
        {
          error:
            "Add your name (who is paying) so the bill owner can match this proof.",
        },
        { status: 400 }
      );
    }

    const updated = await appendPaymentReceipt({
      shareId: id,
      imageBuffer: image.buffer,
      imageContentType: image.mime,
      payerName,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Bill not found or sharing is not configured." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      receiptId: updated.entry.id,
      paymentReceipts: updated.bill.paymentReceipts ?? [],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error while uploading proof.";
    const maxed =
      typeof message === "string" && message.includes("maximum number of payment");
    console.error("[/api/share/[id]/payment-receipt]", err);
    return NextResponse.json(
      { error: message },
      { status: maxed ? 413 : 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isValidShareId(id)) {
      return NextResponse.json({ error: "Invalid bill id." }, { status: 400 });
    }

    const body = (await req.json()) as { receiptId?: string };
    const receiptId = String(body.receiptId ?? "");
    if (!RECEIPT_ID_RE.test(receiptId)) {
      return NextResponse.json(
        { error: "Missing or malformed `receiptId`." },
        { status: 400 }
      );
    }

    const updated = await deletePaymentReceipt({ shareId: id, receiptId });
    if (!updated) {
      return NextResponse.json(
        { error: "Bill not found or sharing is not configured." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentReceipts: updated.paymentReceipts ?? [],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error while deleting proof.";
    console.error("[/api/share/[id]/payment-receipt DELETE]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
