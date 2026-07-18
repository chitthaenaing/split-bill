import { NextResponse } from "next/server";
import { cleanItemName } from "@/lib/bill-extract";
import { translateItemNames } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_NAMES = 200;

type Body = {
  names?: unknown;
  targetLang?: unknown;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!Array.isArray(body.names)) {
      return NextResponse.json(
        { error: "Missing `names` array." },
        { status: 400 }
      );
    }
    if (body.names.length === 0) {
      return NextResponse.json({ translations: [] });
    }
    if (body.names.length > MAX_NAMES) {
      return NextResponse.json(
        { error: `Too many names (max ${MAX_NAMES}).` },
        { status: 400 }
      );
    }

    const names = body.names.map((n) =>
      cleanItemName(String(n ?? "")).slice(0, 200)
    );
    const targetLang =
      typeof body.targetLang === "string" && body.targetLang.trim()
        ? body.targetLang.trim().slice(0, 40)
        : "English";

    const translations = await translateItemNames(names, targetLang);
    return NextResponse.json({ translations });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during translation.";
    console.error("[/api/translate-items]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
