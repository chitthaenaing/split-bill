import { NextResponse } from "next/server";
import { parseDataUrl } from "@/lib/data-url";
import {
  httpStatusFromError,
  readMultipartImage,
} from "@/lib/multipart-image";
import { extractPaymentFromImage } from "@/lib/openai-payment";
import { toPublicPaymentReceipt } from "@/lib/public-bill";
import {
  appendPaymentReceipt,
  deletePaymentReceipt,
  getShare,
  isValidShareId,
  ShareAuthError,
  ShareConflictError,
} from "@/lib/share";

export const runtime = "nodejs";
/** Vision extract + blob write. */
export const maxDuration = 90;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const RECEIPT_ID_RE = /^[A-Za-z0-9]{6,32}$/;

async function parseUploadBody(
  req: Request
): Promise<{ buffer: Buffer; mime: string; dataUrl: string }> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const image = await readMultipartImage(form, "file", MAX_IMAGE_BYTES);
    if (!image) {
      const err = new Error(
        "Missing image. Send multipart field `file`."
      );
      (err as Error & { status: number }).status = 400;
      throw err;
    }
    const dataUrl = `data:${image.mime};base64,${image.buffer.toString("base64")}`;
    return { buffer: image.buffer, mime: image.mime, dataUrl };
  }

  const body = (await req.json()) as {
    imageDataUrl?: string;
  };
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
  return {
    buffer: image.buffer,
    mime: image.mime,
    dataUrl: body.imageDataUrl!,
  };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isValidShareId(id)) {
      return NextResponse.json({ error: "Invalid bill id." }, { status: 400 });
    }

    const bill = await getShare(id);
    if (!bill) {
      return NextResponse.json(
        { error: "Bill not found or sharing is not configured." },
        { status: 404 }
      );
    }

    const { buffer, mime, dataUrl } = await parseUploadBody(req);
    const extracted = await extractPaymentFromImage(dataUrl, bill.currency);

    const updated = await appendPaymentReceipt({
      shareId: id,
      imageBuffer: buffer,
      imageContentType: mime,
      payerName: extracted.payerName || null,
      amountPaid: extracted.amount,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Bill not found or sharing is not configured." },
        { status: 404 }
      );
    }

    const paymentReceipts = (updated.bill.paymentReceipts ?? []).map(
      toPublicPaymentReceipt
    );

    return NextResponse.json({
      ok: true,
      receiptId: updated.entry.id,
      deleteToken: updated.deleteToken,
      amountPaid: extracted.amount,
      payerName: extracted.payerName || undefined,
      paymentReceipts,
    });
  } catch (err) {
    if (err instanceof ShareConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message =
      err instanceof Error ? err.message : "Unknown error while uploading proof.";
    const maxed =
      typeof message === "string" &&
      message.includes("maximum number of payment");
    const status = maxed
      ? 413
      : httpStatusFromError(err, 500);
    if (status >= 500) {
      console.error("[/api/share/[id]/payment-receipt]", err);
    }
    return NextResponse.json({ error: message }, { status });
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

    const body = (await req.json()) as {
      receiptId?: string;
      deleteToken?: string;
      ownerToken?: string;
    };
    const receiptId = String(body.receiptId ?? "");
    if (!RECEIPT_ID_RE.test(receiptId)) {
      return NextResponse.json(
        { error: "Missing or malformed `receiptId`." },
        { status: 400 }
      );
    }

    const updated = await deletePaymentReceipt({
      shareId: id,
      receiptId,
      deleteToken: body.deleteToken,
      ownerToken: body.ownerToken,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "Bill not found or sharing is not configured." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentReceipts: (updated.paymentReceipts ?? []).map(
        toPublicPaymentReceipt
      ),
    });
  } catch (err) {
    if (err instanceof ShareAuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ShareConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message =
      err instanceof Error ? err.message : "Unknown error while deleting proof.";
    console.error("[/api/share/[id]/payment-receipt DELETE]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
