import { NextResponse } from "next/server";
import { verifyBearerUser } from "@/lib/auth-request";
import { summarizeStoredBill } from "@/lib/bill-summary";
import { parseDataUrl } from "@/lib/data-url";
import {
  httpStatusFromError,
  readMultipartImage,
} from "@/lib/multipart-image";
import { createShare } from "@/lib/share";
import { recordUserBillLink } from "@/lib/user-bills";
import type { ExtractedBill } from "@/types/bill";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Soft cap after client compression; platform body limit is ~4.5 MB. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BILL_ITEMS = 200;

function sanitizeBill(bill: ExtractedBill): ExtractedBill | null {
  if (!bill || typeof bill !== "object") return null;
  if (!Array.isArray(bill.items)) return null;
  if (bill.items.length > MAX_BILL_ITEMS) return null;

  const items = bill.items
    .map((it) => {
      const name = String(it?.name ?? "").slice(0, 200);
      const nameTranslated = String(it?.nameTranslated ?? "")
        .trim()
        .slice(0, 200);
      return {
        name,
        ...(nameTranslated && nameTranslated !== name
          ? { nameTranslated }
          : {}),
        price: Number(it?.price) || 0,
        quantity: Math.max(1, Math.floor(Number(it?.quantity) || 1)),
      };
    })
    .filter((it) => it.name.length > 0 || it.price > 0);

  return {
    currency: String(bill.currency || "USD").slice(0, 8),
    items,
    tax: Math.max(0, Number(bill.tax) || 0),
    serviceCharge: Math.max(0, Number(bill.serviceCharge) || 0),
    rounding: Number(bill.rounding) || 0,
    discount: Math.max(0, Number(bill.discount) || 0),
    subtotal: Number(bill.subtotal) || 0,
    total: Number(bill.total) || 0,
  };
}

function parseBillJson(raw: unknown): ExtractedBill | null {
  if (typeof raw === "string") {
    try {
      return sanitizeBill(JSON.parse(raw) as ExtractedBill);
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object") {
    return sanitizeBill(raw as ExtractedBill);
  }
  return null;
}

type JsonBody = {
  imageDataUrl?: string;
  bankingQrDataUrl?: string;
  bill?: ExtractedBill;
};

async function parseShareRequest(req: Request): Promise<{
  imageBuffer: Buffer;
  imageContentType: string;
  bankingQrBuffer?: Buffer;
  bankingQrContentType?: string;
  bill: ExtractedBill;
}> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const image = await readMultipartImage(form, "file", MAX_IMAGE_BYTES);
    if (!image) {
      const err = new Error(
        "Missing receipt image. Send multipart field `file`."
      );
      (err as Error & { status: number }).status = 400;
      throw err;
    }

    const bill = parseBillJson(form.get("bill"));
    if (!bill) {
      const err = new Error("Missing or invalid `bill` payload.");
      (err as Error & { status: number }).status = 400;
      throw err;
    }

    let bankingQrBuffer: Buffer | undefined;
    let bankingQrContentType: string | undefined;
    if (form.has("bankingQr")) {
      const qr = await readMultipartImage(form, "bankingQr", MAX_IMAGE_BYTES);
      if (!qr) {
        const err = new Error("Malformed `bankingQr` image.");
        (err as Error & { status: number }).status = 400;
        throw err;
      }
      bankingQrBuffer = qr.buffer;
      bankingQrContentType = qr.mime;
    }

    return {
      imageBuffer: image.buffer,
      imageContentType: image.mime,
      bankingQrBuffer,
      bankingQrContentType,
      bill,
    };
  }

  const body = (await req.json()) as JsonBody;
  const image = body.imageDataUrl ? parseDataUrl(body.imageDataUrl) : null;
  if (!image) {
    const err = new Error("Missing or malformed `imageDataUrl`.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }
  if (image.buffer.length > MAX_IMAGE_BYTES) {
    const err = new Error("Image is too large (max 4 MB after compression).");
    (err as Error & { status: number }).status = 413;
    throw err;
  }

  const bill = body.bill ? sanitizeBill(body.bill) : null;
  if (!bill) {
    const err = new Error("Missing or invalid `bill` payload.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  let bankingQrBuffer: Buffer | undefined;
  let bankingQrContentType: string | undefined;
  if (body.bankingQrDataUrl) {
    const qr = parseDataUrl(body.bankingQrDataUrl);
    if (!qr) {
      const err = new Error(
        "Malformed `bankingQrDataUrl` — expected a base64 image data URL."
      );
      (err as Error & { status: number }).status = 400;
      throw err;
    }
    if (qr.buffer.length > MAX_IMAGE_BYTES) {
      const err = new Error("Banking QR image is too large (max 4 MB).");
      (err as Error & { status: number }).status = 413;
      throw err;
    }
    bankingQrBuffer = qr.buffer;
    bankingQrContentType = qr.mime;
  }

  return {
    imageBuffer: image.buffer,
    imageContentType: image.mime,
    bankingQrBuffer,
    bankingQrContentType,
    bill,
  };
}

export async function POST(req: Request) {
  try {
    const parsed = await parseShareRequest(req);
    const { id, ownerToken, bill } = await createShare(parsed);

    const origin = req.headers.get("origin") || new URL(req.url).origin;
    const url = `${origin}/b/${id}`;

    // If the creator is signed in, index this share under their account.
    // Failures here must not break link creation.
    const user = await verifyBearerUser(req);
    if (user) {
      try {
        await recordUserBillLink({
          uid: user.uid,
          shareId: id,
          role: "shared",
          summary: summarizeStoredBill(bill),
        });
      } catch (err) {
        console.error("[/api/share] failed to index user bill", err);
      }
    }

    return NextResponse.json({ id, url, ownerToken });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error while creating share.";
    const status = httpStatusFromError(err, 500);
    console.error("[/api/share]", err);
    return NextResponse.json({ error: message }, { status });
  }
}
