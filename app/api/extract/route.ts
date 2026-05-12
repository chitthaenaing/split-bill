import { NextResponse } from "next/server";
import { extractBillFromImage } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

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
            { error: "Image is too large (max 8 MB)." },
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

    const bill = await extractBillFromImage(imageDataUrl);
    return NextResponse.json({ bill });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during extraction.";
    console.error("[/api/extract]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
