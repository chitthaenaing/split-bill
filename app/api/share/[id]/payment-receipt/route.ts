import { NextResponse } from "next/server";
import { parseDataUrl } from "@/lib/data-url";
import { appendPaymentReceipt, isValidShareId } from "@/lib/share";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type Body = { imageDataUrl?: string };

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

    const updated = await appendPaymentReceipt({
      shareId: id,
      imageBuffer: image.buffer,
      imageContentType: image.mime,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Bill not found or sharing is not configured." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, paymentReceipts: updated.paymentReceipts ?? [] });
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
