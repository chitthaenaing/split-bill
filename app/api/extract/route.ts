import { NextResponse } from "next/server";
import { extractBillFromImage } from "@/lib/openai";

export const runtime = "nodejs";
/** Two vision calls (extract + repair) can take a while on large photos. */
export const maxDuration = 90;

/**
 * Soft cap after the platform body limit (~4.5 MB on Vercel). Client prep
 * targets 3 MB; this rejects anything that still slips through.
 */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let imageDataUrl: string | null = null;

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as { imageDataUrl?: string };
      imageDataUrl = body.imageDataUrl ?? null;
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (file && file instanceof File) {
        if (file.size > MAX_BYTES) {
          return NextResponse.json(
            { error: "Image is too large (max 4 MB after compression)." },
            { status: 413 }
          );
        }
        const buf = Buffer.from(await file.arrayBuffer());
        const mime = file.type || "image/jpeg";
        imageDataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      }
    }

    if (!imageDataUrl) {
      return NextResponse.json(
        { error: "Missing image. Send `file` (multipart) or `imageDataUrl` (JSON)." },
        { status: 400 }
      );
    }

    if (!imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Expected an image data URL." },
        { status: 400 }
      );
    }

    // Rough base64 size guard for JSON uploads (data URL length ≈ 4/3 bytes).
    const approxBytes = Math.floor(((imageDataUrl.split(",")[1] || "").length * 3) / 4);
    if (approxBytes > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image is too large (max 4 MB after compression)." },
        { status: 413 }
      );
    }

    const result = await extractBillFromImage(imageDataUrl);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during extraction.";
    console.error("[/api/extract]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
