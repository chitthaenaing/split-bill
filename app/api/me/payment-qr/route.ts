import { NextResponse } from "next/server";
import {
  httpStatusFromError,
  readMultipartImage,
} from "@/lib/multipart-image";
import {
  deleteUserPaymentQrBlobs,
  putUserPaymentQr,
} from "@/lib/user-payment-qr";
import {
  bearerTokenFromRequest,
  verifyFirebaseIdToken,
} from "@/lib/verify-id-token";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function requireUid(req: Request): Promise<string | NextResponse> {
  const token = bearerTokenFromRequest(req);
  if (!token) {
    return NextResponse.json(
      { error: "Sign in required. Missing Authorization bearer token." },
      { status: 401 }
    );
  }
  const verified = await verifyFirebaseIdToken(token);
  if (!verified) {
    return NextResponse.json(
      { error: "Invalid or expired sign-in. Please sign in again." },
      { status: 401 }
    );
  }
  return verified.uid;
}

/** Upload / replace the signed-in user's saved payment QR image. */
export async function POST(req: Request) {
  try {
    const uidOrRes = await requireUid(req);
    if (uidOrRes instanceof NextResponse) return uidOrRes;
    const uid = uidOrRes;

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data with a `file` image." },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const image = await readMultipartImage(form, "file", MAX_IMAGE_BYTES);
    if (!image) {
      return NextResponse.json(
        { error: "Missing or invalid `file` image." },
        { status: 400 }
      );
    }

    const saved = await putUserPaymentQr({
      uid,
      buffer: image.buffer,
      contentType: image.mime,
    });

    return NextResponse.json({
      url: saved.url,
      contentType: saved.contentType,
    });
  } catch (err) {
    const status = httpStatusFromError(err, 500);
    const message =
      err instanceof Error ? err.message : "Could not save payment QR.";
    console.error("[POST /api/me/payment-qr]", err);
    return NextResponse.json({ error: message }, { status });
  }
}

/** Remove the signed-in user's saved payment QR from Blob storage. */
export async function DELETE(req: Request) {
  try {
    const uidOrRes = await requireUid(req);
    if (uidOrRes instanceof NextResponse) return uidOrRes;

    await deleteUserPaymentQrBlobs(uidOrRes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = httpStatusFromError(err, 500);
    const message =
      err instanceof Error ? err.message : "Could not delete payment QR.";
    console.error("[DELETE /api/me/payment-qr]", err);
    return NextResponse.json({ error: message }, { status });
  }
}
