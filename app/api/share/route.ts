import { NextResponse } from "next/server";
import { parseDataUrl } from "@/lib/data-url";
import { createShare } from "@/lib/share";
import type { ExtractedBill } from "@/types/bill";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BILL_ITEMS = 200;

type Body = {
  imageDataUrl?: string;
  bankingQrDataUrl?: string;
  bill?: ExtractedBill;
};

function sanitizeBill(bill: ExtractedBill): ExtractedBill | null {
  if (!bill || typeof bill !== "object") return null;
  if (!Array.isArray(bill.items)) return null;
  if (bill.items.length > MAX_BILL_ITEMS) return null;

  const items = bill.items
    .map((it) => ({
      name: String(it?.name ?? "").slice(0, 200),
      price: Number(it?.price) || 0,
      quantity: Math.max(1, Math.floor(Number(it?.quantity) || 1)),
    }))
    .filter((it) => it.name.length > 0 || it.price > 0);

  return {
    currency: String(bill.currency || "USD").slice(0, 8),
    items,
    tax: Math.max(0, Number(bill.tax) || 0),
    serviceCharge: Math.max(0, Number(bill.serviceCharge) || 0),
    rounding: Number(bill.rounding) || 0,
    subtotal: Number(bill.subtotal) || 0,
    total: Number(bill.total) || 0,
  };
}

export async function POST(req: Request) {
  try {
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

    const bill = body.bill ? sanitizeBill(body.bill) : null;
    if (!bill) {
      return NextResponse.json(
        { error: "Missing or invalid `bill` payload." },
        { status: 400 }
      );
    }

    let bankingQrBuffer: Buffer | undefined;
    let bankingQrContentType: string | undefined;
    if (body.bankingQrDataUrl) {
      const qr = parseDataUrl(body.bankingQrDataUrl);
      if (!qr) {
        return NextResponse.json(
          { error: "Malformed `bankingQrDataUrl` — expected a base64 image data URL." },
          { status: 400 }
        );
      }
      if (qr.buffer.length > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "Banking QR image is too large (max 8 MB)." },
          { status: 413 }
        );
      }
      bankingQrBuffer = qr.buffer;
      bankingQrContentType = qr.mime;
    }

    const { id } = await createShare({
      imageBuffer: image.buffer,
      imageContentType: image.mime,
      bill,
      bankingQrBuffer,
      bankingQrContentType,
    });

    const origin = req.headers.get("origin") || new URL(req.url).origin;
    const url = `${origin}/b/${id}`;

    return NextResponse.json({ id, url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error while creating share.";
    console.error("[/api/share]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
